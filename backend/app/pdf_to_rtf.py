from __future__ import annotations

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from .office_proxy import MAX_FILE_SIZE, OFFICE_SERVICE_URL

router = APIRouter()


@router.post("/pdf/to-rtf")
def pdf_to_rtf(file: UploadFile = File(...)) -> Response:
    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a PDF")

    filename = file.filename or "document.pdf"
    try:
        with httpx.Client(timeout=httpx.Timeout(240.0, connect=10.0)) as client:
            upstream = client.post(
                f"{OFFICE_SERVICE_URL}/convert/pdf-to-office",
                files={"file": (filename, data, "application/pdf")},
                data={"target": "rtf"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Office conversion service is unavailable") from exc

    if upstream.status_code >= 400:
        try:
            detail = upstream.json().get("detail", upstream.text)
        except ValueError:
            detail = upstream.text
        raise HTTPException(status_code=upstream.status_code, detail=str(detail)[:2000])

    content = upstream.content
    if not content.lstrip().startswith(b"{\\rtf"):
        raise HTTPException(status_code=502, detail="Office conversion service returned invalid RTF output")

    engine = upstream.headers.get("x-solyan-conversion-engine", "LibreOffice-PDF-import")
    return Response(
        content=content,
        media_type="application/rtf",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-pdf.rtf"',
            "X-SolYan-RTF-Engine": engine,
        },
    )
