from __future__ import annotations

import io
import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign import signers

from .validation import router as validation_router

MAX_PDF_SIZE = int(os.getenv("SIGN_MAX_PDF_SIZE", str(100 * 1024 * 1024)))
MAX_P12_SIZE = int(os.getenv("SIGN_MAX_P12_SIZE", str(10 * 1024 * 1024)))

app = FastAPI(title="SolYan PDF Signature Service", version="0.1.0")
app.include_router(validation_router)


def _read_limited(upload: UploadFile, limit: int, label: str) -> bytes:
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"{label} exceeds size limit")
    if not data:
        raise HTTPException(status_code=400, detail=f"Empty {label}")
    return data


@app.get("/health")
def health() -> dict[str, str]:
    import pyhanko

    return {"status": "ok", "engine": "pyHanko", "version": getattr(pyhanko, "__version__", "0.37.0")}


@app.post("/sign/pkcs12")
def sign_pkcs12(
    file: UploadFile = File(...),
    certificate: UploadFile = File(...),
    passphrase: str = Form(default="", max_length=512),
    field_name: str = Form(default="Signature1", min_length=1, max_length=128),
    reason: str = Form(default="", max_length=500),
    location: str = Form(default="", max_length=500),
) -> Response:
    pdf_data = _read_limited(file, MAX_PDF_SIZE, "PDF")
    p12_data = _read_limited(certificate, MAX_P12_SIZE, "PKCS#12")
    if not pdf_data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded document is not a PDF")

    try:
        signer = signers.SimpleSigner.load_pkcs12_data(
            p12_data,
            other_certs=[],
            passphrase=passphrase.encode("utf-8") if passphrase else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Không đọc được PKCS#12 hoặc mật khẩu không đúng") from exc
    if signer is None:
        raise HTTPException(status_code=422, detail="Không thể tải private key/certificate từ PKCS#12")

    try:
        writer = IncrementalPdfFileWriter(io.BytesIO(pdf_data))
        metadata = signers.PdfSignatureMetadata(
            field_name=field_name,
            reason=reason or None,
            location=location or None,
        )
        output = signers.sign_pdf(writer, metadata, signer=signer)
        signed = output.getvalue()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Ký PDF thất bại: {exc}") from exc

    return Response(
        content=signed,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="solyan-signed.pdf"'},
    )
