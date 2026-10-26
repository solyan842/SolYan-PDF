from __future__ import annotations

import difflib
import os
import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .sanitize import _read_pdf

router = APIRouter()

MAX_PAGES = 100
MAX_RASTER_SIDE = 480
MAX_TEXT_BYTES = 10 * 1024 * 1024
MAX_DIFF_LINES = 300
COMMAND_TIMEOUT_SECONDS = 180
PAGE_COUNT_RE = re.compile(r"^Pages:\s*(\d+)\s*$", re.MULTILINE)


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C.UTF-8"
    return env


def _run(command: list[str], *, timeout: int = COMMAND_TIMEOUT_SECONDS) -> subprocess.CompletedProcess[bytes]:
    try:
        result = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDF comparison timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Bundled Poppler comparison engine is unavailable") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or b"Poppler comparison failed").decode("utf-8", errors="replace").strip()[-1200:]
        lowered = detail.lower()
        if "password" in lowered or "encrypted" in lowered:
            raise HTTPException(status_code=401, detail="A password-protected PDF cannot be compared without its password")
        raise HTTPException(status_code=422, detail=detail or "Poppler comparison failed")
    return result


def _page_count(path: Path) -> int:
    result = _run(["pdfinfo", str(path)], timeout=30)
    match = PAGE_COUNT_RE.search(result.stdout.decode("utf-8", errors="replace"))
    if not match:
        raise HTTPException(status_code=422, detail="Poppler could not determine the PDF page count")
    count = int(match.group(1))
    if not 1 <= count <= MAX_PAGES:
        raise HTTPException(status_code=413, detail=f"Visual comparison supports 1–{MAX_PAGES} pages per PDF")
    return count


def _ppm_tokens(data: bytes) -> tuple[list[bytes], int]:
    tokens: list[bytes] = []
    index = 0
    length = len(data)
    while len(tokens) < 4:
        while index < length and data[index] in b" \t\r\n\v\f":
            index += 1
        if index < length and data[index] == ord("#"):
            while index < length and data[index] not in b"\r\n":
                index += 1
            continue
        start = index
        while index < length and data[index] not in b" \t\r\n\v\f#":
            index += 1
        if start == index:
            break
        tokens.append(data[start:index])
    if len(tokens) != 4:
        raise HTTPException(status_code=502, detail="Poppler returned an invalid PPM image header")
    if index >= length or data[index] not in b" \t\r\n\v\f":
        raise HTTPException(status_code=502, detail="Poppler returned an invalid PPM separator")
    if data[index:index + 2] == b"\r\n":
        index += 2
    else:
        index += 1
    return tokens, index


def _read_ppm(data: bytes) -> tuple[int, int, bytes]:
    tokens, offset = _ppm_tokens(data)
    if tokens[0] != b"P6":
        raise HTTPException(status_code=502, detail="Poppler returned an unsupported PPM encoding")
    try:
        width, height, maximum = (int(token) for token in tokens[1:])
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Poppler returned invalid PPM dimensions") from exc
    if not (1 <= width <= MAX_RASTER_SIDE and 1 <= height <= MAX_RASTER_SIDE and maximum == 255):
        raise HTTPException(status_code=502, detail="Poppler returned PPM dimensions outside the comparison limit")
    expected = width * height * 3
    pixels = data[offset:]
    if len(pixels) != expected:
        raise HTTPException(status_code=502, detail="Poppler returned a truncated PPM image")
    return width, height, pixels


def _pixel_similarity(left: tuple[int, int, bytes], right: tuple[int, int, bytes]) -> dict[str, int | float | bool]:
    left_width, left_height, left_pixels = left
    right_width, right_height, right_pixels = right
    total = max(left_width * left_height, right_width * right_height)
    if left_width != right_width or left_height != right_height:
        return {"similarity": 0.0, "differentPixels": total, "totalPixels": total, "sizeMismatch": True}
    different = sum(
        abs(left_pixels[index] - right_pixels[index])
        + abs(left_pixels[index + 1] - right_pixels[index + 1])
        + abs(left_pixels[index + 2] - right_pixels[index + 2]) > 24
        for index in range(0, len(left_pixels), 3)
    )
    return {
        "similarity": round((1 - different / total) * 100, 4) if total else 100.0,
        "differentPixels": different,
        "totalPixels": total,
        "sizeMismatch": False,
    }


def _text_diff(left: bytes, right: bytes) -> dict[str, object]:
    if len(left) > MAX_TEXT_BYTES or len(right) > MAX_TEXT_BYTES:
        raise HTTPException(status_code=413, detail="Extracted comparison text exceeds 10 MB per PDF")
    left_lines = left.decode("utf-8", errors="replace").replace("\x00", "").splitlines()
    right_lines = right.decode("utf-8", errors="replace").replace("\x00", "").splitlines()
    matcher = difflib.SequenceMatcher(a=left_lines, b=right_lines)
    changes: list[dict[str, str]] = []
    added = removed = 0
    for tag, start_a, end_a, start_b, end_b in matcher.get_opcodes():
        if tag in ("delete", "replace"):
            removed += end_a - start_a
            for line in left_lines[start_a:end_a]:
                if len(changes) < MAX_DIFF_LINES + 1:
                    changes.append({"type": "removed", "text": line[:4000]})
        if tag in ("insert", "replace"):
            added += end_b - start_b
            for line in right_lines[start_b:end_b]:
                if len(changes) < MAX_DIFF_LINES + 1:
                    changes.append({"type": "added", "text": line[:4000]})
    return {"added": added, "removed": removed, "changes": changes[:MAX_DIFF_LINES], "truncated": len(changes) > MAX_DIFF_LINES}


def _render_pages(path: Path, output_prefix: Path, page_count: int) -> list[tuple[int, int, bytes]]:
    _run(["pdftoppm", "-scale-to", str(MAX_RASTER_SIDE), str(path), str(output_prefix)])
    rendered: list[tuple[int, int, bytes]] = []
    for page in range(1, page_count + 1):
        candidates = [output_prefix.with_name(f"{output_prefix.name}-{page}.ppm"), output_prefix.with_name(f"{output_prefix.name}-{page:03}.ppm")]
        image_path = next((candidate for candidate in candidates if candidate.is_file()), None)
        if image_path is None:
            raise HTTPException(status_code=502, detail=f"Poppler did not render comparison page {page}")
        rendered.append(_read_ppm(image_path.read_bytes()))
    return rendered


def _compare_bytes(left_data: bytes, right_data: bytes, left_name: str, right_name: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="solyan-pdf-compare-") as directory:
        root = Path(directory)
        left_path, right_path = root / "left.pdf", root / "right.pdf"
        left_path.write_bytes(left_data)
        right_path.write_bytes(right_data)

        left_pages, right_pages = _page_count(left_path), _page_count(right_path)
        left_text = _run(["pdftotext", "-enc", "UTF-8", "-layout", str(left_path), "-"]).stdout
        right_text = _run(["pdftotext", "-enc", "UTF-8", "-layout", str(right_path), "-"]).stdout
        left_rasters = _render_pages(left_path, root / "left", left_pages)
        right_rasters = _render_pages(right_path, root / "right", right_pages)

        page_results = []
        for page in range(min(left_pages, right_pages)):
            page_results.append({"page": page + 1, **_pixel_similarity(left_rasters[page], right_rasters[page])})
        average = sum(float(item["similarity"]) for item in page_results) / len(page_results) if page_results else 0.0
        return {
            "left": {"name": Path(left_name).name, "pages": left_pages, "textBytes": len(left_text)},
            "right": {"name": Path(right_name).name, "pages": right_pages, "textBytes": len(right_text)},
            "text": _text_diff(left_text, right_text),
            "visual": {"averageSimilarity": round(average, 4), "pages": page_results},
        }


@router.post("/pdf/compare")
def compare_pdf(left: UploadFile = File(...), right: UploadFile = File(...)) -> JSONResponse:
    left_data, right_data = _read_pdf(left), _read_pdf(right)
    if len(left_data) + len(right_data) > 150 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Combined comparison input exceeds 150 MB")
    return JSONResponse(_compare_bytes(left_data, right_data, left.filename or "left.pdf", right.filename or "right.pdf"))
