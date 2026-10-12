from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/ocr", tags=["OCR"])
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://ocr-service:8010").rstrip("/")
OCR_PROXY_MAX_FILE_SIZE = int(os.getenv("OCR_PROXY_MAX_FILE_SIZE", str(50 * 1024 * 1024)))


def _forward(path: str, upload: UploadFile) -> dict:
    data = upload.file.read(OCR_PROXY_MAX_FILE_SIZE + 1)
    if len(data) > OCR_PROXY_MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="OCR input exceeds 50 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty OCR input")

    filename = upload.filename or "document.bin"
    content_type = upload.content_type or "application/octet-stream"
    try:
        with httpx.Client(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
            response = client.post(
                f"{OCR_SERVICE_URL}{path}",
                files={"file": (filename, data, content_type)},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="OCR service is unavailable") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=str(detail)[:2000])

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="OCR service returned invalid JSON") from exc


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
