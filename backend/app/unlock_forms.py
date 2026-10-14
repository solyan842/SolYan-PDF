from __future__ import annotations

import base64
import copy
import json
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .sanitize import OBJECT_REF_RE, _read_pdf, _require_qpdf_json, _run

router = APIRouter()

MAX_FIELD_NODES = 10_000
MAX_FIELD_DEPTH = 128
MAX_XFA_STREAMS = 256
MAX_XFA_DECODED_BYTES = 10 * 1024 * 1024
XFA_READ_ONLY_RE = re.compile(rb'(access\s*=\s*)(["\'])readOnly\2')


@dataclass
class UnlockFormStats:
    fields_visited: int = 0
    readonly_flags_cleared: int = 0
    lock_entries_removed: int = 0
    xfa_streams_modified: int = 0
    xfa_attributes_opened: int = 0

    @property
    def total_changes(self) -> int:
        return self.readonly_flags_cleared + self.lock_entries_removed + self.xfa_attributes_opened


def _entry_payload(entry: Any) -> Any:
    if not isinstance(entry, dict):
        return None
    if "value" in entry:
        return entry.get("value")
    stream = entry.get("stream")
    if isinstance(stream, dict):
        return stream.get("dict")
    return None


def _resolve_value(objects: dict[str, Any], value: Any) -> Any:
    if not isinstance(value, str) or not OBJECT_REF_RE.fullmatch(value):
        return value
    return _entry_payload(objects.get(f"obj:{value}"))


def _resolve_dictionary(objects: dict[str, Any], value: Any) -> dict[str, Any] | None:
    resolved = _resolve_value(objects, value)
    return resolved if isinstance(resolved, dict) else None


def _field_identity(value: Any) -> str | int | None:
    if isinstance(value, str) and OBJECT_REF_RE.fullmatch(value):
        return value
    if isinstance(value, dict):
        return id(value)
    return None


def _export_structure(input_path: Path, json_path: Path) -> dict[str, Any]:
    result = _run(
        [
            "qpdf",
            "--json-output",
            "--json-stream-data=none",
            str(input_path),
            str(json_path),
        ]
    )
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf form inspection failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="qpdf produced invalid JSON output") from exc
    qpdf = data.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf JSON structure")
    return data


def _unlock_field_tree(
    objects: dict[str, Any],
    value: Any,
    *,
    stats: UnlockFormStats,
    active_path: set[str | int],
    counter: list[int],
    depth: int,
) -> None:
    if depth > MAX_FIELD_DEPTH:
        raise HTTPException(status_code=422, detail="PDF form field tree is too deep")

    identity = _field_identity(value)
    if identity is not None:
        if identity in active_path:
            raise HTTPException(status_code=422, detail="PDF form field tree contains a cycle")
        active_path.add(identity)

    try:
        field = _resolve_dictionary(objects, value)
        if field is None:
            return

        counter[0] += 1
        stats.fields_visited += 1
        if counter[0] > MAX_FIELD_NODES:
            raise HTTPException(status_code=422, detail="PDF form field tree is too large")

        flags = field.get("/Ff")
        if isinstance(flags, int) and flags & 1:
            field["/Ff"] = flags & ~1
            stats.readonly_flags_cleared += 1

        if "/Lock" in field:
            field.pop("/Lock", None)
            stats.lock_entries_removed += 1

        kids = field.get("/Kids")
        if isinstance(kids, list):
            for child in kids:
                _unlock_field_tree(
                    objects,
                    child,
                    stats=stats,
                    active_path=active_path,
                    counter=counter,
                    depth=depth + 1,
                )
    finally:
        if identity is not None:
            active_path.discard(identity)


def _collect_xfa_refs(objects: dict[str, Any], value: Any) -> list[str]:
    refs: list[str] = []
    seen_containers: set[str] = set()

    def walk(item: Any) -> None:
        if len(refs) > MAX_XFA_STREAMS:
            raise HTTPException(status_code=422, detail="PDF contains too many XFA streams")

        if isinstance(item, list):
            for child in item:
                walk(child)
            return

        if not isinstance(item, str) or not OBJECT_REF_RE.fullmatch(item):
            return
        if item in refs:
            return

        entry = objects.get(f"obj:{item}")
        if not isinstance(entry, dict):
            return
        if isinstance(entry.get("stream"), dict):
            refs.append(item)
            if len(refs) > MAX_XFA_STREAMS:
                raise HTTPException(status_code=422, detail="PDF contains too many XFA streams")
            return

        if item in seen_containers:
            return
        seen_containers.add(item)
        payload = entry.get("value")
        if isinstance(payload, list):
            walk(payload)

    walk(value)
    return refs


def _ref_to_json_object(ref: str) -> str:
    match = OBJECT_REF_RE.fullmatch(ref)
    if match is None:
        raise HTTPException(status_code=500, detail="Invalid internal PDF object reference")
    return f"{match.group(1)},{match.group(2)}"


def _load_decoded_stream(input_path: Path, ref: str, json_path: Path) -> dict[str, Any]:
    result = _run(
        [
            "qpdf",
            "--json-output",
            "--json-stream-data=inline",
            "--decode-level=generalized",
            f"--json-object={_ref_to_json_object(ref)}",
            str(input_path),
            str(json_path),
        ]
    )
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf XFA stream export failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="qpdf produced invalid XFA JSON output") from exc
    qpdf = data.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf XFA JSON structure")
    entry = qpdf[1].get(f"obj:{ref}")
    if not isinstance(entry, dict) or not isinstance(entry.get("stream"), dict):
        raise HTTPException(status_code=422, detail="XFA entry is not a readable stream")
    return entry["stream"]


def _unlock_xfa_streams(
    input_path: Path,
    refs: list[str],
    *,
    temp_dir: Path,
    stats: UnlockFormStats,
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    for index, ref in enumerate(refs):
        stream = _load_decoded_stream(input_path, ref, temp_dir / f"xfa-{index}.json")
        encoded = stream.get("data")
        stream_dict = stream.get("dict")
        if not isinstance(encoded, str) or not isinstance(stream_dict, dict):
            continue
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail="XFA stream data is not valid base64") from exc
        if len(decoded) > MAX_XFA_DECODED_BYTES:
            raise HTTPException(status_code=422, detail="An XFA stream exceeds the 10 MB decoded limit")

        def replacement(match: re.Match[bytes]) -> bytes:
            quote = match.group(2)
            return match.group(1) + quote + b"open" + quote

        opened, count = XFA_READ_ONLY_RE.subn(replacement, decoded)
        if count == 0:
            continue
        stats.xfa_streams_modified += 1
        stats.xfa_attributes_opened += count
        updates[f"obj:{ref}"] = {
            "stream": {
                "dict": stream_dict,
                "data": base64.b64encode(opened).decode("ascii"),
            }
        }
    return updates


def _build_object_updates(
    original_objects: dict[str, Any],
    updated_objects: dict[str, Any],
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    for object_key, original_entry in original_objects.items():
        updated_entry = updated_objects.get(object_key)
        if not isinstance(original_entry, dict) or not isinstance(updated_entry, dict):
            continue

        original_value = original_entry.get("value")
        updated_value = updated_entry.get("value")
        if original_value != updated_value and isinstance(updated_value, (dict, list)):
            updates[object_key] = {"value": updated_value}
            continue

        original_stream = original_entry.get("stream")
        updated_stream = updated_entry.get("stream")
        if isinstance(original_stream, dict) and isinstance(updated_stream, dict):
            original_dict = original_stream.get("dict")
            updated_dict = updated_stream.get("dict")
            if original_dict != updated_dict and isinstance(updated_dict, dict):
                updates[object_key] = {"stream": {"dict": updated_dict}}
    return updates


def _unlock_forms_pdf(input_path: Path, output_path: Path) -> UnlockFormStats:
    temp_dir = input_path.parent
    source_json = _export_structure(input_path, temp_dir / "unlock-forms-source.json")
    qpdf = source_json["qpdf"]
    metadata = qpdf[0] if isinstance(qpdf[0], dict) else {}
    original_objects: dict[str, Any] = qpdf[1]
    objects: dict[str, Any] = copy.deepcopy(original_objects)
    stats = UnlockFormStats()

    trailer = _resolve_dictionary(objects, _entry_payload(objects.get("trailer")))
    if trailer is None:
        trailer_entry = objects.get("trailer")
        trailer = trailer_entry.get("value") if isinstance(trailer_entry, dict) else None
    if not isinstance(trailer, dict):
        raise HTTPException(status_code=422, detail="PDF trailer is unavailable")
    catalog = _resolve_dictionary(objects, trailer.get("/Root"))
    if catalog is None:
        raise HTTPException(status_code=422, detail="PDF catalog is unavailable")
    acroform = _resolve_dictionary(objects, catalog.get("/AcroForm"))
    if acroform is None:
        shutil.copyfile(input_path, output_path)
        return stats

    fields = acroform.get("/Fields")
    if isinstance(fields, list):
        counter = [0]
        for field in fields:
            _unlock_field_tree(
                objects,
                field,
                stats=stats,
                active_path=set(),
                counter=counter,
                depth=0,
            )

    xfa_refs = _collect_xfa_refs(objects, acroform.get("/XFA")) if "/XFA" in acroform else []
    xfa_updates = _unlock_xfa_streams(input_path, xfa_refs, temp_dir=temp_dir, stats=stats)

    if stats.total_changes == 0:
        shutil.copyfile(input_path, output_path)
        return stats

    acroform["/NeedAppearances"] = True
    updates = _build_object_updates(original_objects, objects)
    updates.update(xfa_updates)
    update_json = {
        "qpdf": [
            {"jsonversion": int(metadata.get("jsonversion", 2))},
            updates,
        ]
    }
    update_path = temp_dir / "unlock-forms-update.json"
    update_path.write_text(json.dumps(update_json, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    result = _run(["qpdf", str(input_path), f"--update-from-json={update_path}", str(output_path)])
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf form unlock failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce an unlocked-form PDF")

    check = _run(["qpdf", "--check", str(output_path)])
    if check.returncode not in (0, 3):
        detail = (check.stderr or check.stdout or "unlocked-form PDF failed qpdf validation").strip()[-1200:]
        raise HTTPException(status_code=500, detail=detail)
    return stats


@router.post("/pdf/unlock-forms")
def unlock_forms(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> FileResponse:
    _require_qpdf_json()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-unlock-forms-"))
    try:
        input_path = work_dir / "input.pdf"
        output_path = work_dir / "solyan-unlocked-forms.pdf"
        input_path.write_bytes(data)
        stats = _unlock_forms_pdf(input_path, output_path)
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=output_path,
        media_type="application/pdf",
        filename="solyan-unlocked-forms.pdf",
        headers={
            "X-SolYan-Form-Fields-Visited": str(stats.fields_visited),
            "X-SolYan-Readonly-Flags-Cleared": str(stats.readonly_flags_cleared),
            "X-SolYan-Form-Locks-Removed": str(stats.lock_entries_removed),
            "X-SolYan-XFA-Streams-Modified": str(stats.xfa_streams_modified),
            "X-SolYan-XFA-Attributes-Opened": str(stats.xfa_attributes_opened),
        },
        background=background_tasks,
    )
