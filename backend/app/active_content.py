from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
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
MAX_FINDINGS = 500
MAX_SCRIPT_BYTES = 64 * 1024
MAX_TOTAL_SCRIPT_BYTES = 256 * 1024

TRIGGER_KEYS = {"/AA", "/OpenAction", "/XFA"}
ATTACHMENT_KEYS = {"/EmbeddedFiles", "/AF"}
ATTACHMENT_ANNOTATIONS = {"/FileAttachment"}


def _run_text(command: list[str], *, timeout: int = COMMAND_TIMEOUT_SECONDS) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=_command_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="PDF active-content inspection timed out") from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail="qpdf engine is unavailable") from exc


def _qpdf_structure(input_path: Path, json_path: Path, password: str) -> dict[str, Any]:
    result = _run_text(
        [
            "qpdf",
            f"--password={password}",
            "--json-output",
            "--json-stream-data=none",
            str(input_path),
            str(json_path),
        ]
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


def _object_entry(objects: dict[str, Any], ref: str) -> dict[str, Any] | None:
    if not OBJECT_REF_RE.fullmatch(ref):
        return None
    entry = objects.get(f"obj:{ref}")
    return entry if isinstance(entry, dict) else None


def _object_payload(objects: dict[str, Any], ref: str) -> Any:
    entry = _object_entry(objects, ref)
    if entry is None:
        return None
    if "value" in entry:
        return entry.get("value")
    stream = entry.get("stream")
    if isinstance(stream, dict):
        return stream.get("dict")
    return None


def _resolved_action(objects: dict[str, Any], value: Any) -> dict[str, Any] | None:
    candidate = value
    if isinstance(value, str) and OBJECT_REF_RE.fullmatch(value):
        candidate = _object_payload(objects, value)
    if not isinstance(candidate, dict):
        return None
    action_type = candidate.get("/S")
    if not isinstance(action_type, str) or action_type not in ACTION_TYPES:
        return None
    return candidate


def _decode_qpdf_string(value: Any) -> str | None:
    if not isinstance(value, str) or OBJECT_REF_RE.fullmatch(value):
        return None
    if value.startswith("u:"):
        return value[2:]
    if value.startswith("b:"):
        try:
            return bytes.fromhex(value[2:]).decode("utf-8", errors="replace")
        except ValueError:
            return value[2:]
    return value


def _stream_text(input_path: Path, ref: str, password: str) -> tuple[str | None, bool]:
    match = OBJECT_REF_RE.fullmatch(ref)
    if match is None:
        return None, False
    object_number, generation = match.groups()
    try:
        result = subprocess.run(
            [
                "qpdf",
                f"--password={password}",
                f"--show-object={object_number},{generation}",
                "--filtered-stream-data",
                str(input_path),
            ],
            capture_output=True,
            timeout=20,
            env=_command_env(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return None, False
    if result.returncode not in (0, 3):
        return None, False
    raw = result.stdout
    truncated = len(raw) > MAX_SCRIPT_BYTES
    return raw[:MAX_SCRIPT_BYTES].decode("utf-8", errors="replace"), truncated


def _javascript_names(objects: dict[str, Any]) -> dict[str, str]:
    names: dict[str, str] = {}
    for entry in objects.values():
        if not isinstance(entry, dict):
            continue
        value = entry.get("value")
        if not isinstance(value, dict):
            continue
        raw_names = value.get("/Names")
        if not isinstance(raw_names, list):
            continue
        for index in range(0, len(raw_names) - 1, 2):
            label = _decode_qpdf_string(raw_names[index])
            ref = raw_names[index + 1]
            if not label or not isinstance(ref, str) or not OBJECT_REF_RE.fullmatch(ref):
                continue
            action = _object_payload(objects, ref)
            if isinstance(action, dict) and action.get("/S") == "/JavaScript":
                names.setdefault(ref, label)
    return names


def _script_from_action(
    input_path: Path,
    objects: dict[str, Any],
    action: dict[str, Any],
    password: str,
) -> tuple[str | None, bool, str]:
    raw = action.get("/JS")
    direct = _decode_qpdf_string(raw)
    if direct is not None:
        encoded = direct.encode("utf-8", errors="replace")
        truncated = len(encoded) > MAX_SCRIPT_BYTES
        if truncated:
            direct = encoded[:MAX_SCRIPT_BYTES].decode("utf-8", errors="replace")
        return direct, truncated, "string"

    if isinstance(raw, str) and OBJECT_REF_RE.fullmatch(raw):
        target = _object_entry(objects, raw)
        if isinstance(target, dict):
            target_value = _decode_qpdf_string(target.get("value"))
            if target_value is not None:
                encoded = target_value.encode("utf-8", errors="replace")
                truncated = len(encoded) > MAX_SCRIPT_BYTES
                if truncated:
                    target_value = encoded[:MAX_SCRIPT_BYTES].decode("utf-8", errors="replace")
                return target_value, truncated, "indirect-string"
            if isinstance(target.get("stream"), dict):
                text, truncated = _stream_text(input_path, raw, password)
                return text, truncated, "stream"
    return None, False, "unavailable"


def _inspect_pdf(input_path: Path, password: str = "") -> dict[str, Any]:
    json_path = input_path.with_suffix(".structure.json")
    data = _qpdf_structure(input_path, json_path, password)
    objects: dict[str, Any] = data["qpdf"][1]
    javascript_names = _javascript_names(objects)

    trailer = objects.get("trailer")
    trailer_value = trailer.get("value") if isinstance(trailer, dict) else None
    if not isinstance(trailer_value, dict):
        raise HTTPException(status_code=422, detail="PDF trailer is unavailable")

    findings: list[dict[str, Any]] = []
    javascript: list[dict[str, Any]] = []
    seen_refs: set[str] = set()
    seen_action_ids: set[str] = set()
    seen_annotation_ids: set[str] = set()
    total_script_bytes = 0
    findings_truncated = False

    def add_finding(item: dict[str, Any]) -> None:
        nonlocal findings_truncated
        if len(findings) >= MAX_FINDINGS:
            findings_truncated = True
            return
        findings.append(item)

    def walk(value: Any, path: str, owner_ref: str | None = None) -> None:
        nonlocal total_script_bytes
        if isinstance(value, str) and OBJECT_REF_RE.fullmatch(value):
            if value in seen_refs:
                return
            seen_refs.add(value)
            entry = _object_entry(objects, value)
            if entry is None:
                return
            if "value" in entry:
                walk(entry.get("value"), path, value)
            else:
                stream = entry.get("stream")
                if isinstance(stream, dict):
                    walk(stream.get("dict"), path, value)
            return

        if isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, f"{path}[{index}]", owner_ref)
            return

        if not isinstance(value, dict):
            return

        action_type = value.get("/S")
        if isinstance(action_type, str) and action_type in ACTION_TYPES:
            action_id = owner_ref or f"direct:{path}"
            if action_id not in seen_action_ids:
                seen_action_ids.add(action_id)
                action_finding: dict[str, Any] = {
                    "kind": "action",
                    "actionType": action_type,
                    "path": path,
                    "objectRef": owner_ref,
                }
                target = value.get("/URI") or value.get("/F") or value.get("/N")
                decoded_target = _decode_qpdf_string(target)
                if decoded_target is not None:
                    action_finding["target"] = decoded_target[:2048]
                add_finding(action_finding)

                if action_type == "/JavaScript":
                    script, script_truncated, source = _script_from_action(
                        input_path, objects, value, password
                    )
                    item: dict[str, Any] = {
                        "name": javascript_names.get(owner_ref or ""),
                        "path": path,
                        "objectRef": owner_ref,
                        "source": source,
                        "truncated": script_truncated,
                    }
                    if script is not None and total_script_bytes < MAX_TOTAL_SCRIPT_BYTES:
                        remaining = MAX_TOTAL_SCRIPT_BYTES - total_script_bytes
                        encoded = script.encode("utf-8", errors="replace")
                        if len(encoded) > remaining:
                            script = encoded[:remaining].decode("utf-8", errors="replace")
                            item["truncated"] = True
                        item["script"] = script
                        total_script_bytes += len(script.encode("utf-8", errors="replace"))
                    elif script is not None:
                        item["truncated"] = True
                    javascript.append(item)

        subtype = value.get("/Subtype")
        if isinstance(subtype, str) and subtype in (ACTIVE_ANNOTATION_TYPES | ATTACHMENT_ANNOTATIONS):
            annotation_id = owner_ref or f"direct:{path}"
            if annotation_id not in seen_annotation_ids:
                seen_annotation_ids.add(annotation_id)
                add_finding(
                    {
                        "kind": "annotation",
                        "subtype": subtype,
                        "path": path,
                        "objectRef": owner_ref,
                    }
                )

        for key, child in value.items():
            child_path = f"{path}.{key}"
            is_action_trigger = key == "/A" and _resolved_action(objects, child) is not None
            if key in TRIGGER_KEYS or is_action_trigger:
                add_finding(
                    {
                        "kind": "trigger",
                        "key": key,
                        "path": child_path,
                        "objectRef": owner_ref,
                    }
                )
            if key in ATTACHMENT_KEYS:
                add_finding(
                    {
                        "kind": "attachment-reference",
                        "key": key,
                        "path": child_path,
                        "objectRef": owner_ref,
                    }
                )
            if key == "/JavaScript":
                add_finding(
                    {
                        "kind": "javascript-name-tree",
                        "key": key,
                        "path": child_path,
                        "objectRef": owner_ref,
                    }
                )
            walk(child, child_path, owner_ref)

    walk(trailer_value, "trailer")

    action_count = sum(1 for item in findings if item.get("kind") == "action")
    annotation_count = sum(1 for item in findings if item.get("kind") == "annotation")
    attachment_count = sum(1 for item in findings if item.get("kind") == "attachment-reference")
    trigger_count = sum(1 for item in findings if item.get("kind") == "trigger")

    return {
        "hasActiveContent": bool(findings),
        "summary": {
            "javascript": len(javascript),
            "actions": action_count,
            "triggers": trigger_count,
            "activeAnnotations": annotation_count,
            "attachmentReferences": attachment_count,
            "reachableObjects": len(seen_refs),
        },
        "javascript": javascript,
        "findings": findings,
        "findingsTruncated": findings_truncated,
        "limits": {
            "maxFindings": MAX_FINDINGS,
            "maxScriptBytesEach": MAX_SCRIPT_BYTES,
            "maxScriptBytesTotal": MAX_TOTAL_SCRIPT_BYTES,
        },
        "note": "Structural inspection only; this is not antivirus or a guarantee that a PDF is safe.",
    }


@router.post("/pdf/inspect-active-content")
def inspect_active_content(
    file: UploadFile = File(...),
    password: str = Form(default="", max_length=128),
) -> dict[str, Any]:
    _require_qpdf_json()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-active-content-"))
    try:
        input_path = work_dir / "input.pdf"
        input_path.write_bytes(data)
        return _inspect_pdf(input_path, password)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
