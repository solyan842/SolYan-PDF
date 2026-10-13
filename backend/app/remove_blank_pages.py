from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.background import BackgroundTasks
from fastapi.responses import FileResponse

router = APIRouter()

MAX_FILE_SIZE = 100 * 1024 * 1024
MAX_PAGE_COUNT = 300
MAX_SINGLE_RENDER_PIXELS = 12_250_000  # 3500 x 3500 hard render cap
MAX_TOTAL_RENDER_PIXELS = 500_000_000
BLANK_DETECTION_DPI = 150
MAX_RENDER_DIMENSION = 3500
DEFAULT_THRESHOLD = 10
DEFAULT_WHITE_PERCENT = 99.9
COMMAND_TIMEOUT_SECONDS = 60


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    return env


def _require_engines() -> None:
    commands = (["qpdf", "--version"], ["pdftotext", "-v"], ["pdftoppm", "-v"])
    for command in commands:
        try:
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
                env=_command_env(),
            )
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise HTTPException(status_code=503, detail="qpdf/Poppler blank-page engines are unavailable") from exc


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF header")
    return data


def _page_count(input_path: Path) -> int:
    result = subprocess.run(
        ["qpdf", "--show-npages", str(input_path)],
        capture_output=True,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
        env=_command_env(),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Unable to read PDF page count").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    try:
        count = int(result.stdout.strip())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Unable to parse PDF page count") from exc
    if count < 1:
        raise HTTPException(status_code=422, detail="PDF contains no pages")
    if count > MAX_PAGE_COUNT:
        raise HTTPException(status_code=413, detail=f"PDF exceeds the {MAX_PAGE_COUNT}-page blank-detection limit")
    return count


def _page_has_text(input_path: Path, page_number: int) -> bool:
    result = subprocess.run(
        [
            "pdftotext",
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-nopgbrk",
            str(input_path),
            "-",
        ],
        capture_output=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
        env=_command_env(),
    )
    if result.returncode != 0:
        detail = (result.stderr.decode("utf-8", "replace") or "pdftotext failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    return bool(result.stdout.decode("utf-8", "replace").strip())


_PGM_HEADER = re.compile(rb"\AP5\s+(\d+)\s+(\d+)\s+(\d+)\s", re.DOTALL)


def _read_pgm(path: Path) -> tuple[int, int, int, memoryview]:
    data = path.read_bytes()
    match = _PGM_HEADER.match(data)
    if not match:
        raise HTTPException(status_code=500, detail="Unexpected Poppler grayscale raster format")
    width, height, max_value = (int(value) for value in match.groups())
    if width <= 0 or height <= 0 or max_value <= 0 or max_value > 255:
        raise HTTPException(status_code=500, detail="Invalid Poppler grayscale raster header")
    pixels = memoryview(data)[match.end():]
    expected = width * height
    if len(pixels) != expected:
        raise HTTPException(status_code=500, detail="Unexpected Poppler grayscale raster length")
    return width, height, max_value, pixels


def _render_page(input_path: Path, page_number: int, output_prefix: Path) -> Path:
    result = subprocess.run(
        [
            "pdftoppm",
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-singlefile",
            "-gray",
            "-r",
            str(BLANK_DETECTION_DPI),
            "-scale-to",
            str(MAX_RENDER_DIMENSION),
            str(input_path),
            str(output_prefix),
        ],
        capture_output=True,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
        env=_command_env(),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "pdftoppm failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    pgm = output_prefix.with_suffix(".pgm")
    if not pgm.exists():
        raise HTTPException(status_code=500, detail="Poppler did not produce a page raster")
    return pgm


def _is_blank_raster(path: Path, threshold: int, white_percent: float) -> tuple[bool, int]:
    width, height, max_value, pixels = _read_pgm(path)
    pixel_count = width * height
    if pixel_count > MAX_SINGLE_RENDER_PIXELS:
        raise HTTPException(status_code=413, detail="Rendered page exceeds the blank-detection pixel limit")

    white_floor = max_value - threshold
    white_pixels = sum(1 for pixel in pixels if pixel >= white_floor)
    measured = (white_pixels / pixel_count) * 100.0
    return measured >= white_percent, pixel_count


def _compress_page_ranges(pages: list[int]) -> str:
    if not pages:
        return ""
    ranges: list[str] = []
    start = previous = pages[0]
    for page in pages[1:]:
        if page == previous + 1:
            previous = page
            continue
        ranges.append(str(start) if start == previous else f"{start}-{previous}")
        start = previous = page
    ranges.append(str(start) if start == previous else f"{start}-{previous}")
    return ",".join(ranges)


def _write_selected_pages(input_path: Path, output_path: Path, pages: list[int]) -> None:
    page_range = _compress_page_ranges(pages)
    result = subprocess.run(
        ["qpdf", str(input_path), "--pages", ".", page_range, "--", str(output_path)],
        capture_output=True,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
        env=_command_env(),
    )
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf page selection failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce an output PDF")


@router.post("/pdf/remove-blank-pages")
def remove_blank_pages(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    threshold: int = Form(default=DEFAULT_THRESHOLD, ge=0, le=255),
    white_percent: float = Form(default=DEFAULT_WHITE_PERCENT, gt=0, le=100),
) -> FileResponse:
    _require_engines()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-remove-blanks-"))
    try:
        input_path = work_dir / "input.pdf"
        output_path = work_dir / "solyan-without-blank-pages.pdf"
        input_path.write_bytes(data)

        page_count = _page_count(input_path)
        kept_pages: list[int] = []
        blank_pages: list[int] = []
        total_render_pixels = 0

        for page_number in range(1, page_count + 1):
            # A real text layer is a hard keep signal. Only text-free pages are
            # raster-classified, which deliberately biases against false removal.
            if _page_has_text(input_path, page_number):
                kept_pages.append(page_number)
                continue

            prefix = work_dir / f"page-{page_number:04d}"
            pgm = _render_page(input_path, page_number, prefix)
            try:
                blank, rendered_pixels = _is_blank_raster(pgm, threshold, white_percent)
            finally:
                pgm.unlink(missing_ok=True)

            total_render_pixels += rendered_pixels
            if total_render_pixels > MAX_TOTAL_RENDER_PIXELS:
                raise HTTPException(status_code=413, detail="Blank-page raster analysis exceeds the aggregate pixel limit")

            if blank:
                blank_pages.append(page_number)
            else:
                kept_pages.append(page_number)

        if not blank_pages:
            kept_pages = list(range(1, page_count + 1))
        if not kept_pages:
            raise HTTPException(status_code=422, detail="All pages were detected as blank; refusing to create an empty PDF")

        _write_selected_pages(input_path, output_path, kept_pages)
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=output_path,
        media_type="application/pdf",
        filename="solyan-without-blank-pages.pdf",
        headers={
            "X-SolYan-Blank-Pages-Removed": str(len(blank_pages)),
            "X-SolYan-Blank-Pages": _compress_page_ranges(blank_pages),
            "X-SolYan-Blank-Threshold": str(threshold),
            "X-SolYan-Blank-White-Percent": f"{white_percent:g}",
        },
        background=background_tasks,
    )
