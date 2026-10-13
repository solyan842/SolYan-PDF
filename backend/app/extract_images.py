from __future__ import annotations

import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.background import BackgroundTasks
from fastapi.responses import FileResponse

router = APIRouter()

MAX_FILE_SIZE = 100 * 1024 * 1024
MAX_IMAGE_COUNT = 2000
MAX_SINGLE_IMAGE_PIXELS = 100_000_000
MAX_TOTAL_IMAGE_PIXELS = 1_000_000_000
MAX_EXTRACTED_BYTES = 512 * 1024 * 1024
PDFIMAGES_TIMEOUT_SECONDS = 180


def _require_pdfimages() -> None:
    try:
        subprocess.run(
            ["pdfimages", "-v"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="Poppler pdfimages engine is unavailable") from exc


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF header")
    return data


def _image_dimensions(listing: str) -> list[tuple[int, int]]:
    dimensions: list[tuple[int, int]] = []
    for raw_line in listing.splitlines():
        fields = raw_line.split()
        if len(fields) < 5:
            continue
        try:
            int(fields[0])
            int(fields[1])
            width = int(fields[3])
            height = int(fields[4])
        except ValueError:
            continue
        if width > 0 and height > 0:
            dimensions.append((width, height))
    return dimensions


def _preflight(input_path: Path) -> int:
    result = subprocess.run(
        ["pdfimages", "-list", str(input_path)],
        capture_output=True,
        text=True,
        timeout=PDFIMAGES_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "pdfimages failed to inspect PDF").strip()[-1200:]
        status = 403 if result.returncode == 3 else 422
        raise HTTPException(status_code=status, detail=detail)

    dimensions = _image_dimensions(result.stdout)
    if not dimensions:
        raise HTTPException(status_code=422, detail="No embedded raster images were found in this PDF")
    if len(dimensions) > MAX_IMAGE_COUNT:
        raise HTTPException(status_code=413, detail=f"PDF contains more than {MAX_IMAGE_COUNT} embedded images")

    total_pixels = 0
    for width, height in dimensions:
        pixels = width * height
        if pixels > MAX_SINGLE_IMAGE_PIXELS:
            raise HTTPException(status_code=413, detail="An embedded image exceeds the 100-megapixel safety limit")
        total_pixels += pixels
        if total_pixels > MAX_TOTAL_IMAGE_PIXELS:
            raise HTTPException(status_code=413, detail="Embedded images exceed the 1-gigapixel aggregate safety limit")
    return len(dimensions)


def _extract_to_zip(input_path: Path, work_dir: Path) -> Path:
    prefix = work_dir / "image"
    result = subprocess.run(
        ["pdfimages", "-all", "-p", "-q", str(input_path), str(prefix)],
        capture_output=True,
        text=True,
        timeout=PDFIMAGES_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "pdfimages extraction failed").strip()[-1200:]
        status = 403 if result.returncode == 3 else 422
        raise HTTPException(status_code=status, detail=detail)

    extracted = sorted(
        path
        for path in work_dir.iterdir()
        if path.is_file() and path.name.startswith("image-") and path != input_path
    )
    if not extracted:
        raise HTTPException(status_code=422, detail="No extractable image payloads were produced")
    if len(extracted) > MAX_IMAGE_COUNT * 2:
        raise HTTPException(status_code=413, detail="Extraction produced too many image payload files")

    total_size = sum(path.stat().st_size for path in extracted)
    if total_size > MAX_EXTRACTED_BYTES:
        raise HTTPException(status_code=413, detail="Extracted image payloads exceed the 512 MB safety limit")

    zip_path = work_dir / "solyan-extracted-images.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in extracted:
            archive.write(path, arcname=path.name)
    if zip_path.stat().st_size > MAX_EXTRACTED_BYTES:
        raise HTTPException(status_code=413, detail="Image archive exceeds the 512 MB safety limit")
    return zip_path


@router.post("/pdf/extract-images")
def extract_images(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> FileResponse:
    _require_pdfimages()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-extract-images-"))
    try:
        input_path = work_dir / "input.pdf"
        input_path.write_bytes(data)
        image_count = _preflight(input_path)
        zip_path = _extract_to_zip(input_path, work_dir)
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename="solyan-extracted-images.zip",
        headers={"X-SolYan-Extracted-Images": str(image_count)},
        background=background_tasks,
    )
