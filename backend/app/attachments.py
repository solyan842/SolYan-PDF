from __future__ import annotations

import json
import mimetypes
import os
import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

router = APIRouter()

MAX_PDF_SIZE = 100 * 1024 * 1024
MAX_ATTACHMENT_COUNT = 20
MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
MAX_ATTACHMENT_TOTAL = 50 * 1024 * 1024
MAX_EXTRACTED_SIZE = 100 * 1024 * 1024
COMMAND_TIMEOUT_SECONDS = 120


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    return env


def _require_qpdf() -> None:
    try:
        subprocess.run(
            ["qpdf", "--version"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            env=_env(),
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="qpdf attachment engine is unavailable") from exc


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_PDF_SIZE + 1)
    if len(data) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF header")
    return data


def _safe_name(value: str | None, fallback: str) -> str:
    name = Path(value or fallback).name.strip() or fallback
    name = re.sub(r"[\x00-\x1f\x7f]", "_", name)
    return name[:255]


def _run_text(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="qpdf attachment operation timed out") from exc
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf attachment operation failed").strip()[-1600:]
        raise HTTPException(status_code=422, detail=detail)
    return result


def _attachment_map(input_path: Path) -> dict[str, dict]:
    result = _run_text(["qpdf", "--json", "--json-key=attachments", str(input_path)])
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Unable to parse qpdf attachment inventory") from exc
    attachments = payload.get("attachments", {})
    return attachments if isinstance(attachments, dict) else {}


def _public_inventory(attachments: dict[str, dict]) -> list[dict[str, str | int | None]]:
    items: list[dict[str, str | int | None]] = []
    for key, details in attachments.items():
        info = details if isinstance(details, dict) else {}
        filename = info.get("preferredname") or info.get("filename") or key
        stream = info.get("stream")
        filespec = info.get("filespec")
        items.append(
            {
                "key": str(key),
                "filename": str(filename),
                "stream": str(stream) if stream is not None else None,
                "filespec": str(filespec) if filespec is not None else None,
            }
        )
    return items


@router.post("/pdf/attachments/list")
def list_attachments(file: UploadFile = File(...)) -> JSONResponse:
    _require_qpdf()
    data = _read_pdf(file)
    with tempfile.TemporaryDirectory(prefix="solyan-attachments-list-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        input_path.write_bytes(data)
        items = _public_inventory(_attachment_map(input_path))
    return JSONResponse({"attachments": items, "count": len(items)})


@router.post("/pdf/attachments/add")
def add_attachments(
    file: UploadFile = File(...),
    attachments: list[UploadFile] = File(...),
) -> Response:
    _require_qpdf()
    data = _read_pdf(file)
    if not attachments:
        raise HTTPException(status_code=400, detail="Select at least one attachment")
    if len(attachments) > MAX_ATTACHMENT_COUNT:
        raise HTTPException(status_code=413, detail=f"At most {MAX_ATTACHMENT_COUNT} attachments may be added at once")

    with tempfile.TemporaryDirectory(prefix="solyan-attachments-add-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / "input.pdf"
        output_path = root / "output.pdf"
        input_path.write_bytes(data)

        command = ["qpdf", str(input_path)]
        total = 0
        seen_keys: set[str] = set()
        for index, upload in enumerate(attachments, start=1):
            payload = upload.file.read(MAX_ATTACHMENT_SIZE + 1)
            if len(payload) > MAX_ATTACHMENT_SIZE:
                raise HTTPException(status_code=413, detail=f"Attachment {index} exceeds 25 MB limit")
            total += len(payload)
            if total > MAX_ATTACHMENT_TOTAL:
                raise HTTPException(status_code=413, detail="Combined attachments exceed 50 MB limit")

            filename = _safe_name(upload.filename, f"attachment-{index}.bin")
            key = filename
            if key in seen_keys:
                stem, suffix = Path(filename).stem, Path(filename).suffix
                key = f"{stem}-{index}{suffix}"
            seen_keys.add(key)

            attachment_path = root / f"attachment-{index:03d}.bin"
            attachment_path.write_bytes(payload)
            mime = upload.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
            command.extend(
                [
                    "--add-attachment",
                    str(attachment_path),
                    f"--key={key}",
                    f"--filename={filename}",
                    f"--mimetype={mime}",
                    "--",
                ]
            )

        command.append(str(output_path))
        _run_text(command)
        if not output_path.exists():
            raise HTTPException(status_code=500, detail="qpdf did not produce an attachment PDF")
        output = output_path.read_bytes()
        if len(output) > MAX_PDF_SIZE + MAX_ATTACHMENT_TOTAL + 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Attachment output exceeds the bounded response size")

    return Response(
        content=output,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="solyan-with-attachments.pdf"'},
    )


@router.post("/pdf/attachments/extract")
def extract_attachment(
    file: UploadFile = File(...),
    key: str = Form(..., min_length=1, max_length=255),
) -> Response:
    _require_qpdf()
    data = _read_pdf(file)
    with tempfile.TemporaryDirectory(prefix="solyan-attachments-extract-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        input_path.write_bytes(data)
        inventory = _attachment_map(input_path)
        if key not in inventory:
            raise HTTPException(status_code=404, detail="Attachment key not found")
        details = inventory.get(key) if isinstance(inventory.get(key), dict) else {}
        filename = _safe_name((details or {}).get("preferredname") if isinstance(details, dict) else None, key)
        try:
            result = subprocess.run(
                ["qpdf", f"--show-attachment={key}", str(input_path)],
                capture_output=True,
                timeout=COMMAND_TIMEOUT_SECONDS,
                env=_env(),
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="Attachment extraction timed out") from exc
        if result.returncode not in (0, 3):
            detail = result.stderr.decode("utf-8", "replace").strip()[-1600:] or "qpdf attachment extraction failed"
            raise HTTPException(status_code=422, detail=detail)
        if len(result.stdout) > MAX_EXTRACTED_SIZE:
            raise HTTPException(status_code=413, detail="Extracted attachment exceeds 100 MB limit")

    return Response(
        content=result.stdout,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename.replace(chr(34), "_")}"'},
    )


@router.post("/pdf/attachments/remove")
def remove_attachment(
    file: UploadFile = File(...),
    key: str = Form(..., min_length=1, max_length=255),
) -> Response:
    _require_qpdf()
    data = _read_pdf(file)
    with tempfile.TemporaryDirectory(prefix="solyan-attachments-remove-") as temp_dir:
        root = Path(temp_dir)
        input_path = root / "input.pdf"
        output_path = root / "output.pdf"
        input_path.write_bytes(data)
        inventory = _attachment_map(input_path)
        if key not in inventory:
            raise HTTPException(status_code=404, detail="Attachment key not found")
        _run_text(["qpdf", str(input_path), f"--remove-attachment={key}", str(output_path)])
        if not output_path.exists():
            raise HTTPException(status_code=500, detail="qpdf did not produce an output PDF")
        output = output_path.read_bytes()

    return Response(
        content=output,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="solyan-without-attachment.pdf"'},
    )
