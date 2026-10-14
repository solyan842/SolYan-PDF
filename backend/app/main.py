from __future__ import annotations

import os
import secrets
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .active_content import router as active_content_router
from .archive_proxy import router as archive_router
from .attachments import router as attachments_router
from .bloom_proxy import router as bloom_router
from .extract_images import router as extract_images_router
from .network import router as network_router
from .ocr_proxy import router as ocr_router
from .office_proxy import router as office_router
from .remove_annotations import router as remove_annotations_router
from .remove_blank_pages import router as remove_blank_pages_router
from .remove_images import router as remove_images_router
from .remove_signatures import router as remove_signatures_router
from .sanitize import router as sanitize_router
from .sign_proxy import router as sign_router

MAX_FILE_SIZE = 100 * 1024 * 1024
PRINT_MODES = {"none", "low", "full"}
MODIFY_MODES = {"none", "assembly", "form", "annotate", "all"}

app = FastAPI(title="SolYan PDF API", version="0.1.5")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("SOLYAN_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-SolYan-OCR-Engine",
        "X-SolYan-OCR-Pages",
        "X-SolYan-OCR-Table-Workbooks",
        "X-SolYan-Extracted-Images",
        "X-SolYan-Images-Removed",
        "X-SolYan-Blank-Pages-Removed",
        "X-SolYan-Blank-Pages",
        "X-SolYan-Blank-Threshold",
        "X-SolYan-Blank-White-Percent",
        "X-SolYan-Sanitize-Actions-Removed",
        "X-SolYan-Sanitize-Links-Removed",
        "X-SolYan-Sanitize-Metadata-Removed",
        "X-SolYan-Sanitize-Embedded-Files-Removed",
        "X-SolYan-Sanitize-Active-Annotations-Removed",
        "X-SolYan-Comments-Removed",
        "X-SolYan-Other-Annotations-Removed",
        "X-SolYan-Widgets-Preserved",
        "X-SolYan-Signature-Fields-Removed",
        "X-SolYan-Signature-Widgets-Removed",
        "X-SolYan-Signature-Values-Removed",
        "X-SolYan-Signature-Permissions-Removed",
        "X-SolYan-Signature-DSS-Removed",
        "X-SolYan-Auto-Split-Dividers",
        "X-SolYan-Auto-Split-Parts",
        "X-SolYan-Auto-Split-Duplex",
    ],
)
app.include_router(network_router)
app.include_router(ocr_router)
app.include_router(office_router)
app.include_router(sign_router)
app.include_router(archive_router)
app.include_router(bloom_router)
app.include_router(extract_images_router)
app.include_router(remove_images_router)
app.include_router(remove_blank_pages_router)
app.include_router(attachments_router)
app.include_router(sanitize_router)
app.include_router(remove_annotations_router)
app.include_router(remove_signatures_router)
app.include_router(active_content_router)


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
    print_mode: str = Form(default="full"),
    modify_mode: str = Form(default="all"),
    allow_extract: bool = Form(default=True),
) -> Response:
    if print_mode not in PRINT_MODES:
        raise HTTPException(status_code=422, detail="print_mode must be one of: none, low, full")
    if modify_mode not in MODIFY_MODES:
        raise HTTPException(status_code=422, detail="modify_mode must be one of: none, assembly, form, annotate, all")

    data = _read_pdf(file)
    # Restrictions are owner-vs-user semantics. Reusing the user password as the
    # owner password would let anyone who can open the file bypass restrictions.
    owner = owner_password or secrets.token_urlsafe(32)
    return _run_qpdf(
        data,
        [
            "--encrypt",
            password,
            owner,
            "256",
            f"--print={print_mode}",
            f"--modify={modify_mode}",
            f"--extract={'y' if allow_extract else 'n'}",
            "--",
        ],
        "solyan-protected.pdf",
    )


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


@app.post("/pdf/decompress")
def decompress_pdf(file: UploadFile = File(...)) -> Response:
    """Expand generalized PDF streams and disable object streams for inspection/debugging.

    This is a structural rewrite, not a repair or size-reduction operation. qpdf
    preserves page content semantics while making supported streams and indirect
    objects easier to inspect with ordinary text-oriented PDF tooling.
    """
    data = _read_pdf(file)
    return _run_qpdf(
        data,
        ["--stream-data=uncompress", "--object-streams=disable"],
        "solyan-decompressed.pdf",
    )


@app.post("/pdf/web-optimize")
def web_optimize_pdf(file: UploadFile = File(...)) -> Response:
    data = _read_pdf(file)
    return _run_qpdf(data, ["--linearize"], "solyan-web-optimized.pdf")


@app.post("/pdf/flatten")
def flatten_pdf(file: UploadFile = File(...)) -> Response:
    data = _read_pdf(file)
    return _run_qpdf(
        data,
        ["--generate-appearances", "--flatten-annotations=all"],
        "solyan-flattened.pdf",
    )


@app.post("/pdf/compress-images")
def compress_images_pdf(file: UploadFile = File(...)) -> Response:
    data = _read_pdf(file)
    return _run_qpdf(
        data,
        [
            "--compress-streams=y",
            "--decode-level=generalized",
            "--recompress-flate",
            "--compression-level=9",
            "--optimize-images",
            "--object-streams=generate",
        ],
        "solyan-image-compressed.pdf",
    )
