from __future__ import annotations

import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .sanitize import _annotation_subtype, _qpdf_json, _read_pdf, _require_qpdf_json, _run

router = APIRouter()

COMMENT_ANNOTATION_TYPES = {
    "/Text",
    "/FreeText",
    "/Line",
    "/Square",
    "/Circle",
    "/Polygon",
    "/PolyLine",
    "/Highlight",
    "/Underline",
    "/Squiggly",
    "/StrikeOut",
    "/Stamp",
    "/Caret",
    "/Ink",
    "/Popup",
}


@dataclass
class AnnotationRemovalStats:
    comments_removed: int = 0
    other_annotations_removed: int = 0
    widgets_preserved: int = 0

    @property
    def total_removed(self) -> int:
        return self.comments_removed + self.other_annotations_removed


def _build_annotation_update(data: dict[str, Any], remove_all_non_widget: bool) -> tuple[dict[str, Any], AnnotationRemovalStats]:
    qpdf = data.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf JSON structure")

    metadata = qpdf[0] if isinstance(qpdf[0], dict) else {}
    objects = qpdf[1]
    updates: dict[str, Any] = {}
    stats = AnnotationRemovalStats()

    for object_key, entry in objects.items():
        if not object_key.startswith("obj:") or not isinstance(entry, dict):
            continue
        value = entry.get("value")
        if not isinstance(value, dict) or value.get("/Type") != "/Page":
            continue
        annotations = value.get("/Annots")
        if not isinstance(annotations, list):
            continue

        kept: list[Any] = []
        changed = False
        for annotation in annotations:
            subtype = _annotation_subtype(objects, annotation)
            if subtype == "/Widget":
                stats.widgets_preserved += 1
                kept.append(annotation)
                continue
            if subtype in COMMENT_ANNOTATION_TYPES:
                stats.comments_removed += 1
                changed = True
                continue
            if remove_all_non_widget and subtype is not None:
                stats.other_annotations_removed += 1
                changed = True
                continue
            kept.append(annotation)

        if changed:
            updated_page = dict(value)
            if kept:
                updated_page["/Annots"] = kept
            else:
                updated_page.pop("/Annots", None)
            updates[object_key] = {"value": updated_page}

    return {
        "qpdf": [
            {"jsonversion": int(metadata.get("jsonversion", 2))},
            updates,
        ]
    }, stats


def _remove_annotations(input_path: Path, output_path: Path, remove_all_non_widget: bool) -> AnnotationRemovalStats:
    source_json = input_path.with_suffix(".json")
    update_path = input_path.with_name("remove-annotations-update.json")
    data = _qpdf_json(input_path, source_json)
    update, stats = _build_annotation_update(data, remove_all_non_widget)
    update_path.write_text(json.dumps(update, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    if stats.total_removed:
        result = _run(["qpdf", str(input_path), f"--update-from-json={update_path}", str(output_path)])
    else:
        result = _run(["qpdf", str(input_path), str(output_path)])
    if result.returncode not in (0, 3):
        detail = (result.stderr or result.stdout or "qpdf annotation removal failed").strip()[-1200:]
        raise HTTPException(status_code=422, detail=detail)
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce an output PDF")

    check = _run(["qpdf", "--check", str(output_path)])
    if check.returncode not in (0, 3):
        detail = (check.stderr or check.stdout or "annotation-cleaned PDF failed qpdf validation").strip()[-1200:]
        raise HTTPException(status_code=500, detail=detail)
    return stats


@router.post("/pdf/remove-annotations")
def remove_annotations(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    remove_all_non_widget: bool = Form(default=False),
) -> FileResponse:
    _require_qpdf_json()
    data = _read_pdf(file)
    work_dir = Path(tempfile.mkdtemp(prefix="solyan-remove-annotations-"))
    try:
        input_path = work_dir / "input.pdf"
        output_path = work_dir / "solyan-without-comments.pdf"
        input_path.write_bytes(data)
        stats = _remove_annotations(input_path, output_path, remove_all_non_widget)
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise

    background_tasks.add_task(shutil.rmtree, work_dir, True)
    return FileResponse(
        path=output_path,
        media_type="application/pdf",
        filename="solyan-without-comments.pdf",
        headers={
            "X-SolYan-Comments-Removed": str(stats.comments_removed),
            "X-SolYan-Other-Annotations-Removed": str(stats.other_annotations_removed),
            "X-SolYan-Widgets-Preserved": str(stats.widgets_preserved),
        },
        background=background_tasks,
    )
