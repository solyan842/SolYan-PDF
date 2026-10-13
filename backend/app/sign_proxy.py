from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

router = APIRouter(prefix="/sign", tags=["Digital signing"])
SIGN_SERVICE_URL = os.getenv("SIGN_SERVICE_URL", "http://sign-service:8030").rstrip("/")
MAX_PDF_SIZE = int(os.getenv("SIGN_PROXY_MAX_PDF_SIZE", str(100 * 1024 * 1024)))
MAX_CERT_SIZE = int(os.getenv("SIGN_PROXY_MAX_CERT_SIZE", str(10 * 1024 * 1024)))


def _read_limited(upload: UploadFile, limit: int, label: str) -> bytes:
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"{label} exceeds size limit")
    if not data:
        raise HTTPException(status_code=400, detail=f"Empty {label}")
    return data


def _upstream_error(response: httpx.Response) -> HTTPException:
    try:
        detail = response.json().get("detail", response.text)
    except ValueError:
        detail = response.text
    return HTTPException(status_code=response.status_code, detail=str(detail)[:2000])


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
    pdf_data = _read_limited(file, MAX_PDF_SIZE, "PDF")
    cert_data = _read_limited(certificate, MAX_CERT_SIZE, "PKCS#12")
    if not pdf_data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded document is not a PDF")
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
        raise _upstream_error(response)

    return Response(
        content=response.content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="solyan-signed.pdf"'},
    )


@router.post("/validate")
def validate_pdf_signatures(file: UploadFile = File(...)) -> JSONResponse:
    pdf_data = _read_limited(file, MAX_PDF_SIZE, "PDF")
    if not pdf_data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded document is not a PDF")
    try:
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
            response = client.post(
                f"{SIGN_SERVICE_URL}/validate",
                files={
                    "file": (file.filename or "document.pdf", pdf_data, file.content_type or "application/pdf"),
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Signature service is unavailable") from exc

    if response.status_code >= 400:
        raise _upstream_error(response)
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Signature service returned invalid JSON") from exc
    return JSONResponse(payload)
