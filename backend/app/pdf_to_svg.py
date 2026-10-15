from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from .sanitize import _read_pdf

router = APIRouter()

COMMAND_TIMEOUT_SECONDS = 120
PAGE_COUNT_TIMEOUT_SECONDS = 30
MIN_RASTER_DPI = 72
MAX_RASTER_DPI = 300
MAX_PAGES = 100
MAX_PAGE_NUMBER = 10_000
MAX_SINGLE_SVG_BYTES = 64 * 1024 * 1024
MAX_AGGREGATE_SVG_BYTES = 250 * 1024 * 1024
MAX_ARCHIVE_BYTES = 250 * 1024 * 1024
PAGE_COUNT_RE = re.compile(r"^Pages:\s*(\d+)\s*$", re.MULTILINE)


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C.UTF-8"
    return env


def _require_poppler() -> None:
    try:
        for command in (["pdftocairo", "-v"], ["pdfinfo", "-v"]):
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
                env=_command_env(),
            )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="Poppler SVG conversion engine is unavailable") from exc


def _run(command: list[str], *, timeout: int = COMMAND_TIMEOUT_SECONDS) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDF to SVG conversion timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Poppler SVG conversion engine is unavailable") from exc


def _poppler_error(result: subprocess.CompletedProcess[bytes], fallback: str) -> HTTPException:
    detail = (result.stderr or result.stdout or fallback.encode()).decode(
        "utf-8", errors="replace"
    ).strip()[-1200:]
    lowered = detail.lower()
    if "password" in lowered or "encrypted" in lowered:
        return HTTPException(status_code=401, detail="PDF password is required or invalid")
    return HTTPException(status_code=422, detail=detail or fallback)


def _page_count(input_path: Path, password: str | None) -> int:
    base = ["pdfinfo"]
    if password:
        attempts = [
            [*base, "-upw", password, str(input_path)],
            [*base, "-opw", password, str(input_path)],
        ]
    else:
        attempts = [[*base, str(input_path)]]

    result: subprocess.CompletedProcess[bytes] | None = None
    for index, command in enumerate(attempts):
        result = _run(command, timeout=PAGE_COUNT_TIMEOUT_SECONDS)
        if result.returncode == 0:
            break
        if index == len(attempts) - 1:
            raise _poppler_error(result, "Could not inspect PDF page count")
    else:
        raise HTTPException(status_code=422, detail="Could not inspect PDF page count")

    text = (result.stdout if result is not None else b"").decode("utf-8", errors="replace")
    match = PAGE_COUNT_RE.search(text)
    if not match:
        raise HTTPException(status_code=422, detail="Could not determine PDF page count")
    count = int(match.group(1))
    if count < 1:
        raise HTTPException(status_code=422, detail="PDF contains no pages")
    return count


def _validate_svg(path: Path) -> int:
    if not path.is_file():
        raise HTTPException(status_code=500, detail="Poppler did not produce an SVG file")
    size = path.stat().st_size
    if size <= 0:
        raise HTTPException(status_code=422, detail="Poppler produced an empty SVG")
    if size > MAX_SINGLE_SVG_BYTES:
        raise HTTPException(status_code=413, detail="A generated SVG page exceeds the 64 MB limit")

    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as exc:
        raise HTTPException(status_code=502, detail="Poppler returned malformed SVG XML") from exc
    if root.tag.split("}")[-1].lower() != "svg":
        raise HTTPException(status_code=502, detail="Poppler returned an invalid SVG root element")
    return size


def _render_svg_page(
    input_path: Path,
    output_path: Path,
    *,
    page: int,
    password: str | None,
    raster_dpi: int,
) -> int:
    base = [
        "pdftocairo",
        "-svg",
        "-r",
        str(raster_dpi),
        "-f",
        str(page),
        "-l",
        str(page),
    ]
    if password:
        attempts = [
            [*base, "-upw", password, str(input_path), str(output_path)],
            [*base, "-opw", password, str(input_path), str(output_path)],
        ]
    else:
        attempts = [[*base, str(input_path), str(output_path)]]

    result: subprocess.CompletedProcess[bytes] | None = None
    for index, command in enumerate(attempts):
        output_path.unlink(missing_ok=True)
        result = _run(command)
        if result.returncode == 0 and output_path.is_file():
            return _validate_svg(output_path)
        if index == len(attempts) - 1:
            raise _poppler_error(result, "pdftocairo SVG conversion failed")
    raise HTTPException(status_code=422, detail="pdftocairo SVG conversion failed")


def _convert_pdf_to_svg(
    data: bytes,
    work_dir: Path,
    *,
    password: str | None,
    first_page: int | None,
    last_page: int | None,
    raster_dpi: int,
) -> tuple[Path, int, bool, int]:
    _require_poppler()
    if first_page is not None and last_page is not None and first_page > last_page:
        raise HTTPException(status_code=422, detail="First page cannot be greater than last page")

    input_path = work_dir / "input.pdf"
    input_path.write_bytes(data)
    total_pages = _page_count(input_path, password)

    start = first_page or 1
    end = last_page or total_pages
    if start > total_pages:
        raise HTTPException(status_code=422, detail="First page exceeds PDF page count")
    if end > total_pages:
        raise HTTPException(status_code=422, detail="Last page exceeds PDF page count")

    selected_pages = end - start + 1
    if selected_pages > MAX_PAGES:
        raise HTTPException(status_code=413, detail=f"PDF to SVG is limited to {MAX_PAGES} pages per request")

    svg_dir = work_dir / "svg-pages"
    svg_dir.mkdir(parents=True, exist_ok=True)
    width = max(3, len(str(total_pages)))
    aggregate_bytes = 0
    outputs: list[Path] = []

    for page in range(start, end + 1):
        output_path = svg_dir / f"page_{page:0{width}d}.svg"
        aggregate_bytes += _render_svg_page(
            input_path,
            output_path,
            page=page,
            password=password,
            raster_dpi=raster_dpi,
        )
        if aggregate_bytes > MAX_AGGREGATE_SVG_BYTES:
            raise HTTPException(status_code=413, detail="Generated SVG pages exceed the 250 MB aggregate limit")
        outputs.append(output_path)

    if selected_pages == 1:
        return outputs[0], selected_pages, False, start

    archive_path = work_dir / "solyan-pdf-svg.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for output_path in outputs:
            archive.write(output_path, arcname=output_path.name)

    if not archive_path.is_file():
        raise HTTPException(status_code=500, detail="SVG ZIP output was not created")
    if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise HTTPException(status_code=413, detail="Generated SVG ZIP exceeds the 250 MB limit")
    return archive_path, selected_pages, True, start


@router.post("/pdf/to-svg")
def pdf_to_svg(
    file: UploadFile = File(...),
    password: str | None = Form(default=None, max_length=128),
    first_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    last_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    raster_dpi: int = Form(default=150, ge=MIN_RASTER_DPI, le=MAX_RASTER_DPI),
) -> FileResponse:
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-pdf-svg-"))
    try:
        output_path, pages, is_archive, start_page = _convert_pdf_to_svg(
            data,
            work_dir,
            password=password or None,
            first_page=first_page,
            last_page=last_page,
            raster_dpi=raster_dpi,
        )
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    if is_archive:
        media_type = "application/zip"
        filename = "solyan-pdf-svg.zip"
    else:
        media_type = "image/svg+xml"
        filename = f"solyan-pdf-page-{start_page}.svg"

    return FileResponse(
        path=output_path,
        media_type=media_type,
        filename=filename,
        headers={
            "X-SolYan-SVG-Pages": str(pages),
            "X-SolYan-SVG-Raster-DPI": str(raster_dpi),
        },
        background=BackgroundTask(shutil.rmtree, work_dir, True),
    )
