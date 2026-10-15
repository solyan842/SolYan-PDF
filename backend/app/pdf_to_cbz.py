from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .sanitize import _read_pdf

router = APIRouter()

COMMAND_TIMEOUT_SECONDS = 240
MAX_DPI = 300
MIN_DPI = 72
MAX_PAGES = 1_000
MAX_CBZ_BYTES = 500 * 1024 * 1024
PAGE_COUNT_RE = re.compile(r"^Pages:\s*(\d+)\s*$", re.MULTILINE)


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C.UTF-8"
    return env


def _require_poppler() -> None:
    try:
        subprocess.run(
            ["pdftoppm", "-v"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            env=_command_env(),
        )
        subprocess.run(
            ["pdfinfo", "-v"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            env=_command_env(),
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="Poppler PDF rendering engine is unavailable") from exc


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
        raise HTTPException(status_code=504, detail="PDF to CBZ conversion timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Poppler PDF rendering engine is unavailable") from exc


def _password_attempts(base: list[str], password: str | None, input_path: Path) -> list[list[str]]:
    if password:
        return [
            [*base, "-upw", password, str(input_path)],
            [*base, "-opw", password, str(input_path)],
        ]
    return [[*base, str(input_path)]]


def _run_password_aware(base: list[str], password: str | None, input_path: Path) -> subprocess.CompletedProcess[bytes]:
    attempts = _password_attempts(base, password, input_path)
    result: subprocess.CompletedProcess[bytes] | None = None
    for index, command in enumerate(attempts):
        result = _run(command)
        if result.returncode == 0:
            return result
        if index != len(attempts) - 1:
            continue
        detail = (result.stderr or result.stdout or b"Poppler conversion failed").decode(
            "utf-8", errors="replace"
        ).strip()[-1200:]
        lowered = detail.lower()
        if "password" in lowered or "encrypted" in lowered:
            raise HTTPException(status_code=401, detail="PDF password is required or invalid")
        raise HTTPException(status_code=422, detail=detail)
    raise HTTPException(status_code=422, detail="Poppler conversion failed")


def _page_count(input_path: Path, password: str | None) -> int:
    result = _run_password_aware(["pdfinfo"], password, input_path)
    text = result.stdout.decode("utf-8", errors="replace")
    match = PAGE_COUNT_RE.search(text)
    if not match:
        raise HTTPException(status_code=422, detail="Could not determine PDF page count")
    count = int(match.group(1))
    if count < 1:
        raise HTTPException(status_code=422, detail="PDF contains no pages")
    return count


def _convert_pdf_to_cbz(
    data: bytes,
    output_path: Path,
    *,
    password: str | None,
    dpi: int,
    first_page: int | None,
    last_page: int | None,
) -> int:
    _require_poppler()
    if dpi < MIN_DPI or dpi > MAX_DPI:
        raise HTTPException(status_code=422, detail=f"DPI must be between {MIN_DPI} and {MAX_DPI}")
    if first_page is not None and last_page is not None and first_page > last_page:
        raise HTTPException(status_code=422, detail="First page cannot be greater than last page")

    input_path = output_path.with_name("input.pdf")
    render_dir = output_path.with_name("rendered-pages")
    render_dir.mkdir(parents=True, exist_ok=True)
    input_path.write_bytes(data)

    total_pages = _page_count(input_path, password)
    start = first_page or 1
    end = last_page or total_pages
    if start > total_pages:
        raise HTTPException(status_code=422, detail="First page exceeds PDF page count")
    end = min(end, total_pages)
    selected_pages = end - start + 1
    if selected_pages > MAX_PAGES:
        raise HTTPException(status_code=413, detail=f"PDF to CBZ is limited to {MAX_PAGES} pages per request")

    prefix = render_dir / "page"
    base = ["pdftoppm", "-png", "-r", str(dpi), "-f", str(start), "-l", str(end)]
    attempts: list[list[str]] = []
    if password:
        attempts.append([*base, "-upw", password, str(input_path), str(prefix)])
        attempts.append([*base, "-opw", password, str(input_path), str(prefix)])
    else:
        attempts.append([*base, str(input_path), str(prefix)])

    result: subprocess.CompletedProcess[bytes] | None = None
    for index, command in enumerate(attempts):
        result = _run(command)
        if result.returncode == 0:
            break
        if index != len(attempts) - 1:
            continue
        detail = (result.stderr or result.stdout or b"pdftoppm conversion failed").decode(
            "utf-8", errors="replace"
        ).strip()[-1200:]
        lowered = detail.lower()
        if "password" in lowered or "encrypted" in lowered:
            raise HTTPException(status_code=401, detail="PDF password is required or invalid")
        raise HTTPException(status_code=422, detail=detail)

    images = sorted(render_dir.glob("page-*.png"))
    if len(images) != selected_pages:
        raise HTTPException(
            status_code=500,
            detail=f"Poppler rendered {len(images)} pages; expected {selected_pages}",
        )

    width = max(3, len(str(selected_pages)))
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for index, image_path in enumerate(images, start=1):
            archive.write(image_path, arcname=f"page_{index:0{width}d}.png")

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="CBZ output was not created")
    if output_path.stat().st_size > MAX_CBZ_BYTES:
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="Generated CBZ exceeds 500 MB limit")
    return selected_pages


@router.post("/pdf/to-cbz")
def pdf_to_cbz(
    file: UploadFile = File(...),
    password: str | None = Form(default=None, max_length=128),
    dpi: int = Form(default=150, ge=MIN_DPI, le=MAX_DPI),
    first_page: int | None = Form(default=None, ge=1, le=MAX_PAGES),
    last_page: int | None = Form(default=None, ge=1, le=MAX_PAGES),
) -> FileResponse:
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-pdf-cbz-"))
    output_path = work_dir / "solyan-pdf.cbz"
    try:
        pages = _convert_pdf_to_cbz(
            data,
            output_path,
            password=password or None,
            dpi=dpi,
            first_page=first_page,
            last_page=last_page,
        )
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    from starlette.background import BackgroundTask

    return FileResponse(
        path=output_path,
        media_type="application/vnd.comicbook+zip",
        filename="solyan-pdf.cbz",
        headers={"X-SolYan-CBZ-Pages": str(pages), "X-SolYan-CBZ-DPI": str(dpi)},
        background=BackgroundTask(shutil.rmtree, work_dir, True),
    )
