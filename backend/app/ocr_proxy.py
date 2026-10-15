from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .auto_rotate import qpdf_rotation_args
from .auto_split import build_split_groups, split_pdf_to_zip

router = APIRouter(prefix="/ocr", tags=["OCR"])
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://ocr-service:8010").rstrip("/")
OCR_PROXY_MAX_FILE_SIZE = int(os.getenv("OCR_PROXY_MAX_FILE_SIZE", str(50 * 1024 * 1024)))
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
AUTO_SPLIT_MARKER = "SOLYAN:PDF:AUTO-SPLIT:v1"


def _read_upload(upload: UploadFile) -> tuple[bytes, str, str]:
    data = upload.file.read(OCR_PROXY_MAX_FILE_SIZE + 1)
    if len(data) > OCR_PROXY_MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="OCR input exceeds 50 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty OCR input")

    filename = upload.filename or "document.bin"
    content_type = upload.content_type or "application/octet-stream"
    return data, filename, content_type


def _post_bytes(
    path: str,
    data: bytes,
    filename: str,
    content_type: str,
    form: dict[str, str] | None = None,
) -> httpx.Response:
    try:
        with httpx.Client(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
            request_kwargs: dict[str, Any] = {
                "files": {"file": (filename, data, content_type)},
            }
            if form:
                request_kwargs["data"] = form
            response = client.post(f"{OCR_SERVICE_URL}{path}", **request_kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="OCR service is unavailable") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=str(detail)[:2000])

    return response


def _post(path: str, upload: UploadFile, form: dict[str, str] | None = None) -> httpx.Response:
    data, filename, content_type = _read_upload(upload)
    return _post_bytes(path, data, filename, content_type, form)


def _json_response(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="OCR service returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="OCR service returned an invalid JSON object")
    return payload


def _forward(path: str, upload: UploadFile) -> dict:
    return _json_response(_post(path, upload))


def _forward_binary(
    path: str,
    upload: UploadFile,
    default_media_type: str,
    form: dict[str, str] | None = None,
) -> Response:
    response = _post(path, upload, form)
    media_type = response.headers.get("content-type", default_media_type).split(";", 1)[0].strip()
    headers: dict[str, str] = {}
    for name in (
        "content-disposition",
        "x-solyan-ocr-engine",
        "x-solyan-ocr-pages",
        "x-solyan-ocr-table-workbooks",
        "x-solyan-scanner-photos",
        "x-solyan-scanner-pages",
        "x-solyan-scanner-deskewed",
    ):
        value = response.headers.get(name)
        if value:
            headers[name] = value
    return Response(content=response.content, media_type=media_type or default_media_type, headers=headers)


def _orientation_form(confidence_threshold: float, infer_undetected: bool) -> dict[str, str]:
    if not 0.0 <= confidence_threshold <= 100.0:
        raise HTTPException(status_code=422, detail="confidence_threshold must be between 0 and 100")
    return {
        "confidence_threshold": f"{confidence_threshold:g}",
        "infer_undetected": "true" if infer_undetected else "false",
    }


def _scanner_split_form(
    angle_threshold: float,
    tolerance: int,
    min_area: int,
    min_contour_area: float,
    border_size: int,
) -> dict[str, str]:
    if not 0.0 <= angle_threshold <= 45.0:
        raise HTTPException(status_code=422, detail="angle_threshold must be between 0 and 45 degrees")
    if not 0 <= tolerance <= 255:
        raise HTTPException(status_code=422, detail="tolerance must be between 0 and 255")
    if not 100 <= min_area <= 100_000_000:
        raise HTTPException(status_code=422, detail="min_area must be between 100 and 100000000 pixels")
    if not 0.0 <= min_contour_area <= 100_000_000.0:
        raise HTTPException(status_code=422, detail="min_contour_area must be between 0 and 100000000 pixels")
    if not 0 <= border_size <= 500:
        raise HTTPException(status_code=422, detail="border_size must be between 0 and 500 pixels")
    return {
        "angle_threshold": f"{angle_threshold:g}",
        "tolerance": str(tolerance),
        "min_area": str(min_area),
        "min_contour_area": f"{min_contour_area:g}",
        "border_size": str(border_size),
    }


def _apply_qpdf_rotations(data: bytes, args: list[str]) -> bytes:
    if not args:
        # Preserve byte identity (and any existing signature) when OSD makes no
        # confident rotation decision.
        return data
    if shutil.which("qpdf") is None:
        raise HTTPException(status_code=503, detail="qpdf engine is unavailable")

    with tempfile.TemporaryDirectory(prefix="solyan-auto-rotate-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        output_path = Path(temp_dir) / "output.pdf"
        input_path.write_bytes(data)
        result = subprocess.run(
            ["qpdf", *args, str(input_path), str(output_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode not in (0, 3):
            detail = (result.stderr or result.stdout or "qpdf failed").strip()[-1200:]
            raise HTTPException(status_code=422, detail=detail)
        if not output_path.exists():
            raise HTTPException(status_code=500, detail="qpdf did not produce an Auto Rotate output")
        return output_path.read_bytes()


def _qr_analysis(data: bytes, filename: str, content_type: str) -> dict[str, Any]:
    return _json_response(
        _post_bytes(
            "/ocr/qr-dividers",
            data,
            filename,
            content_type,
            {"marker": AUTO_SPLIT_MARKER},
        )
    )


@router.get("/health")
def ocr_health() -> dict:
    try:
        response = httpx.get(f"{OCR_SERVICE_URL}/health", timeout=5.0)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="OCR service is unavailable") from exc


@router.post("/text")
def ocr_text(file: UploadFile = File(...)) -> dict:
    return _forward("/ocr/text", file)


@router.post("/structured")
def ocr_structured(file: UploadFile = File(...)) -> dict:
    return _forward("/ocr/structured", file)


@router.post("/xlsx")
def ocr_xlsx(file: UploadFile = File(...)) -> Response:
    return _forward_binary("/ocr/xlsx", file, XLSX_MEDIA_TYPE)


@router.post("/scanner-photo-split")
def ocr_scanner_photo_split(
    file: UploadFile = File(...),
    angle_threshold: float = Form(default=10.0),
    tolerance: int = Form(default=30),
    min_area: int = Form(default=10_000),
    min_contour_area: float = Form(default=500.0),
    border_size: int = Form(default=1),
) -> Response:
    form = _scanner_split_form(
        angle_threshold,
        tolerance,
        min_area,
        min_contour_area,
        border_size,
    )
    return _forward_binary("/ocr/scanner-photo-split", file, "application/zip", form)


@router.post("/orientation")
def ocr_orientation(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(default=14.0),
    infer_undetected: bool = Form(default=False),
) -> dict[str, Any]:
    form = _orientation_form(confidence_threshold, infer_undetected)
    return _json_response(_post("/ocr/orientation", file, form))


@router.post("/auto-rotate")
def ocr_auto_rotate(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(default=14.0),
    infer_undetected: bool = Form(default=False),
) -> Response:
    data, filename, content_type = _read_upload(file)
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Auto Rotate accepts PDF input only")

    form = _orientation_form(confidence_threshold, infer_undetected)
    analysis = _json_response(
        _post_bytes("/ocr/orientation", data, filename, content_type, form)
    )
    pages = analysis.get("pages")
    if not isinstance(pages, list):
        raise HTTPException(status_code=502, detail="OCR orientation response is missing page results")
    try:
        rotation_args = qpdf_rotation_args(pages)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid OCR orientation plan: {exc}") from exc

    output = _apply_qpdf_rotations(data, rotation_args)
    summary = analysis.get("summary") if isinstance(analysis.get("summary"), dict) else {}
    return Response(
        content=output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-auto-rotated.pdf"',
            "X-SolYan-Auto-Rotated-Pages": str(len(rotation_args)),
            "X-SolYan-Auto-Rotate-Low-Confidence": str(summary.get("lowConfidence", 0)),
            "X-SolYan-Auto-Rotate-Inferred": str(summary.get("inferred", 0)),
        },
    )


@router.post("/qr-dividers")
def ocr_qr_dividers(file: UploadFile = File(...)) -> dict[str, Any]:
    data, filename, content_type = _read_upload(file)
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="QR divider analysis accepts PDF input only")
    return _qr_analysis(data, filename, content_type)


@router.post("/auto-split")
def ocr_auto_split(
    file: UploadFile = File(...),
    duplex: bool = Form(default=False),
) -> Response:
    data, filename, content_type = _read_upload(file)
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Auto Split accepts PDF input only")

    analysis = _qr_analysis(data, filename, content_type)
    dividers = analysis.get("dividers")
    summary = analysis.get("summary")
    if not isinstance(dividers, list) or not isinstance(summary, dict):
        raise HTTPException(status_code=502, detail="OCR QR response is missing divider results")
    try:
        page_count = int(summary.get("pages", 0) or 0)
        groups = build_split_groups(page_count, dividers, duplex=duplex)
        archive = split_pdf_to_zip(data, groups, page_count)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return Response(
        content=archive,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-auto-split.zip"',
            "X-SolYan-Auto-Split-Dividers": str(len(dividers)),
            "X-SolYan-Auto-Split-Parts": str(len(groups)),
            "X-SolYan-Auto-Split-Duplex": "true" if duplex else "false",
        },
    )
