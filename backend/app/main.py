from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .archive_proxy import router as archive_router
from .bloom_proxy import router as bloom_router
from .network import router as network_router
from .ocr_proxy import router as ocr_router
from .office_proxy import router as office_router
from .sign_proxy import router as sign_router

MAX_FILE_SIZE = 100 * 1024 * 1024

app = FastAPI(title="SolYan PDF API", version="0.1.2")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("SOLYAN_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(network_router)
app.include_router(ocr_router)
app.include_router(office_router)
app.include_router(sign_router)
app.include_router(archive_router)
app.include_router(bloom_router)


def _require_qpdf() -> None:
    try:
        subprocess.run(["qpdf", "--version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise HTTPException(status_code=503, detail="qpdf engine is unavailable") from exc


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF header")
    return data


def _run_qpdf(data: bytes, args: list[str], filename: str) -> Response:
    _require_qpdf()
    with tempfile.TemporaryDirectory(prefix="solyan-pdf-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        output_path = Path(temp_dir) / "output.pdf"
        input_path.write_bytes(data)
        command = ["qpdf", *args, str(input_path), str(output_path)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=120)
        if result.returncode not in (0, 3):
            detail = (result.stderr or result.stdout or "qpdf failed").strip()[-1200:]
            raise HTTPException(status_code=422, detail=detail)
        if not output_path.exists():
            raise HTTPException(status_code=500, detail="qpdf did not produce an output file")
        return Response(
            content=output_path.read_bytes(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@app.get("/health")
def health() -> dict[str, str]:
    _require_qpdf()
    return {"status": "ok", "engine": "qpdf"}


@app.post("/pdf/protect")
def protect_pdf(
    file: UploadFile = File(...),
    password: str = Form(..., min_length=1, max_length=128),
    owner_password: str | None = Form(default=None, max_length=128),
) -> Response:
    data = _read_pdf(file)
    owner = owner_password or password
    return _run_qpdf(data, ["--encrypt", password, owner, "256", "--"], "solyan-protected.pdf")


@app.post("/pdf/unlock")
def unlock_pdf(
    file: UploadFile = File(...),
    password: str = Form(default="", max_length=128),
) -> Response:
    data = _read_pdf(file)
    return _run_qpdf(data, [f"--password={password}", "--decrypt"], "solyan-unlocked.pdf")


@app.post("/pdf/repair")
def repair_pdf(file: UploadFile = File(...)) -> Response:
    data = _read_pdf(file)
    return _run_qpdf(data, [], "solyan-repaired.pdf")


@app.post("/pdf/compress")
def compress_pdf(file: UploadFile = File(...)) -> Response:
    data = _read_pdf(file)
    return _run_qpdf(
        data,
        ["--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9"],
        "solyan-compressed.pdf",
    )
