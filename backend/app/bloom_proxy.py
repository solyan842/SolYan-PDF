from __future__ import annotations

import io
import os
import time
import xml.etree.ElementTree as ET
import zipfile

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .xlsx_print import apply_fit_to_width, detect_pdf_print_setup

router = APIRouter(prefix="/experimental", tags=["Experimental conversion"])
BLOOM_SERVICE_URL = os.getenv("BLOOM_SERVICE_URL", "http://bloom-service:8787").rstrip("/")
BLOOM_API_KEY = os.getenv("BLOOM_API_KEY", "")
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://ocr-service:8010").rstrip("/")
OCR_XLSX_FALLBACK_TIMEOUT_SECONDS = float(os.getenv("OCR_XLSX_FALLBACK_TIMEOUT_SECONDS", "900"))
MAX_FILE_SIZE = int(os.getenv("BLOOM_PROXY_MAX_FILE_SIZE", str(100 * 1024 * 1024)))
TARGETS = {"docx", "xlsx", "pptx"}
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_BLOOM_NO_TABLES = "No logical tables detected in document."
_SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_NS = {"x": _SHEET_NS}


def _headers() -> dict[str, str]:
    return {"x-api-key": BLOOM_API_KEY} if BLOOM_API_KEY else {}


def _xlsx_cell_texts(content: bytes) -> list[str]:
    """Extract non-empty XLSX cell text using only the Python standard library."""

    try:
        with zipfile.ZipFile(io.BytesIO(content), "r") as archive:
            if "xl/workbook.xml" not in archive.namelist():
                return []

            shared_strings: list[str] = []
            if "xl/sharedStrings.xml" in archive.namelist():
                shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                for item in shared_root.findall("x:si", _NS):
                    shared_strings.append("".join(node.text or "" for node in item.findall(".//x:t", _NS)))

            values: list[str] = []
            sheet_paths = sorted(
                name
                for name in archive.namelist()
                if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
            )
            for path in sheet_paths:
                root = ET.fromstring(archive.read(path))
                for cell in root.findall(".//x:c", _NS):
                    cell_type = cell.attrib.get("t")
                    text = ""
                    if cell_type == "inlineStr":
                        text = "".join(node.text or "" for node in cell.findall(".//x:t", _NS))
                    else:
                        value = cell.find("x:v", _NS)
                        raw = value.text if value is not None and value.text is not None else ""
                        if cell_type == "s":
                            try:
                                text = shared_strings[int(raw)]
                            except (ValueError, IndexError):
                                text = raw
                        else:
                            text = raw
                    if text.strip():
                        values.append(text.strip())
            return values
    except (zipfile.BadZipFile, KeyError, ET.ParseError, OSError):
        return []


def _is_bloom_no_tables_placeholder(content: bytes) -> bool:
    """Match Bloom's exact one-cell XLSX used when it detects no logical table."""

    return _xlsx_cell_texts(content) == [_BLOOM_NO_TABLES]


def _is_xlsx_package(content: bytes) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(content), "r") as archive:
            names = set(archive.namelist())
            return "[Content_Types].xml" in names and "xl/workbook.xml" in names
    except (zipfile.BadZipFile, OSError):
        return False


def _try_ocr_xlsx(data: bytes, filename: str) -> tuple[bytes, str, str, dict[str, str]] | None:
    """Try PP-Structure only after Bloom explicitly reports no logical tables.

    OCR is a best-effort fallback. If the OCR service is unavailable or finds no
    exportable table, the caller keeps Bloom's original placeholder instead of
    turning a previously successful conversion into an error. CPU-only
    PP-Structure can legitimately take several minutes for multi-page scans, so
    its fallback timeout is intentionally longer than Bloom's own job timeout.
    """

    try:
        with httpx.Client(
            timeout=httpx.Timeout(OCR_XLSX_FALLBACK_TIMEOUT_SECONDS, connect=10.0)
        ) as client:
            response = client.post(
                f"{OCR_SERVICE_URL}/ocr/xlsx",
                files={"file": (filename, data, "application/pdf")},
            )
    except httpx.HTTPError:
        return None

    if response.status_code >= 400 or not _is_xlsx_package(response.content):
        return None

    disposition = response.headers.get("content-disposition", 'attachment; filename="solyan-ocr-tables.xlsx"')
    media_type = response.headers.get("content-type", XLSX_MEDIA_TYPE).split(";", 1)[0].strip() or XLSX_MEDIA_TYPE
    forwarded: dict[str, str] = {}
    for name in ("x-solyan-ocr-engine", "x-solyan-ocr-pages", "x-solyan-ocr-table-workbooks"):
        value = response.headers.get(name)
        if value:
            forwarded[name] = value
    return response.content, disposition, media_type, forwarded


@router.get("/bloom/health")
def bloom_health() -> dict:
    try:
        response = httpx.get(f"{BLOOM_SERVICE_URL}/health", headers=_headers(), timeout=8.0)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Bloom conversion service is unavailable") from exc


@router.post("/pdf-to-office")
def pdf_to_office(
    file: UploadFile = File(...),
    target: str = Form(default="docx"),
) -> Response:
    if target not in TARGETS:
        raise HTTPException(status_code=400, detail="Target must be docx, xlsx or pptx")
    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a PDF")

    # Resolve print geometry from the original PDF before conversion. The XLSX
    # normalizer only runs when qpdf can map page 1 to a recognized paper size;
    # custom/unknown PDFs therefore keep Bloom's output unchanged.
    xlsx_print_setup = detect_pdf_print_setup(data) if target == "xlsx" else None

    headers = _headers()
    try:
        with httpx.Client(timeout=httpx.Timeout(180.0, connect=10.0), headers=headers) as client:
            created = client.post(
                f"{BLOOM_SERVICE_URL}/convert",
                files={"file": (file.filename or "document.pdf", data, "application/pdf")},
                data={"target": target},
            )
            if created.status_code != 202:
                raise HTTPException(status_code=502, detail=f"Bloom create job failed: {created.text[:1000]}")
            payload = created.json()
            job_id = payload.get("job", {}).get("id")
            if not job_id:
                raise HTTPException(status_code=502, detail="Bloom did not return a job id")

            deadline = time.monotonic() + 170
            while time.monotonic() < deadline:
                status = client.get(f"{BLOOM_SERVICE_URL}/jobs/{job_id}")
                status.raise_for_status()
                job = status.json().get("job", {})
                state = job.get("state")
                if state == "Completed":
                    result = client.get(f"{BLOOM_SERVICE_URL}/download/{job_id}")
                    result.raise_for_status()
                    content = result.content
                    disposition = result.headers.get("content-disposition", f'attachment; filename="solyan-converted.{target}"')
                    media_type = result.headers.get("content-type", "application/octet-stream")
                    response_headers: dict[str, str] = {"Content-Disposition": disposition}

                    if target == "xlsx":
                        fallback = None
                        if _is_bloom_no_tables_placeholder(content):
                            fallback = _try_ocr_xlsx(data, file.filename or "document.pdf")
                        if fallback is not None:
                            content, disposition, media_type, ocr_headers = fallback
                            response_headers = {
                                "Content-Disposition": disposition,
                                "X-SolYan-Conversion-Engine": "PP-StructureV3-fallback",
                                **ocr_headers,
                            }
                        else:
                            if xlsx_print_setup is not None:
                                content = apply_fit_to_width(content, *xlsx_print_setup)
                            response_headers["X-SolYan-Conversion-Engine"] = "Bloom"

                    return Response(
                        content=content,
                        media_type=media_type,
                        headers=response_headers,
                    )
                if state in {"Failed", "Cancelled"}:
                    raise HTTPException(status_code=422, detail=f"Bloom conversion {state.lower()}: {job.get('error') or 'unknown error'}")
                time.sleep(0.75)
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Bloom conversion service is unavailable") from exc

    raise HTTPException(status_code=504, detail="Bloom conversion timed out")
