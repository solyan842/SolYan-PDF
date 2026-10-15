from __future__ import annotations

import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .pdf_to_html import _command_env, _require_pdftohtml
from .sanitize import _read_pdf

router = APIRouter()

COMMAND_TIMEOUT_SECONDS = 180
MAX_XML_BYTES = 100 * 1024 * 1024
MAX_PAGE_NUMBER = 10_000


def _run_pdftohtml_xml(command: list[str]) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDF to XML conversion timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Poppler pdftohtml engine is unavailable") from exc


def _convert_pdf_to_xml(
    data: bytes,
    *,
    password: str | None,
    first_page: int | None,
    last_page: int | None,
    precise_coordinates: bool,
    include_hidden_text: bool,
) -> tuple[bytes, int]:
    _require_pdftohtml()
    if first_page is not None and last_page is not None and first_page > last_page:
        raise HTTPException(status_code=422, detail="First page cannot be greater than last page")

    with tempfile.TemporaryDirectory(prefix="solyan-pdf-xml-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        input_path.write_bytes(data)

        base_command = [
            "pdftohtml",
            "-xml",
            "-stdout",
            "-i",
            "-enc",
            "UTF-8",
        ]
        if precise_coordinates:
            base_command.append("-noroundcoord")
        if include_hidden_text:
            base_command.append("-hidden")
        if first_page is not None:
            base_command.extend(["-f", str(first_page)])
        if last_page is not None:
            base_command.extend(["-l", str(last_page)])

        attempts: list[list[str]] = []
        if password:
            attempts.append([*base_command, "-upw", password, str(input_path)])
            attempts.append([*base_command, "-opw", password, str(input_path)])
        else:
            attempts.append([*base_command, str(input_path)])

        result: subprocess.CompletedProcess[bytes] | None = None
        for index, command in enumerate(attempts):
            result = _run_pdftohtml_xml(command)
            if result.returncode == 0:
                break
            if not password or index == len(attempts) - 1:
                detail = (result.stderr or result.stdout or b"pdftohtml XML conversion failed").decode(
                    "utf-8", errors="replace"
                ).strip()[-1200:]
                lowered = detail.lower()
                if "password" in lowered or "encrypted" in lowered:
                    raise HTTPException(status_code=401, detail="PDF password is required or invalid")
                raise HTTPException(status_code=422, detail=detail)
        else:
            raise HTTPException(status_code=422, detail="pdftohtml XML conversion failed")

        output = result.stdout if result is not None else b""
        if len(output) > MAX_XML_BYTES:
            raise HTTPException(status_code=413, detail="Generated XML exceeds 100 MB limit")
        if not output.strip():
            raise HTTPException(status_code=422, detail="Poppler produced empty XML output")

        # Poppler emits its standard pdf2xml DOCTYPE. Keep that trusted converter
        # declaration, but reject entity declarations before parsing/returning XML.
        upper_prefix = output[:4096].upper()
        if b"<!ENTITY" in upper_prefix:
            raise HTTPException(status_code=500, detail="Generated XML contains an unexpected entity declaration")
        try:
            root = ET.fromstring(output)
        except ET.ParseError as exc:
            raise HTTPException(status_code=500, detail="Poppler produced invalid XML output") from exc
        if root.tag != "pdf2xml":
            raise HTTPException(status_code=500, detail="Poppler XML root is unexpected")
        page_count = sum(1 for child in root if child.tag == "page")
        return output, page_count


@router.post("/pdf/to-xml")
def pdf_to_xml(
    file: UploadFile = File(...),
    password: str | None = Form(default=None, max_length=128),
    first_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    last_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    precise_coordinates: bool = Form(default=False),
    include_hidden_text: bool = Form(default=False),
) -> Response:
    data = _read_pdf(file)
    output, page_count = _convert_pdf_to_xml(
        data,
        password=password or None,
        first_page=first_page,
        last_page=last_page,
        precise_coordinates=precise_coordinates,
        include_hidden_text=include_hidden_text,
    )
    return Response(
        content=output,
        media_type="application/xml; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-pdf.xml"',
            "X-SolYan-XML-Pages": str(page_count),
        },
    )
