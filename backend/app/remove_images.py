from __future__ import annotations

import copy
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .sanitize import OBJECT_REF_RE, _qpdf_json, _read_pdf, _require_qpdf_json, _run

router = APIRouter()

MAX_PAGE_WALK = 2_000
MAX_PAGE_TREE_NODES = 10_000
MAX_RESOURCE_WALK = 20_000


def _entry_dictionary(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    value = entry.get("value")
    if isinstance(value, dict):
        return value
    stream = entry.get("stream")
    if isinstance(stream, dict):
        stream_dict = stream.get("dict")
        if isinstance(stream_dict, dict):
            return stream_dict
    return None


def _resolve_dictionary(objects: dict[str, Any], value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not OBJECT_REF_RE.fullmatch(value):
        return None
    return _entry_dictionary(objects.get(f"obj:{value}"))


def _reachable_pages(objects: dict[str, Any]) -> list[dict[str, Any]]:
    trailer = _entry_dictionary(objects.get("trailer"))
    if trailer is None:
        raise HTTPException(status_code=422, detail="PDF trailer is unavailable")

    catalog = _resolve_dictionary(objects, trailer.get("/Root"))
    if catalog is None:
        raise HTTPException(status_code=422, detail="PDF catalog is unavailable")

    pages_root = catalog.get("/Pages")
    if pages_root is None:
        raise HTTPException(status_code=422, detail="PDF page tree is unavailable")

    pages: list[dict[str, Any]] = []
    stack: list[Any] = [pages_root]
    seen: set[str | int] = set()
    visited_nodes = 0

    while stack:
        node_value = stack.pop()
        node_id: str | int
        if isinstance(node_value, str) and OBJECT_REF_RE.fullmatch(node_value):
            node_id = node_value
        elif isinstance(node_value, dict):
            node_id = id(node_value)
        else:
            continue
        if node_id in seen:
            continue
        seen.add(node_id)

        visited_nodes += 1
        if visited_nodes > MAX_PAGE_TREE_NODES:
            raise HTTPException(status_code=422, detail="PDF page tree is too large")

        node = _resolve_dictionary(objects, node_value)
        if node is None:
            continue
        node_type = node.get("/Type")
        if node_type == "/Page":
            pages.append(node)
            if len(pages) > MAX_PAGE_WALK:
                raise HTTPException(
                    status_code=422,
                    detail=f"Remove Images is limited to {MAX_PAGE_WALK} pages",
                )
            continue

        kids = node.get("/Kids")
        if node_type == "/Pages" and isinstance(kids, list):
            stack.extend(reversed(kids))

    return pages


def _page_resources(objects: dict[str, Any], page: dict[str, Any]) -> Any:
    current = page
    seen: set[str] = set()
    for _ in range(128):
        if "/Resources" in current:
            return current.get("/Resources")
        parent = current.get("/Parent")
        if not isinstance(parent, str) or not OBJECT_REF_RE.fullmatch(parent) or parent in seen:
            return None
        seen.add(parent)
        resolved = _resolve_dictionary(objects, parent)
        if resolved is None:
            return None
        current = resolved
    raise HTTPException(status_code=422, detail="PDF page-tree inheritance is too deep")


def _remove_from_resources(
    objects: dict[str, Any],
    resources_value: Any,
    *,
    visited_resources: set[str | int],
    visited_forms: set[str],
    counters: dict[str, int],
) -> int:
    resources = _resolve_dictionary(objects, resources_value)
    if resources is None:
        return 0

    resource_id: str | int
    if isinstance(resources_value, str) and OBJECT_REF_RE.fullmatch(resources_value):
        resource_id = resources_value
    else:
        resource_id = id(resources)
    if resource_id in visited_resources:
        return 0
    visited_resources.add(resource_id)
    counters["resources"] += 1
    if counters["resources"] > MAX_RESOURCE_WALK:
        raise HTTPException(status_code=422, detail="PDF resource graph is too large")

    xobjects_value = resources.get("/XObject")
    xobjects = _resolve_dictionary(objects, xobjects_value)
    if xobjects is None:
        return 0

    removed = 0
    for name, target in list(xobjects.items()):
        target_dict = _resolve_dictionary(objects, target)
        if target_dict is None:
            continue

        subtype = target_dict.get("/Subtype")
        if subtype == "/Image":
            xobjects.pop(name, None)
            removed += 1
            continue

        if subtype != "/Form":
            continue
        if isinstance(target, str) and OBJECT_REF_RE.fullmatch(target):
            if target in visited_forms:
                continue
            visited_forms.add(target)
        form_resources = target_dict.get("/Resources")
        if form_resources is not None:
            removed += _remove_from_resources(
                objects,
                form_resources,
                visited_resources=visited_resources,
                visited_forms=visited_forms,
                counters=counters,
            )

    return removed


def _build_remove_images_update(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    qpdf = data.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf JSON structure")

    metadata = qpdf[0] if isinstance(qpdf[0], dict) else {}
    original_objects: dict[str, Any] = qpdf[1]
    objects: dict[str, Any] = copy.deepcopy(original_objects)

    visited_resources: set[str | int] = set()
    visited_forms: set[str] = set()
    counters = {"resources": 0}
    removed = 0

    for page in _reachable_pages(objects):
        resources_value = _page_resources(objects, page)
        if resources_value is None:
            continue
        removed += _remove_from_resources(
            objects,
            resources_value,
            visited_resources=visited_resources,
            visited_forms=visited_forms,
            counters=counters,
        )

    updates: dict[str, Any] = {}
    for object_key, original_entry in original_objects.items():
        updated_entry = objects.get(object_key)
        if not isinstance(original_entry, dict) or not isinstance(updated_entry, dict):
            continue

        original_value = original_entry.get("value")
        updated_value = updated_entry.get("value")
        if isinstance(original_value, (dict, list)) and updated_value != original_value:
            updates[object_key] = {"value": updated_value}
            continue

        original_stream = original_entry.get("stream")
        updated_stream = updated_entry.get("stream")
        if isinstance(original_stream, dict) and isinstance(updated_stream, dict):
            original_dict = original_stream.get("dict")
            updated_dict = updated_stream.get("dict")
            if isinstance(original_dict, dict) and updated_dict != original_dict:
                updates[object_key] = {"stream": {"dict": updated_dict}}

    return {
        "qpdf": [
            {"jsonversion": int(metadata.get("jsonversion", 2))},
            updates,
        ]
    }, removed


def _remove_images_pdf(input_path: Path, output_path: Path) -> int:
    source_json_path = input_path.with_name("remove-images-source.json")
    update_json_path = input_path.with_name("remove-images-update.json")
    data = _qpdf_json(input_path, source_json_path)
    update_json, removed = _build_remove_images_update(data)
    update_json_path.write_text(
        json.dumps(update_json, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    if removed == 0:
        result = _run(["qpdf", str(input_path), str(output_path)])
    else:
        result = _run(
            ["qpdf", str(input_path), f"--update-from-json={update_json_path}", str(output_path)]
        )
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf image removal failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce an output PDF")

    check = _run(["qpdf", "--check", str(output_path)])
    if check.returncode not in (0, 3):
        detail = (check.stderr or check.stdout or "image-removed PDF failed qpdf validation").strip()[-1200:]
        raise HTTPException(status_code=500, detail=detail)
    return removed


@router.post("/pdf/remove-images")
def remove_images(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> FileResponse:
    _require_qpdf_json()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-remove-images-"))
    try:
        input_path = work_dir / "input.pdf"
        output_path = work_dir / "solyan-images-removed.pdf"
        input_path.write_bytes(data)
        removed = _remove_images_pdf(input_path, output_path)
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=output_path,
        media_type="application/pdf",
        filename="solyan-images-removed.pdf",
        headers={"X-SolYan-Images-Removed": str(removed)},
        background=background_tasks,
    )
