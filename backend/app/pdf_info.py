from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .sanitize import (
    ACTION_TYPES,
    ACTIVE_ANNOTATION_TYPES,
    OBJECT_REF_RE,
    _command_env,
    _read_pdf,
    _require_qpdf_json,
)

router = APIRouter()

COMMAND_TIMEOUT_SECONDS = 120
MAX_REACHABLE_OBJECTS = 100_000
MAX_TABLE_ROWS = 500
MAX_TEXT_VALUE = 4096


def _run(command: list[str], *, label: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail=f"{label} timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"{label} engine is unavailable") from exc


def _password_args(password: str) -> list[str]:
    return ["-upw", password] if password else []


def _parse_key_value_output(text: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for raw_line in text.splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key:
            parsed[key] = value[:MAX_TEXT_VALUE]
    return parsed


def _pdfinfo(input_path: Path, password: str) -> dict[str, str]:
    result = _run(
        ["pdfinfo", "-isodates", *_password_args(password), str(input_path)],
        label="pdfinfo inspection",
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "pdfinfo failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    return _parse_key_value_output(result.stdout)


def _raw_table(command: list[str], *, label: str, header_lines: int) -> dict[str, Any]:
    result = _run(command, label=label)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or f"{label} failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    lines = [line.rstrip() for line in result.stdout.splitlines() if line.strip()]
    data_lines = lines[header_lines:] if len(lines) > header_lines else []
    return {
        "count": len(data_lines),
        "rows": data_lines[:MAX_TABLE_ROWS],
        "truncated": len(data_lines) > MAX_TABLE_ROWS,
    }


def _qpdf_structure(input_path: Path, json_path: Path, password: str) -> dict[str, Any]:
    result = _run(
        [
            "qpdf",
            f"--password={password}",
            "--json-output",
            "--json-stream-data=none",
            str(input_path),
            str(json_path),
        ],
        label="qpdf structure inspection",
    )
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf JSON inspection failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="qpdf produced invalid JSON output") from exc
    qpdf = data.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf JSON structure")
    return data


def _entry_payload(entry: Any) -> Any:
    if not isinstance(entry, dict):
        return None
    if "value" in entry:
        return entry.get("value")
    stream = entry.get("stream")
    if isinstance(stream, dict):
        return stream.get("dict")
    return None


def _structural_summary(data: dict[str, Any]) -> dict[str, Any]:
    objects: dict[str, Any] = data["qpdf"][1]
    trailer = objects.get("trailer")
    trailer_value = trailer.get("value") if isinstance(trailer, dict) else None
    if not isinstance(trailer_value, dict):
        raise HTTPException(status_code=422, detail="PDF trailer is unavailable")

    root = trailer_value.get("/Root")
    if not isinstance(root, str) or not OBJECT_REF_RE.fullmatch(root):
        raise HTTPException(status_code=422, detail="PDF catalog is unavailable")

    seen_refs: set[str] = set()
    dictionary_count = 0
    stream_count = 0
    type_counts: Counter[str] = Counter()
    subtype_counts: Counter[str] = Counter()
    annotation_counts: Counter[str] = Counter()
    action_counts: Counter[str] = Counter()
    form_fields = 0
    signature_fields = 0
    embedded_files = 0
    javascript_actions = 0
    xfa_entries = 0
    active_annotations = 0

    def walk(value: Any) -> None:
        nonlocal dictionary_count, stream_count, form_fields, signature_fields
        nonlocal embedded_files, javascript_actions, xfa_entries, active_annotations

        if isinstance(value, str) and OBJECT_REF_RE.fullmatch(value):
            if value in seen_refs:
                return
            seen_refs.add(value)
            if len(seen_refs) > MAX_REACHABLE_OBJECTS:
                raise HTTPException(status_code=422, detail="PDF object graph is too large to inspect safely")
            entry = objects.get(f"obj:{value}")
            if not isinstance(entry, dict):
                return
            if isinstance(entry.get("stream"), dict):
                stream_count += 1
            walk(_entry_payload(entry))
            return

        if isinstance(value, list):
            for item in value:
                walk(item)
            return

        if not isinstance(value, dict):
            return

        dictionary_count += 1
        object_type = value.get("/Type")
        subtype = value.get("/Subtype")
        field_type = value.get("/FT")
        action_type = value.get("/S")

        if isinstance(object_type, str):
            type_counts[object_type] += 1
        if isinstance(subtype, str):
            subtype_counts[subtype] += 1
            if "/Rect" in value or subtype == "/Widget":
                annotation_counts[subtype] += 1
        if isinstance(action_type, str) and action_type in ACTION_TYPES:
            action_counts[action_type] += 1
            if action_type == "/JavaScript":
                javascript_actions += 1
        if field_type is not None:
            form_fields += 1
            if field_type == "/Sig":
                signature_fields += 1
        if object_type == "/Filespec" and "/EF" in value:
            embedded_files += 1
        if "/XFA" in value:
            xfa_entries += 1
        if subtype in ACTIVE_ANNOTATION_TYPES:
            active_annotations += 1

        for child in value.values():
            walk(child)

    walk(root)

    return {
        "reachableObjects": len(seen_refs),
        "dictionaries": dictionary_count,
        "streams": stream_count,
        "pages": type_counts.get("/Page", 0),
        "fonts": type_counts.get("/Font", 0),
        "images": subtype_counts.get("/Image", 0),
        "formXObjects": subtype_counts.get("/Form", 0),
        "formFields": form_fields,
        "signatureFields": signature_fields,
        "embeddedFiles": embedded_files,
        "optionalContentGroups": type_counts.get("/OCG", 0),
        "metadataStreams": type_counts.get("/Metadata", 0),
        "outlines": type_counts.get("/Outlines", 0),
        "xfaEntries": xfa_entries,
        "javascriptActions": javascript_actions,
        "activeAnnotations": active_annotations,
        "annotationTypes": dict(sorted(annotation_counts.items())),
        "actionTypes": dict(sorted(action_counts.items())),
        "objectTypes": dict(sorted(type_counts.items())),
        "subtypes": dict(sorted(subtype_counts.items())),
    }


def _encryption_summary(input_path: Path, password: str) -> dict[str, Any]:
    result = _run(
        ["qpdf", f"--password={password}", "--show-encryption", str(input_path)],
        label="qpdf encryption inspection",
    )
    if result.returncode not in (0, 2, 3):
        detail = (result.stderr or result.stdout or "qpdf encryption inspection failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)

    text = result.stdout.strip()
    encrypted = "File is not encrypted" not in text
    permissions: dict[str, str] = {}
    details: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if ":" in stripped:
            key, value = stripped.split(":", 1)
            key = key.strip()
            value = value.strip()
            if value in {"allowed", "not allowed"}:
                permissions[key] = value
            elif key.lower() not in {"user password", "owner password"}:
                details[key] = value[:MAX_TEXT_VALUE]
        elif "encryption" in stripped.lower() or stripped.startswith("R =") or stripped.startswith("P ="):
            details.setdefault("summary", stripped[:MAX_TEXT_VALUE])
    return {"encrypted": encrypted, "permissions": permissions, "details": details}


def _inspect_pdf(input_path: Path, *, filename: str, password: str) -> dict[str, Any]:
    info = _pdfinfo(input_path, password)
    qpdf_data = _qpdf_structure(input_path, input_path.with_suffix(".qpdf.json"), password)
    structure = _structural_summary(qpdf_data)
    encryption = _encryption_summary(input_path, password)

    fonts = _raw_table(
        ["pdffonts", *_password_args(password), str(input_path)],
        label="font inspection",
        header_lines=2,
    )
    images = _raw_table(
        ["pdfimages", "-list", *_password_args(password), str(input_path)],
        label="image inspection",
        header_lines=2,
    )

    raw = input_path.read_bytes()
    metadata_keys = {
        "Title",
        "Subject",
        "Keywords",
        "Author",
        "Creator",
        "Producer",
        "CreationDate",
        "ModDate",
        "Custom Metadata",
        "Metadata Stream",
    }
    metadata = {key: value for key, value in info.items() if key in metadata_keys}
    document = {key: value for key, value in info.items() if key not in metadata_keys}

    return {
        "file": {
            "name": filename,
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        "document": document,
        "metadata": metadata,
        "structure": structure,
        "encryption": encryption,
        "fonts": fonts,
        "images": images,
        "limits": {
            "maxFileBytes": 100 * 1024 * 1024,
            "maxReachableObjects": MAX_REACHABLE_OBJECTS,
            "maxRowsPerTable": MAX_TABLE_ROWS,
        },
    }


@router.post("/pdf/info")
def pdf_info(
    file: UploadFile = File(...),
    password: str = Form(default="", max_length=128),
) -> dict[str, Any]:
    _require_qpdf_json()
    data = _read_pdf(file)
    with tempfile.TemporaryDirectory(prefix="solyan-pdf-info-") as temp_dir:
        input_path = Path(temp_dir) / "input.pdf"
        input_path.write_bytes(data)
        return _inspect_pdf(input_path, filename=file.filename or "document.pdf", password=password)
