from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter(prefix="/sign", tags=["Digital signing"])
SIGN_SERVICE_URL = os.getenv("SIGN_SERVICE_URL", "http://sign-service:8030").rstrip("/")


@router.get("/health")
def sign_health() -> dict:
    try:
        response = httpx.get(f"{SIGN_SERVICE_URL}/health", timeout=8.0)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Signature service is unavailable") from exc


@router.post("/pkcs12")
def sign_pkcs12(
    file: UploadFile = File(...),
    certificate: UploadFile = File(...),
    passphrase: str = Form(default="", max_length=512),
    field_name: str = Form(default="Signature1", max_length=128),
    reason: str = Form(default="", max_length=500),
    location: str = Form(default="", max_length=500),
) -> Response:
    pdf_data = file.file.read()
    cert_data = certificate.file.read()
    try:
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            response = client.post(
                f"{SIGN_SERVICE_URL}/sign/pkcs12",
                files={
                    "file": (file.filename or "document.pdf", pdf_data, file.content_type or "application/pdf"),
                    "certificate": (certificate.filename or "certificate.p12", cert_data, certificate.content_type or "application/x-pkcs12"),
                },
                data={
                    "passphrase": passphrase,
                    "field_name": field_name,
                    "reason": reason,
                    "location": location,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Signature service is unavailable") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=str(detail)[:2000])

    return Response(
        content=response.content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="solyan-signed.pdf"'},
    )
