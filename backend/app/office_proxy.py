from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter(prefix="/office", tags=["Office conversion"])
OFFICE_SERVICE_URL = os.getenv("OFFICE_SERVICE_URL", "http://office-service:8020").rstrip("/")
MAX_FILE_SIZE = int(os.getenv("OFFICE_PROXY_MAX_FILE_SIZE", str(100 * 1024 * 1024)))


@router.get("/health")
def office_health() -> dict:
    try:
        response = httpx.get(f"{OFFICE_SERVICE_URL}/health", timeout=8.0)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Office conversion service is unavailable") from exc


@router.post("/to-pdf")
def office_to_pdf(file: UploadFile = File(...)) -> Response:
    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Office input exceeds 100 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty Office input")

    filename = file.filename or "document.bin"
    content_type = file.content_type or "application/octet-stream"
    try:
        with httpx.Client(timeout=httpx.Timeout(240.0, connect=10.0)) as client:
            response = client.post(
                f"{OFFICE_SERVICE_URL}/convert/to-pdf",
                files={"file": (filename, data, content_type)},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Office conversion service is unavailable") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=str(detail)[:2000])

    disposition = response.headers.get("content-disposition", 'attachment; filename="solyan-converted.pdf"')
    return Response(content=response.content, media_type="application/pdf", headers={"Content-Disposition": disposition})
