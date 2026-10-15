from __future__ import annotations

import io
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .main import _read_upload, app
from .orientation import analyze_orientation_file, plan_corrections
from .qr_dividers import DEFAULT_DIVIDER_MARKER, analyze_qr_dividers_file
from .scanner_split import split_scanned_photos_file


@app.post("/ocr/orientation")
def ocr_orientation(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(default=14.0),
    infer_undetected: bool = Form(default=False),
) -> dict[str, Any]:
    """Analyze page orientation without modifying source content.

    Tesseract OSD sees temporary PDFium rasters only. The returned plan contains
    clockwise *relative* corrections that the backend may later apply with qpdf.
    Low-confidence and unresolved pages remain unchanged by default.
    """

    if not 0.0 <= confidence_threshold <= 100.0:
        raise HTTPException(status_code=422, detail="confidence_threshold must be between 0 and 100")

    data, suffix = _read_upload(file)
    with tempfile.TemporaryDirectory(prefix="solyan-orientation-") as temp_dir:
        input_path = Path(temp_dir) / f"input{suffix}"
        input_path.write_bytes(data)
        try:
            detected = analyze_orientation_file(input_path, suffix)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Orientation analysis failed: {exc}") from exc

    plan = plan_corrections(
        detected,
        confidence_threshold=confidence_threshold,
        infer_undetected=infer_undetected,
    )
    return {
        "mode": "orientation",
        "engine": "Tesseract OSD + PDFium",
        "confidenceThreshold": confidence_threshold,
        "inferUndetected": infer_undetected,
        "pages": plan,
        "summary": {
            "pages": len(plan),
            "rotate": sum(1 for item in plan if item.get("apply")),
            "resolved": sum(1 for item in plan if item.get("resolved")),
            "lowConfidence": sum(1 for item in plan if item.get("note") == "lowConfidence"),
            "inferred": sum(1 for item in plan if item.get("method") == "inferred"),
        },
    }


@app.post("/ocr/qr-dividers")
def qr_dividers(
    file: UploadFile = File(...),
    marker: str = Form(default=DEFAULT_DIVIDER_MARKER, min_length=1, max_length=512),
) -> dict[str, Any]:
    """Detect exact-match QR divider pages without changing the PDF."""

    data, suffix = _read_upload(file)
    if suffix != ".pdf":
        raise HTTPException(status_code=400, detail="QR Auto Split accepts PDF input only")

    with tempfile.TemporaryDirectory(prefix="solyan-qr-dividers-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        input_path.write_bytes(data)
        try:
            pages = analyze_qr_dividers_file(input_path, suffix, marker=marker)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"QR divider analysis failed: {exc}") from exc

    dividers = [int(item["page"]) for item in pages if item.get("divider")]
    return {
        "mode": "qr-dividers",
        "engine": "OpenCV QRCodeDetector + PDFium",
        "marker": marker,
        "pages": pages,
        "dividers": dividers,
        "summary": {
            "pages": len(pages),
            "dividers": len(dividers),
        },
    }


@app.post("/ocr/scanner-photo-split")
def scanner_photo_split(
    file: UploadFile = File(...),
    angle_threshold: float = Form(default=10.0),
    tolerance: int = Form(default=30),
    min_area: int = Form(default=10_000),
    min_contour_area: float = Form(default=500.0),
    border_size: int = Form(default=1),
) -> Response:
    """Detect photographs on scanner-bed backgrounds and return PNG crops in one ZIP."""

    data, suffix = _read_upload(file)
    with tempfile.TemporaryDirectory(prefix="solyan-scanner-photo-split-") as temp_dir:
        input_path = Path(temp_dir) / f"input{suffix}"
        input_path.write_bytes(data)
        try:
            photos = split_scanned_photos_file(
                input_path,
                suffix,
                angle_threshold=angle_threshold,
                tolerance=tolerance,
                min_area=min_area,
                min_contour_area=min_contour_area,
                border_size=border_size,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Scanner photo split failed: {exc}") from exc

    if not photos:
        raise HTTPException(status_code=422, detail="No photo regions were detected")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for photo in photos:
            archive.writestr(
                f"page-{photo.page:03d}-photo-{photo.index:03d}.png",
                photo.png,
            )

    pages = len({photo.page for photo in photos})
    deskewed = sum(1 for photo in photos if abs(photo.rotation) > 0.0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-scanned-photos.zip"',
            "X-SolYan-Scanner-Photos": str(len(photos)),
            "X-SolYan-Scanner-Pages": str(pages),
            "X-SolYan-Scanner-Deskewed": str(deskewed),
        },
    )
