from __future__ import annotations

import html
import os
import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .sanitize import _read_pdf

router = APIRouter()

COMMAND_TIMEOUT_SECONDS = 180
MAX_HTML_BYTES = 150 * 1024 * 1024
MAX_PAGE_NUMBER = 10_000

DANGEROUS_HREF_RE = re.compile(
    r'(?i)(href\s*=\s*)(["\'])(\s*(?:javascript|vbscript|file|data)\s*:.*?)(\2)',
    re.DOTALL,
)
HEAD_RE = re.compile(r"(?i)<head(?:\s[^>]*)?>")
CSP_META = (
    '<meta http-equiv="Content-Security-Policy" '
    'content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; '
    'font-src data:; object-src \'none\'; base-uri \'none\'; form-action \'none\'"/>'
)


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C.UTF-8"
    return env


def _require_pdftohtml() -> None:
    try:
        subprocess.run(
            ["pdftohtml", "-v"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            env=_command_env(),
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="Poppler pdftohtml engine is unavailable") from exc


def _run_pdftohtml(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDF to HTML conversion timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Poppler pdftohtml engine is unavailable") from exc


def _sanitize_html_document(document: str) -> tuple[str, int]:
    def replace_href(match: re.Match[str]) -> str:
        prefix, quote = match.group(1), match.group(2)
        return f"{prefix}{quote}#{quote}"

    document, blocked_links = DANGEROUS_HREF_RE.subn(replace_href, document)
    if "Content-Security-Policy" not in document:
        head = HEAD_RE.search(document)
        if head:
            document = document[: head.end()] + "\n" + CSP_META + document[head.end() :]
        else:
            document = CSP_META + "\n" + document
    return document, blocked_links


def _convert_pdf_to_html(
    data: bytes,
    *,
    password: str | None,
    first_page: int | None,
    last_page: int | None,
) -> tuple[bytes, int]:
    _require_pdftohtml()
    if first_page is not None and last_page is not None and first_page > last_page:
        raise HTTPException(status_code=422, detail="First page cannot be greater than last page")

    with tempfile.TemporaryDirectory(prefix="solyan-pdf-html-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / "input.pdf"
        output_path = root / "solyan-pdf.html"
        input_path.write_bytes(data)

        base_command = [
            "pdftohtml",
            "-q",
            "-s",
            "-noframes",
            "-dataurls",
            "-enc",
            "UTF-8",
        ]
        if first_page is not None:
            base_command.extend(["-f", str(first_page)])
        if last_page is not None:
            base_command.extend(["-l", str(last_page)])

        attempts: list[list[str]] = []
        if password:
            attempts.append([*base_command, "-upw", password, str(input_path), str(output_path)])
            attempts.append([*base_command, "-opw", password, str(input_path), str(output_path)])
        else:
            attempts.append([*base_command, str(input_path), str(output_path)])

        result: subprocess.CompletedProcess[str] | None = None
        for index, command in enumerate(attempts):
            if output_path.exists():
                output_path.unlink()
            result = _run_pdftohtml(command)
            if result.returncode == 0 and output_path.exists():
                break
            if not password or index == len(attempts) - 1:
                detail = (result.stderr or result.stdout or "pdftohtml conversion failed").strip()[-1200:]
                lowered = detail.lower()
                if "password" in lowered or "encrypted" in lowered:
                    raise HTTPException(status_code=401, detail="PDF password is required or invalid")
                raise HTTPException(status_code=422, detail=detail)
        else:
            raise HTTPException(status_code=422, detail="pdftohtml conversion failed")

        raw = output_path.read_bytes()
        if len(raw) > MAX_HTML_BYTES:
            raise HTTPException(status_code=413, detail="Generated HTML exceeds 150 MB limit")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")

        safe_html, blocked_links = _sanitize_html_document(text)
        encoded = safe_html.encode("utf-8")
        if len(encoded) > MAX_HTML_BYTES:
            raise HTTPException(status_code=413, detail="Generated HTML exceeds 150 MB limit")
        return encoded, blocked_links


@router.post("/pdf/to-html")
def pdf_to_html(
    file: UploadFile = File(...),
    password: str | None = Form(default=None, max_length=128),
    first_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    last_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
) -> Response:
    data = _read_pdf(file)
    output, blocked_links = _convert_pdf_to_html(
        data,
        password=password or None,
        first_page=first_page,
        last_page=last_page,
    )
    return Response(
        content=output,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-pdf.html"',
            "X-SolYan-Blocked-HTML-Links": str(blocked_links),
        },
    )
