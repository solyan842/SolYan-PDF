from __future__ import annotations

import csv
import io
import re
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from .ocr_proxy import OCR_PROXY_MAX_FILE_SIZE, OCR_SERVICE_URL

router = APIRouter()

MAX_XLSX_SIZE = 250 * 1024 * 1024
MAX_CSV_OUTPUT_SIZE = 250 * 1024 * 1024
MAX_SHEETS = 1000
MAX_CELLS_PER_SHEET = 2_000_000

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def _read_pdf(upload: UploadFile) -> tuple[bytes, str]:
    data = upload.file.read(OCR_PROXY_MAX_FILE_SIZE + 1)
    if len(data) > OCR_PROXY_MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 50 MB OCR conversion limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a PDF")
    return data, upload.filename or "document.pdf"


def _safe_base_name(filename: str) -> str:
    base = Path(filename).stem.strip() or "document"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip(".-")
    return (cleaned or "document")[:80]


def _safe_entry_name(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-")
    return (cleaned or fallback)[:80]


def _column_index(reference: str) -> int:
    letters = []
    for char in reference:
        if char.isalpha():
            letters.append(char.upper())
        else:
            break
    if not letters:
        return 1
    result = 0
    for char in letters:
        result = result * 26 + ord(char) - 64
    return result


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        raw = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(raw)
    values: list[str] = []
    for item in root.findall(f"{{{MAIN_NS}}}si"):
        values.append("".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")))
    return values


def _sheet_targets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        rel.attrib.get("Id", ""): rel.attrib.get("Target", "")
        for rel in rels.findall(f"{{{PKG_REL_NS}}}Relationship")
    }
    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall(f".//{{{MAIN_NS}}}sheet"):
        name = sheet.attrib.get("name", "Sheet")
        rel_id = sheet.attrib.get(f"{{{REL_NS}}}id", "")
        target = targets.get(rel_id)
        if not target:
            continue
        if target.startswith("/"):
            path = target.lstrip("/")
        else:
            path = str(PurePosixPath("xl") / target)
        path = str(PurePosixPath(path))
        sheets.append((name, path))
    if len(sheets) > MAX_SHEETS:
        raise HTTPException(status_code=422, detail="OCR workbook contains too many worksheets")
    return sheets


def _cell_text(cell: ET.Element, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t"))
    value_node = cell.find(f"{{{MAIN_NS}}}v")
    value = value_node.text if value_node is not None and value_node.text is not None else ""
    if cell_type == "s":
        try:
            return shared[int(value)]
        except (ValueError, IndexError):
            return ""
    if cell_type == "b":
        return "TRUE" if value == "1" else "FALSE"
    return value


def _csv_safe(value: str) -> str:
    stripped = value.lstrip()
    if stripped.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def _sheet_rows(archive: zipfile.ZipFile, path: str, shared: list[str]) -> list[list[str]]:
    try:
        root = ET.fromstring(archive.read(path))
    except KeyError as exc:
        raise HTTPException(status_code=502, detail=f"OCR workbook is missing worksheet part: {path}") from exc
    rows: list[list[str]] = []
    cell_count = 0
    for row in root.findall(f".//{{{MAIN_NS}}}row"):
        values: dict[int, str] = {}
        max_col = 0
        for cell in row.findall(f"{{{MAIN_NS}}}c"):
            cell_count += 1
            if cell_count > MAX_CELLS_PER_SHEET:
                raise HTTPException(status_code=422, detail="OCR worksheet exceeds CSV cell limit")
            col = _column_index(cell.attrib.get("r", "A1"))
            text = _csv_safe(_cell_text(cell, shared))
            values[col] = text
            max_col = max(max_col, col)
        if max_col:
            rendered = [values.get(index, "") for index in range(1, max_col + 1)]
            while rendered and rendered[-1] == "":
                rendered.pop()
            rows.append(rendered)
        else:
            rows.append([])
    while rows and not any(value != "" for value in rows[-1]):
        rows.pop()
    return rows


def _rows_to_csv(rows: list[list[str]]) -> bytes:
    text = io.StringIO(newline="")
    writer = csv.writer(text, dialect="excel", quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + text.getvalue().encode("utf-8")


def _xlsx_to_csv_outputs(workbook: bytes, base_name: str) -> list[tuple[str, bytes]]:
    try:
        with zipfile.ZipFile(io.BytesIO(workbook)) as archive:
            shared = _shared_strings(archive)
            outputs: list[tuple[str, bytes]] = []
            used: set[str] = set()
            for index, (sheet_name, path) in enumerate(_sheet_targets(archive), start=1):
                rows = _sheet_rows(archive, path, shared)
                if not any(any(value != "" for value in row) for row in rows):
                    continue
                stem = _safe_entry_name(sheet_name, f"page-{index:03d}")
                candidate = f"{base_name}_{stem}.csv"
                serial = 2
                while candidate in used:
                    candidate = f"{base_name}_{stem}-{serial}.csv"
                    serial += 1
                used.add(candidate)
                content = _rows_to_csv(rows)
                outputs.append((candidate, content))
    except (zipfile.BadZipFile, ET.ParseError, KeyError) as exc:
        raise HTTPException(status_code=502, detail="OCR service returned an invalid XLSX workbook") from exc
    if not outputs:
        raise HTTPException(status_code=422, detail="PP-StructureV3 found no exportable table cells")
    if sum(len(content) for _, content in outputs) > MAX_CSV_OUTPUT_SIZE:
        raise HTTPException(status_code=413, detail="Generated CSV output exceeds 250 MB limit")
    return outputs


@router.post("/pdf/to-csv")
def pdf_to_csv(file: UploadFile = File(...)) -> Response:
    data, filename = _read_pdf(file)
    try:
        with httpx.Client(timeout=httpx.Timeout(300.0, connect=10.0)) as client:
            upstream = client.post(
                f"{OCR_SERVICE_URL}/ocr/xlsx",
                files={"file": (filename, data, "application/pdf")},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="OCR service is unavailable") from exc

    if upstream.status_code >= 400:
        try:
            detail = upstream.json().get("detail", upstream.text)
        except ValueError:
            detail = upstream.text
        raise HTTPException(status_code=upstream.status_code, detail=str(detail)[:2000])
    if len(upstream.content) > MAX_XLSX_SIZE:
        raise HTTPException(status_code=502, detail="OCR workbook exceeds 250 MB conversion limit")

    base_name = _safe_base_name(filename)
    outputs = _xlsx_to_csv_outputs(upstream.content, base_name)
    engine = upstream.headers.get("x-solyan-ocr-engine", "PP-StructureV3")
    headers = {
        "X-SolYan-CSV-Engine": engine,
        "X-SolYan-CSV-Files": str(len(outputs)),
    }
    if len(outputs) == 1:
        output_name, content = outputs[0]
        headers["Content-Disposition"] = f'attachment; filename="{output_name}"'
        return Response(content=content, media_type="text/csv", headers=headers)

    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for output_name, content in outputs:
            archive.writestr(output_name, content)
    payload = archive_buffer.getvalue()
    if len(payload) > MAX_CSV_OUTPUT_SIZE:
        raise HTTPException(status_code=413, detail="Generated CSV archive exceeds 250 MB limit")
    headers["Content-Disposition"] = f'attachment; filename="{base_name}_csv.zip"'
    return Response(content=payload, media_type="application/zip", headers=headers)
