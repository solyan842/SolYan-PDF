from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response

MAX_FILE_SIZE = int(os.getenv("PDFA_MAX_FILE_SIZE", str(100 * 1024 * 1024)))

app = FastAPI(title="SolYan PDF/A Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    if os.getenv("SOLYAN_ARCHIVE_WORKER_EXE"):
        # The frozen executable is not a Python interpreter (-m cannot work).
        from importlib.metadata import version
        return {"status": "ok", "engine": "OCRmyPDF", "version": version("ocrmypdf")}
    result = subprocess.run([sys.executable, "-m", "ocrmypdf", "--version"], capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        raise HTTPException(status_code=503, detail="OCRmyPDF engine is unavailable")
    return {"status": "ok", "engine": "OCRmyPDF", "version": result.stdout.strip()}


@app.post("/pdfa/internal")
def convert_pdfa(file: UploadFile = File(...)) -> Response:
    data = file.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a PDF")

    with tempfile.TemporaryDirectory(prefix="solyan-pdfa-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / "input.pdf"
        output_path = root / "output.pdf"
        input_path.write_bytes(data)
        command = [
            sys.executable,
            "-m",
            "ocrmypdf",
            "--mode", "skip",
            "--ocr-engine", "none",
            "--output-type", "pdfa",
            "--pdfa-backend", "internal",
            "--rasterizer", "pypdfium",
            "--optimize", "0",
            "--fast-web-view", "999999",
            str(input_path),
            str(output_path),
        ]
        frozen_worker = os.getenv("SOLYAN_ARCHIVE_WORKER_EXE", "")
        if frozen_worker:
            # Preserve the CLI's 240-second timeout and isolation. Only a
            # trusted bundled executable is configured by archive_runner.
            command = [frozen_worker, "--pdfa-worker", str(input_path), str(output_path)]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=240)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="PDF/A conversion timed out") from exc

        if result.returncode != 0 or not output_path.exists():
            detail = (result.stderr or result.stdout or "PDF/A conversion failed").strip()[-3000:]
            raise HTTPException(
                status_code=422,
                detail=f"Không thể tạo PDF/A bằng internal validator; không fallback Ghostscript. {detail}",
            )

        return Response(
            content=output_path.read_bytes(),
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="solyan-archive-pdfa.pdf"'},
        )
