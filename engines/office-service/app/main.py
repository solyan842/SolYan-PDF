from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response

MAX_FILE_SIZE = int(os.getenv("OFFICE_MAX_FILE_SIZE", str(100 * 1024 * 1024)))
SUPPORTED_SUFFIXES = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf"}

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

        command = [
            binary,
            "--headless",
            "--nologo",
            "--nodefault",
            "--nofirststartwizard",
            f"-env:UserInstallation={profile_dir.as_uri()}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output_dir),
            str(input_path),
        ]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="LibreOffice conversion timed out") from exc

        output_path = output_dir / "input.pdf"
        if result.returncode != 0 or not output_path.exists():
            detail = (result.stderr or result.stdout or "LibreOffice conversion failed").strip()[-2000:]
            raise HTTPException(status_code=422, detail=detail)

        stem = Path(file.filename or "document").stem or "document"
        return Response(
            content=output_path.read_bytes(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{stem}.pdf"'},
        )
