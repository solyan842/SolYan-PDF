from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from .ocr_proxy import _json_response, _post_bytes, _read_upload

router = APIRouter()


@router.post("/pdf/to-markdown")
def pdf_to_markdown(file: UploadFile = File(...)) -> Response:
    data, filename, content_type = _read_upload(file)
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="PDF to Markdown accepts PDF input only")

    payload = _json_response(
        _post_bytes("/ocr/structured", data, filename, content_type)
    )
    markdown = payload.get("markdown")
    if not isinstance(markdown, str):
        raise HTTPException(status_code=502, detail="Structured OCR response is missing Markdown output")

    engine = payload.get("engine")
    engine_name = engine if isinstance(engine, str) and engine.strip() else "PP-StructureV3"
    page_payloads = payload.get("pages")
    page_count = len(page_payloads) if isinstance(page_payloads, list) else 0

    return Response(
        content=markdown.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-pdf.md"',
            "X-SolYan-Markdown-Engine": engine_name,
            "X-SolYan-Markdown-Pages": str(page_count),
        },
    )
