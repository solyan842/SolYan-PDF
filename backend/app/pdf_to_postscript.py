from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from .pdf_to_svg import router as pdf_to_svg_router
from .sanitize import _read_pdf

router = APIRouter()
router.include_router(pdf_to_svg_router)

COMMAND_TIMEOUT_SECONDS = 180
MAX_OUTPUT_BYTES = 250 * 1024 * 1024
MAX_PAGE_NUMBER = 10_000
OUTPUT_FORMATS = {"ps", "eps"}
POSTSCRIPT_LEVELS = {2, 3}


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C.UTF-8"
    return env


def _require_pdftops() -> None:
    try:
        subprocess.run(
            ["pdftops", "-v"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            env=_command_env(),
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="Poppler pdftops engine is unavailable") from exc


def _run_pdftops(command: list[str]) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDF to PostScript conversion timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="Poppler pdftops engine is unavailable") from exc


def _conversion_error(result: subprocess.CompletedProcess[bytes]) -> HTTPException:
    detail = (result.stderr or result.stdout or b"pdftops conversion failed").decode(
        "utf-8", errors="replace"
    ).strip()[-1200:]
    lowered = detail.lower()
    if "password" in lowered or "encrypted" in lowered:
        return HTTPException(status_code=401, detail="PDF password is required or invalid")
    return HTTPException(status_code=422, detail=detail or "pdftops conversion failed")


def _convert_pdf_to_postscript(
    data: bytes,
    *,
    output_format: str,
    level: int,
    password: str | None,
    first_page: int | None,
    last_page: int | None,
) -> bytes:
    _require_pdftops()
    output_format = output_format.lower()
    if output_format not in OUTPUT_FORMATS:
        raise HTTPException(status_code=422, detail="Output format must be ps or eps")
    if level not in POSTSCRIPT_LEVELS:
        raise HTTPException(status_code=422, detail="PostScript level must be 2 or 3")
    if first_page is not None and last_page is not None and first_page > last_page:
        raise HTTPException(status_code=422, detail="First page cannot be greater than last page")

    if output_format == "eps":
        if first_page is not None and last_page is not None and first_page != last_page:
            raise HTTPException(status_code=422, detail="EPS output supports exactly one PDF page")
        selected_page = first_page if first_page is not None else last_page
        first_page = selected_page or 1
        last_page = first_page

    with tempfile.TemporaryDirectory(prefix="solyan-pdf-postscript-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        output_path = Path(temp_dir) / f"output.{output_format}"
        input_path.write_bytes(data)

        base_command = ["pdftops", f"-level{level}"]
        if output_format == "eps":
            base_command.append("-eps")
        else:
            # Preserve mixed source page sizes/orientations explicitly for PS.
            base_command.append("-origpagesizes")
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

        result: subprocess.CompletedProcess[bytes] | None = None
        for index, command in enumerate(attempts):
            output_path.unlink(missing_ok=True)
            result = _run_pdftops(command)
            if result.returncode == 0 and output_path.is_file():
                break
            if not password or index == len(attempts) - 1:
                raise _conversion_error(result)
        else:
            raise HTTPException(status_code=422, detail="pdftops conversion failed")

        output_size = output_path.stat().st_size
        if output_size <= 0:
            raise HTTPException(status_code=422, detail="pdftops produced an empty output")
        if output_size > MAX_OUTPUT_BYTES:
            raise HTTPException(status_code=413, detail="Generated PostScript exceeds 250 MB limit")

        output = output_path.read_bytes()
        if not output.startswith(b"%!PS-Adobe-"):
            raise HTTPException(status_code=502, detail="Poppler returned an invalid PostScript header")
        if output_format == "eps" and b"EPSF" not in output[:128]:
            raise HTTPException(status_code=502, detail="Poppler returned an invalid EPS header")
        return output


@router.post("/pdf/to-postscript")
def pdf_to_postscript(
    file: UploadFile = File(...),
    output_format: str = Form(default="ps", max_length=8),
    level: int = Form(default=3, ge=2, le=3),
    password: str | None = Form(default=None, max_length=128),
    first_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
    last_page: int | None = Form(default=None, ge=1, le=MAX_PAGE_NUMBER),
) -> Response:
    data = _read_pdf(file)
    normalized_format = output_format.lower()
    output = _convert_pdf_to_postscript(
        data,
        output_format=normalized_format,
        level=level,
        password=password or None,
        first_page=first_page,
        last_page=last_page,
    )
    media_type = "application/postscript"
    filename = f"solyan-pdf.{normalized_format}"
    return Response(
        content=output,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-SolYan-PostScript-Format": normalized_format,
            "X-SolYan-PostScript-Level": str(level),
        },
    )
