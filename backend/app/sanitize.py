from __future__ import annotations

import copy
import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter()

MAX_FILE_SIZE = 100 * 1024 * 1024
COMMAND_TIMEOUT_SECONDS = 120
OBJECT_REF_RE = re.compile(r"^(\d+)\s+(\d+)\s+R$")

ACTION_TYPES = {
    "/GoTo",
    "/GoToR",
    "/GoToE",
    "/Launch",
    "/Thread",
    "/URI",
    "/Sound",
    "/Movie",
    "/Hide",
    "/Named",
    "/SubmitForm",
    "/ResetForm",
    "/ImportData",
    "/JavaScript",
    "/SetOCGState",
    "/Rendition",
    "/Trans",
    "/GoTo3DView",
}

ACTIVE_ANNOTATION_TYPES = {
    "/RichMedia",
    "/Screen",
    "/Movie",
    "/Sound",
    "/3D",
}


@dataclass
class SanitizeOptions:
    remove_actions: bool
    remove_links: bool
    remove_metadata: bool
    remove_embedded_files: bool


@dataclass
class SanitizeStats:
    actions_removed: int = 0
    links_removed: int = 0
    metadata_removed: int = 0
    embedded_files_removed: int = 0
    active_annotations_removed: int = 0

    @property
    def total(self) -> int:
        return (
            self.actions_removed
            + self.links_removed
            + self.metadata_removed
            + self.embedded_files_removed
            + self.active_annotations_removed
        )


def _command_env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    return env


def _require_qpdf_json() -> None:
    try:
        for command in (["qpdf", "--version"], ["qpdf", "--help=--update-from-json"], ["qpdf", "--help=--json-output"]):
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
                env=_command_env(),
            )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="qpdf JSON update support is unavailable") from exc


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF header")
    return data


def _run(command: list[str], *, timeout: int = COMMAND_TIMEOUT_SECONDS) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="qpdf sanitization timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="qpdf engine is unavailable") from exc


def _qpdf_json(input_path: Path, json_path: Path) -> dict[str, Any]:
    result = _run(["qpdf", "--json-output", str(input_path), str(json_path)])
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf JSON export failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="qpdf produced invalid JSON output") from exc
    qpdf = data.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf JSON structure")
    return data


def _object_value(objects: dict[str, Any], value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not OBJECT_REF_RE.fullmatch(value):
        return None
    entry = objects.get(f"obj:{value}")
    if not isinstance(entry, dict):
        return None
    direct = entry.get("value")
    return direct if isinstance(direct, dict) else None


def _annotation_subtype(objects: dict[str, Any], item: Any) -> str | None:
    annotation = _object_value(objects, item)
    if annotation is None:
        return None
    subtype = annotation.get("/Subtype")
    return subtype if isinstance(subtype, str) else None


def _is_action_dictionary(value: dict[str, Any]) -> bool:
    action_type = value.get("/S")
    return isinstance(action_type, str) and action_type in ACTION_TYPES


def _sanitize_value(
    value: Any,
    *,
    objects: dict[str, Any],
    options: SanitizeOptions,
    stats: SanitizeStats,
) -> Any:
    if isinstance(value, list):
        return [_sanitize_value(item, objects=objects, options=options, stats=stats) for item in value]
    if not isinstance(value, dict):
        return value

    if options.remove_actions and _is_action_dictionary(value):
        stats.actions_removed += 1
        return {}

    cleaned: dict[str, Any] = {}
    for key, raw in value.items():
        if options.remove_actions and key in {"/A", "/AA", "/OpenAction", "/JavaScript", "/JS", "/XFA"}:
            stats.actions_removed += 1
            continue
        if options.remove_metadata and key == "/Metadata":
            stats.metadata_removed += 1
            continue
        if options.remove_embedded_files and key in {"/EmbeddedFiles", "/AF"}:
            stats.embedded_files_removed += 1
            continue

        if key == "/Annots" and isinstance(raw, list):
            kept_annotations: list[Any] = []
            for annotation in raw:
                subtype = _annotation_subtype(objects, annotation)
                if options.remove_links and subtype == "/Link":
                    stats.links_removed += 1
                    continue
                if options.remove_embedded_files and subtype == "/FileAttachment":
                    stats.embedded_files_removed += 1
                    continue
                if options.remove_actions and subtype in ACTIVE_ANNOTATION_TYPES:
                    stats.active_annotations_removed += 1
                    continue
                kept_annotations.append(
                    _sanitize_value(annotation, objects=objects, options=options, stats=stats)
                )
            cleaned[key] = kept_annotations
            continue

        cleaned[key] = _sanitize_value(raw, objects=objects, options=options, stats=stats)

    return cleaned


def _build_update_json(data: dict[str, Any], options: SanitizeOptions) -> tuple[dict[str, Any], SanitizeStats]:
    qpdf = data["qpdf"]
    metadata = qpdf[0] if isinstance(qpdf[0], dict) else {}
    objects = qpdf[1]
    stats = SanitizeStats()
    updates: dict[str, Any] = {}

    for object_key, entry in objects.items():
        if not isinstance(entry, dict):
            continue

        if object_key == "trailer":
            original = entry.get("value")
            if not isinstance(original, dict):
                continue
            updated = copy.deepcopy(original)
            if options.remove_metadata and "/Info" in updated:
                updated.pop("/Info", None)
                stats.metadata_removed += 1
            updated = _sanitize_value(updated, objects=objects, options=options, stats=stats)
            if updated != original:
                updates[object_key] = {"value": updated}
            continue

        if "value" in entry:
            original = entry.get("value")
            if not isinstance(original, (dict, list)):
                continue
            updated = _sanitize_value(copy.deepcopy(original), objects=objects, options=options, stats=stats)
            if updated != original:
                updates[object_key] = {"value": updated}
            continue

        # Stream payloads are intentionally not rewritten. If a stream dictionary
        # itself contains a removable metadata/action key, update only the dictionary;
        # qpdf preserves the original stream bytes when data/datafile are omitted.
        stream = entry.get("stream")
        if isinstance(stream, dict) and isinstance(stream.get("dict"), dict):
            original_dict = stream["dict"]
            updated_dict = _sanitize_value(copy.deepcopy(original_dict), objects=objects, options=options, stats=stats)
            if updated_dict != original_dict:
                updates[object_key] = {"stream": {"dict": updated_dict}}

    update_json = {
        "qpdf": [
            {"jsonversion": int(metadata.get("jsonversion", 2))},
            updates,
        ]
    }
    return update_json, stats


def _sanitize_pdf(input_path: Path, output_path: Path, options: SanitizeOptions) -> SanitizeStats:
    source_json_path = input_path.with_suffix(".json")
    update_json_path = input_path.with_name("sanitize-update.json")
    data = _qpdf_json(input_path, source_json_path)
    update_json, stats = _build_update_json(data, options)
    update_json_path.write_text(json.dumps(update_json, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    if stats.total == 0:
        result = _run(["qpdf", str(input_path), str(output_path)])
    else:
        result = _run(["qpdf", str(input_path), f"--update-from-json={update_json_path}", str(output_path)])
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf sanitization failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce a sanitized PDF")

    check = _run(["qpdf", "--check", str(output_path)])
    if check.returncode not in (0, 3):
        detail = (check.stderr or check.stdout or "sanitized PDF failed qpdf validation").strip()[-1200:]
        raise HTTPException(status_code=500, detail=detail)
    return stats


@router.post("/pdf/sanitize")
def sanitize_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    remove_actions: bool = Form(default=True),
    remove_links: bool = Form(default=True),
    remove_metadata: bool = Form(default=True),
    remove_embedded_files: bool = Form(default=True),
) -> FileResponse:
    if not any((remove_actions, remove_links, remove_metadata, remove_embedded_files)):
        raise HTTPException(status_code=422, detail="Select at least one sanitization category")

    _require_qpdf_json()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-sanitize-"))
    try:
        input_path = work_dir / "input.pdf"
        output_path = work_dir / "solyan-sanitized.pdf"
        input_path.write_bytes(data)
        stats = _sanitize_pdf(
            input_path,
            output_path,
            SanitizeOptions(
                remove_actions=remove_actions,
                remove_links=remove_links,
                remove_metadata=remove_metadata,
                remove_embedded_files=remove_embedded_files,
            ),
        )
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=output_path,
        media_type="application/pdf",
        filename="solyan-sanitized.pdf",
        headers={
            "X-SolYan-Sanitize-Actions-Removed": str(stats.actions_removed),
            "X-SolYan-Sanitize-Links-Removed": str(stats.links_removed),
            "X-SolYan-Sanitize-Metadata-Removed": str(stats.metadata_removed),
            "X-SolYan-Sanitize-Embedded-Files-Removed": str(stats.embedded_files_removed),
            "X-SolYan-Sanitize-Active-Annotations-Removed": str(stats.active_annotations_removed),
        },
        background=background_tasks,
    )
