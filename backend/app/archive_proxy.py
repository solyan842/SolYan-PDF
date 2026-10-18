from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter(prefix="/archive", tags=["PDF/A"])
ARCHIVE_SERVICE_URL = os.getenv("ARCHIVE_SERVICE_URL", "http://archive-service:8040").rstrip("/")
ARCHIVE_SERVICE_TOKEN = os.getenv("SOLYAN_ARCHIVE_TOKEN", "")


def _archive_auth_headers() -> dict[str, str]:
    """Authenticate to desktop archive sidecar without changing web mode."""
    return {"X-SolYan-Desktop-Token": ARCHIVE_SERVICE_TOKEN} if ARCHIVE_SERVICE_TOKEN else {}
MAX_FILE_SIZE = int(os.getenv("ARCHIVE_PROXY_MAX_FILE_SIZE", str(100 * 1024 * 1024)))


@router.get("/health")
def archive_health() -> dict:
    try:
        response = httpx.get(f"{ARCHIVE_SERVICE_URL}/health", headers=_archive_auth_headers(), timeout=10.0)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="PDF/A service is unavailable") from exc


@router.post("/pdfa")
def pdfa(file: UploadFile = File(...)) -> Response:
    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty PDF")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded document is not a PDF")
    try:
        with httpx.Client(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
            response = client.post(
                f"{ARCHIVE_SERVICE_URL}/pdfa/internal",
                files={"file": (file.filename or "document.pdf", data, file.content_type or "application/pdf")},
                headers=_archive_auth_headers(),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="PDF/A service is unavailable") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=str(detail)[:3000])
    return Response(content=response.content, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="solyan-archive-pdfa.pdf"'})
