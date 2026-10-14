from __future__ import annotations

import copy
import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .sanitize import OBJECT_REF_RE, _qpdf_json, _read_pdf, _require_qpdf_json, _run

router = APIRouter()

MAX_FIELD_NODES = 10_000
MAX_PARENT_DEPTH = 128


@dataclass
class SignatureRemovalStats:
    signature_fields_removed: int = 0
    signature_widgets_removed: int = 0
    signature_values_removed: int = 0
    permission_entries_removed: int = 0
    dss_removed: int = 0

    @property
    def total(self) -> int:
        return (
            self.signature_fields_removed
            + self.signature_widgets_removed
            + self.signature_values_removed
            + self.permission_entries_removed
            + self.dss_removed
        )


def _entry_dictionary(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    value = entry.get("value")
    if isinstance(value, dict):
        return value
    stream = entry.get("stream")
    if isinstance(stream, dict) and isinstance(stream.get("dict"), dict):
        return stream["dict"]
    return None


def _resolve_dictionary(objects: dict[str, Any], value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not OBJECT_REF_RE.fullmatch(value):
        return None
    return _entry_dictionary(objects.get(f"obj:{value}"))


def _effective_field_type(objects: dict[str, Any], value: Any) -> str | None:
    current_value = value
    seen: set[str] = set()
    for _ in range(MAX_PARENT_DEPTH):
        current = _resolve_dictionary(objects, current_value)
        if current is None:
            return None
        field_type = current.get("/FT")
        if isinstance(field_type, str):
            return field_type
        parent = current.get("/Parent")
        if not isinstance(parent, str) or not OBJECT_REF_RE.fullmatch(parent) or parent in seen:
            return None
        seen.add(parent)
        current_value = parent
    raise HTTPException(status_code=422, detail="PDF form field inheritance is too deep")


def _collect_signature_subtree(
    objects: dict[str, Any],
    value: Any,
    *,
    removed_refs: set[str],
    signature_value_refs: set[str],
    visited: set[str | int],
    counter: list[int],
) -> None:
    identity: str | int
    if isinstance(value, str) and OBJECT_REF_RE.fullmatch(value):
        identity = value
        removed_refs.add(value)
    elif isinstance(value, dict):
        identity = id(value)
    else:
        return
    if identity in visited:
        return
    visited.add(identity)
    counter[0] += 1
    if counter[0] > MAX_FIELD_NODES:
        raise HTTPException(status_code=422, detail="PDF form field tree is too large")

    field = _resolve_dictionary(objects, value)
    if field is None:
        return
    signature_value = field.get("/V")
    if isinstance(signature_value, str) and OBJECT_REF_RE.fullmatch(signature_value):
        signature_value_refs.add(signature_value)

    kids = field.get("/Kids")
    if isinstance(kids, list):
        for child in kids:
            _collect_signature_subtree(
                objects,
                child,
                removed_refs=removed_refs,
                signature_value_refs=signature_value_refs,
                visited=visited,
                counter=counter,
            )


def _prune_field(
    objects: dict[str, Any],
    value: Any,
    *,
    inherited_type: str | None,
    removed_refs: set[str],
    signature_value_refs: set[str],
    visited_collect: set[str | int],
    counter: list[int],
    stats: SignatureRemovalStats,
) -> bool:
    field = _resolve_dictionary(objects, value)
    if field is None:
        return True

    local_type = field.get("/FT")
    effective_type = local_type if isinstance(local_type, str) else inherited_type
    if effective_type == "/Sig":
        stats.signature_fields_removed += 1
        _collect_signature_subtree(
            objects,
            value,
            removed_refs=removed_refs,
            signature_value_refs=signature_value_refs,
            visited=visited_collect,
            counter=counter,
        )
        return False

    kids = field.get("/Kids")
    if isinstance(kids, list):
        kept: list[Any] = []
        for child in kids:
            if _prune_field(
                objects,
                child,
                inherited_type=effective_type,
                removed_refs=removed_refs,
                signature_value_refs=signature_value_refs,
                visited_collect=visited_collect,
                counter=counter,
                stats=stats,
            ):
                kept.append(child)
        if kept != kids:
            if kept:
                field["/Kids"] = kept
            else:
                field.pop("/Kids", None)
    return True


def _remove_signature_widgets(
    objects: dict[str, Any],
    removed_refs: set[str],
    stats: SignatureRemovalStats,
) -> None:
    for entry in objects.values():
        page = _entry_dictionary(entry)
        if page is None or page.get("/Type") != "/Page":
            continue
        annots = page.get("/Annots")
        if not isinstance(annots, list):
            continue

        kept: list[Any] = []
        changed = False
        for annotation in annots:
            annotation_dict = _resolve_dictionary(objects, annotation)
            subtype = annotation_dict.get("/Subtype") if annotation_dict else None
            annotation_ref = annotation if isinstance(annotation, str) and OBJECT_REF_RE.fullmatch(annotation) else None
            is_signature_widget = (
                subtype == "/Widget"
                and (annotation_ref in removed_refs or _effective_field_type(objects, annotation) == "/Sig")
            )
            if is_signature_widget:
                stats.signature_widgets_removed += 1
                changed = True
                continue
            kept.append(annotation)

        if changed:
            if kept:
                page["/Annots"] = kept
            else:
                page.pop("/Annots", None)


def _remove_catalog_signature_state(
    objects: dict[str, Any],
    catalog: dict[str, Any],
    stats: SignatureRemovalStats,
) -> None:
    perms_value = catalog.get("/Perms")
    perms = _resolve_dictionary(objects, perms_value)
    if perms is not None:
        for key in ("/DocMDP", "/UR", "/UR3"):
            if key in perms:
                perms.pop(key, None)
                stats.permission_entries_removed += 1
        if not perms:
            catalog.pop("/Perms", None)

    if "/DSS" in catalog:
        catalog.pop("/DSS", None)
        stats.dss_removed += 1


def _build_signature_removal_update(
    data: dict[str, Any],
) -> tuple[dict[str, Any], SignatureRemovalStats]:
    qpdf = data.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf JSON structure")

    metadata = qpdf[0] if isinstance(qpdf[0], dict) else {}
    original_objects: dict[str, Any] = qpdf[1]
    objects: dict[str, Any] = copy.deepcopy(original_objects)
    stats = SignatureRemovalStats()

    trailer = _entry_dictionary(objects.get("trailer"))
    if trailer is None:
        raise HTTPException(status_code=422, detail="PDF trailer is unavailable")
    catalog = _resolve_dictionary(objects, trailer.get("/Root"))
    if catalog is None:
        raise HTTPException(status_code=422, detail="PDF catalog is unavailable")

    removed_refs: set[str] = set()
    signature_value_refs: set[str] = set()
    acroform = _resolve_dictionary(objects, catalog.get("/AcroForm"))
    if acroform is not None:
        fields = acroform.get("/Fields")
        if isinstance(fields, list):
            kept_fields: list[Any] = []
            visited_collect: set[str | int] = set()
            counter = [0]
            for field in fields:
                if _prune_field(
                    objects,
                    field,
                    inherited_type=None,
                    removed_refs=removed_refs,
                    signature_value_refs=signature_value_refs,
                    visited_collect=visited_collect,
                    counter=counter,
                    stats=stats,
                ):
                    kept_fields.append(field)
            if kept_fields != fields:
                acroform["/Fields"] = kept_fields
                acroform.pop("/SigFlags", None)

    _remove_signature_widgets(objects, removed_refs, stats)
    _remove_catalog_signature_state(objects, catalog, stats)

    for signature_value_ref in signature_value_refs:
        object_key = f"obj:{signature_value_ref}"
        entry = objects.get(object_key)
        if isinstance(entry, dict):
            objects[object_key] = {"value": {}}
            stats.signature_values_removed += 1

    updates: dict[str, Any] = {}
    for object_key, original_entry in original_objects.items():
        updated_entry = objects.get(object_key)
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

    return {
        "qpdf": [
            {"jsonversion": int(metadata.get("jsonversion", 2))},
            updates,
        ]
    }, stats


def _remove_signatures_pdf(input_path: Path, output_path: Path) -> SignatureRemovalStats:
    source_json_path = input_path.with_name("remove-signatures-source.json")
    update_json_path = input_path.with_name("remove-signatures-update.json")
    data = _qpdf_json(input_path, source_json_path)
    update_json, stats = _build_signature_removal_update(data)

    if stats.total == 0:
        shutil.copyfile(input_path, output_path)
        return stats

    update_json_path.write_text(
        json.dumps(update_json, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    result = _run(
        ["qpdf", str(input_path), f"--update-from-json={update_json_path}", str(output_path)]
    )
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf signature removal failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce an output PDF")

    check = _run(["qpdf", "--check", str(output_path)])
    if check.returncode not in (0, 3):
        detail = (check.stderr or check.stdout or "signature-removed PDF failed qpdf validation").strip()[-1200:]
        raise HTTPException(status_code=500, detail=detail)
    return stats


@router.post("/pdf/remove-signatures")
def remove_signatures(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> FileResponse:
    _require_qpdf_json()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-remove-signatures-"))
    try:
        input_path = work_dir / "input.pdf"
        output_path = work_dir / "solyan-unsigned.pdf"
        input_path.write_bytes(data)
        stats = _remove_signatures_pdf(input_path, output_path)
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=output_path,
        media_type="application/pdf",
        filename="solyan-unsigned.pdf",
        headers={
            "X-SolYan-Signature-Fields-Removed": str(stats.signature_fields_removed),
            "X-SolYan-Signature-Widgets-Removed": str(stats.signature_widgets_removed),
            "X-SolYan-Signature-Values-Removed": str(stats.signature_values_removed),
            "X-SolYan-Signature-Permissions-Removed": str(stats.permission_entries_removed),
            "X-SolYan-Signature-DSS-Removed": str(stats.dss_removed),
        },
        background=background_tasks,
    )
