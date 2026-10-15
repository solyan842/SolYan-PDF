from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .sanitize import _read_pdf

router = APIRouter()

COMMAND_TIMEOUT_SECONDS = 180
MAX_TEXT_BYTES = 50 * 1024 * 1024
MAX_PAGE_NUMBER = 10_000


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C.UTF-8"
    return env


def _require_pdftotext() -> None:
    try:
        subprocess.run(
            ["pdftotext", "-v"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            env=_command_env(),
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="Poppler pdftotext engine is unavailable") from exc


def _run_pdftotext(command: list[str]) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDF to text conversion timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Poppler pdftotext engine is unavailable") from exc


def _convert_pdf_to_text(
    data: bytes,
    *,
    password: str | None,
    first_page: int | None,
    last_page: int | None,
    layout: bool,
    preserve_page_breaks: bool,
) -> bytes:
    _require_pdftotext()
    if first_page is not None and last_page is not None and first_page > last_page:
        raise HTTPException(status_code=422, detail="First page cannot be greater than last page")

    with tempfile.TemporaryDirectory(prefix="solyan-pdf-text-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        input_path.write_bytes(data)

        base_command = ["pdftotext", "-enc", "UTF-8"]
        if layout:
            base_command.append("-layout")
        if not preserve_page_breaks:
            base_command.append("-nopgbrk")
        if first_page is not None:
            base_command.extend(["-f", str(first_page)])
        if last_page is not None:
            base_command.extend(["-l", str(last_page)])

        attempts: list[list[str]] = []
        if password:
            attempts.append([*base_command, "-upw", password, str(input_path), "-"])
            attempts.append([*base_command, "-opw", password, str(input_path), "-"])
        else:
            attempts.append([*base_command, str(input_path), "-"])

        result: subprocess.CompletedProcess[bytes] | None = None
        for index, command in enumerate(attempts):
            result = _run_pdftotext(command)
            if result.returncode == 0:
                break
            if not password or index == len(attempts) - 1:
                detail = (result.stderr or result.stdout or b"pdftotext conversion failed").decode(
                    "utf-8", errors="replace"
                ).strip()[-1200:]
                lowered = detail.lower()
                if "password" in lowered or "encrypted" in lowered:
                    raise HTTPException(status_code=401, detail="PDF password is required or invalid")
                raise HTTPException(status_code=422, detail=detail)
        else:
            raise HTTPException(status_code=422, detail="pdftotext conversion failed")

        output = result.stdout if result is not None else b""
        if len(output) > MAX_TEXT_BYTES:
            raise HTTPException(status_code=413, detail="Generated text exceeds 50 MB limit")
        return output


@router.post("/pdf/to-text")
def pdf_to_text(
    file: UploadFile = File(...),
    password: str | None = Form(default=None, max_length=128),
    first_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    last_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    layout: bool = Form(default=False),
    preserve_page_breaks: bool = Form(default=True),
) -> Response:
    data = _read_pdf(file)
    output = _convert_pdf_to_text(
        data,
        password=password or None,
        first_page=first_page,
        last_page=last_page,
        layout=layout,
        preserve_page_breaks=preserve_page_breaks,
    )
    return Response(
        content=output,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="solyan-pdf.txt"'},
    )
