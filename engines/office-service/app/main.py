from __future__ import annotations

import io
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

MAX_FILE_SIZE = int(os.getenv("OFFICE_MAX_FILE_SIZE", str(100 * 1024 * 1024)))
SUPPORTED_SUFFIXES = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf"}
PDF_IMPORT_TARGETS = {"docx", "pptx", "rtf"}
OOXML_MEDIA_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

app = FastAPI(title="SolYan Office Conversion Service", version="0.1.0")


def _libreoffice_binary() -> str:
    for binary in ("libreoffice", "soffice"):
        try:
            result = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return binary
        except (OSError, subprocess.TimeoutExpired):
            continue
    raise HTTPException(status_code=503, detail="LibreOffice engine is unavailable")


def _run_libreoffice_conversion(
    binary: str,
    input_path: Path,
    output_dir: Path,
    profile_dir: Path,
    convert_to: str,
    *,
    infilter: str | None = None,
    timeout: int = 180,
) -> subprocess.CompletedProcess[str]:
    command = [
        binary,
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        f"-env:UserInstallation={profile_dir.as_uri()}",
    ]
    if infilter:
        command.append(f"--infilter={infilter}")
    command.extend([
        "--convert-to",
        convert_to,
        "--outdir",
        str(output_dir),
        str(input_path),
    ])
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="LibreOffice conversion timed out") from exc


def _conversion_error(result: subprocess.CompletedProcess[str], fallback: str) -> HTTPException:
    detail = (result.stderr or result.stdout or fallback).strip()[-2000:]
    return HTTPException(status_code=422, detail=detail)


def _is_ooxml_package(content: bytes, target: str) -> bool:
    required = {
        "docx": "word/document.xml",
        "pptx": "ppt/presentation.xml",
    }[target]
    try:
        with zipfile.ZipFile(io.BytesIO(content), "r") as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names or required not in names:
                return False
            if target == "pptx":
                return any(name.startswith("ppt/slides/slide") and name.endswith(".xml") for name in names)
            return True
    except (zipfile.BadZipFile, OSError):
        return False


def _pdf_to_office_with_libreoffice(data: bytes, target: str) -> bytes:
    """Import a PDF with LibreOffice's target-specific PDF filter, then export OOXML.

    The two-stage ODT/ODP bridge prevents Writer/Impress filter mismatches from
    producing syntactically valid but empty OOXML files. This is a fidelity
    fallback, not a replacement for editable-first engines such as Bloom.
    """

    if target not in {"docx", "pptx"}:
        raise HTTPException(status_code=400, detail="LibreOffice OOXML PDF import supports docx or pptx")

    binary = _libreoffice_binary()
    config = {
        "docx": {
            "input_filter": "writer_pdf_import",
            "intermediate_ext": ".odt",
            "intermediate_filter": "odt:writer8",
            "output_filter": "docx:MS Word 2007 XML",
        },
        "pptx": {
            "input_filter": "impress_pdf_import",
            "intermediate_ext": ".odp",
            "intermediate_filter": "odp:impress8",
            "output_filter": "pptx:Impress MS PowerPoint 2007 XML",
        },
    }[target]

    with tempfile.TemporaryDirectory(prefix="solyan-pdf-office-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / "input.pdf"
        stage_one = root / "stage-one"
        stage_two = root / "stage-two"
        profile_one = root / "profile-one"
        profile_two = root / "profile-two"
        for path in (stage_one, stage_two, profile_one, profile_two):
            path.mkdir()
        input_path.write_bytes(data)

        imported = _run_libreoffice_conversion(
            binary,
            input_path,
            stage_one,
            profile_one,
            config["intermediate_filter"],
            infilter=config["input_filter"],
        )
        intermediate = stage_one / f"input{config['intermediate_ext']}"
        if imported.returncode != 0 or not intermediate.exists() or intermediate.stat().st_size == 0:
            raise _conversion_error(imported, f"LibreOffice {target} PDF import failed")

        exported = _run_libreoffice_conversion(
            binary,
            intermediate,
            stage_two,
            profile_two,
            config["output_filter"],
        )
        output_path = stage_two / f"input.{target}"
        if exported.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
            raise _conversion_error(exported, f"LibreOffice {target} OOXML export failed")

        content = output_path.read_bytes()
        if not _is_ooxml_package(content, target):
            raise HTTPException(status_code=422, detail=f"LibreOffice produced an invalid or empty {target.upper()} package")
        return content


def _pdf_to_rtf_with_libreoffice(data: bytes) -> bytes:
    """Import PDF into Writer and export Rich Text Format with the shipped LibreOffice engine."""

    binary = _libreoffice_binary()
    with tempfile.TemporaryDirectory(prefix="solyan-pdf-rtf-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / "input.pdf"
        output_dir = root / "output"
        profile_dir = root / "profile"
        output_dir.mkdir()
        profile_dir.mkdir()
        input_path.write_bytes(data)

        result = _run_libreoffice_conversion(
            binary,
            input_path,
            output_dir,
            profile_dir,
            "rtf:Rich Text Format",
            infilter="writer_pdf_import",
        )
        output_path = output_dir / "input.rtf"
        if result.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
            raise _conversion_error(result, "LibreOffice RTF PDF import/export failed")

        content = output_path.read_bytes()
        if not content.lstrip().startswith(b"{\\rtf"):
            raise HTTPException(status_code=422, detail="LibreOffice produced invalid RTF output")
        return content


@app.get("/health")
def health() -> dict[str, str]:
    binary = _libreoffice_binary()
    result = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=10)
    return {"status": "ok", "engine": result.stdout.strip() or "LibreOffice"}


@app.post("/convert/to-pdf")
def convert_to_pdf(file: UploadFile = File(...)) -> Response:
    suffix = Path(file.filename or "document.bin").suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=400, detail=f"Unsupported Office input type: {suffix or 'unknown'}")

    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Office input exceeds 100 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    binary = _libreoffice_binary()
    with tempfile.TemporaryDirectory(prefix="solyan-office-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / f"input{suffix}"
        output_dir = root / "output"
        profile_dir = root / "profile"
        output_dir.mkdir()
        profile_dir.mkdir()
        input_path.write_bytes(data)

        result = _run_libreoffice_conversion(binary, input_path, output_dir, profile_dir, "pdf")
        output_path = output_dir / "input.pdf"
        if result.returncode != 0 or not output_path.exists():
            raise _conversion_error(result, "LibreOffice conversion failed")

        stem = Path(file.filename or "document").stem or "document"
        return Response(
            content=output_path.read_bytes(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{stem}.pdf"'},
        )


@app.post("/convert/pdf-to-office")
def convert_pdf_to_office(
    file: UploadFile = File(...),
    target: str = Form(default="docx"),
) -> Response:
    if target not in PDF_IMPORT_TARGETS:
        raise HTTPException(status_code=400, detail="Target must be docx, pptx or rtf")

    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a PDF")

    if target == "rtf":
        content = _pdf_to_rtf_with_libreoffice(data)
        media_type = "application/rtf"
    else:
        content = _pdf_to_office_with_libreoffice(data, target)
        media_type = OOXML_MEDIA_TYPES[target]

    stem = Path(file.filename or "document.pdf").stem or "document"
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{stem}.{target}"',
            "X-SolYan-Conversion-Engine": "LibreOffice-PDF-import",
        },
    )
