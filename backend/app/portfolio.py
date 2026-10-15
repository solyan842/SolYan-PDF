from __future__ import annotations

import json
import mimetypes
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from .attachments import _attachment_map, _require_qpdf, _run_text, _safe_name

router = APIRouter()

MAX_PORTFOLIO_FILES = 50
MAX_PORTFOLIO_FILE_SIZE = 25 * 1024 * 1024
MAX_PORTFOLIO_TOTAL = 100 * 1024 * 1024
MAX_PORTFOLIO_OUTPUT = 115 * 1024 * 1024


def _export_qpdf_json(input_path: Path, json_path: Path) -> dict[str, Any]:
    result = _run_text(
        [
            "qpdf",
            "--json-output",
            "--json-stream-data=none",
            str(input_path),
            str(json_path),
        ]
    )
    if result.returncode not in (0, 3):
        raise HTTPException(status_code=422, detail="qpdf portfolio inspection failed")
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="qpdf produced invalid portfolio JSON") from exc
    qpdf = payload.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf portfolio JSON structure")
    return payload


def _portfolio_update(input_path: Path, output_path: Path, temp_dir: Path) -> None:
    payload = _export_qpdf_json(input_path, temp_dir / "portfolio-source.json")
    qpdf = payload["qpdf"]
    metadata = qpdf[0] if isinstance(qpdf[0], dict) else {}
    objects: dict[str, Any] = qpdf[1]

    trailer_entry = objects.get("trailer")
    trailer = trailer_entry.get("value") if isinstance(trailer_entry, dict) else None
    if not isinstance(trailer, dict):
        raise HTTPException(status_code=422, detail="PDF portfolio trailer is unavailable")
    root_ref = trailer.get("/Root")
    if not isinstance(root_ref, str):
        raise HTTPException(status_code=422, detail="PDF portfolio catalog reference is unavailable")
    catalog_entry = objects.get(f"obj:{root_ref}")
    catalog = catalog_entry.get("value") if isinstance(catalog_entry, dict) else None
    if not isinstance(catalog, dict):
        raise HTTPException(status_code=422, detail="PDF portfolio catalog is unavailable")

    updated_catalog = dict(catalog)
    updated_catalog["/Collection"] = {
        "/Type": "/Collection",
        "/View": "/D",
    }
    updated_catalog["/PageMode"] = "/UseAttachments"

    update_payload = {
        "qpdf": [
            {"jsonversion": int(metadata.get("jsonversion", 2))},
            {f"obj:{root_ref}": {"value": updated_catalog}},
        ]
    }
    update_path = temp_dir / "portfolio-update.json"
    update_path.write_text(
        json.dumps(update_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    _run_text(["qpdf", str(input_path), f"--update-from-json={update_path}", str(output_path)])
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce a PDF portfolio")


def _validate_portfolio(input_path: Path, *, expected_files: int, temp_dir: Path) -> None:
    attachments = _attachment_map(input_path)
    if len(attachments) != expected_files:
        raise HTTPException(
            status_code=500,
            detail=f"Portfolio validation expected {expected_files} files but found {len(attachments)}",
        )

    payload = _export_qpdf_json(input_path, temp_dir / "portfolio-verify.json")
    objects: dict[str, Any] = payload["qpdf"][1]
    trailer_entry = objects.get("trailer")
    trailer = trailer_entry.get("value") if isinstance(trailer_entry, dict) else None
    root_ref = trailer.get("/Root") if isinstance(trailer, dict) else None
    catalog_entry = objects.get(f"obj:{root_ref}") if isinstance(root_ref, str) else None
    catalog = catalog_entry.get("value") if isinstance(catalog_entry, dict) else None
    collection = catalog.get("/Collection") if isinstance(catalog, dict) else None
    if not isinstance(collection, dict) or collection.get("/Type") != "/Collection":
        raise HTTPException(status_code=500, detail="Portfolio validation could not find /Collection")
    if catalog.get("/PageMode") != "/UseAttachments":
        raise HTTPException(status_code=500, detail="Portfolio validation could not confirm attachment page mode")

    check = _run_text(["qpdf", "--check", str(input_path)])
    if check.returncode not in (0, 3):
        raise HTTPException(status_code=500, detail="Generated PDF portfolio failed qpdf validation")


@router.post("/pdf/portfolio")
def create_pdf_portfolio(files: list[UploadFile] = File(...)) -> Response:
    _require_qpdf()
    if not files:
        raise HTTPException(status_code=400, detail="Select at least one file for the PDF portfolio")
    if len(files) > MAX_PORTFOLIO_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"A PDF portfolio may contain at most {MAX_PORTFOLIO_FILES} files per request",
        )

    with tempfile.TemporaryDirectory(prefix="solyan-portfolio-") as temp_name:
        temp_dir = Path(temp_name)
        base_path = temp_dir / "portfolio-base.pdf"
        output_path = temp_dir / "solyan-portfolio.pdf"
        command = ["qpdf", "--empty"]
        total = 0
        seen_keys: set[str] = set()

        for index, upload in enumerate(files, start=1):
            data = upload.file.read(MAX_PORTFOLIO_FILE_SIZE + 1)
            if len(data) > MAX_PORTFOLIO_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"Portfolio file {index} exceeds the 25 MB per-file limit",
                )
            total += len(data)
            if total > MAX_PORTFOLIO_TOTAL:
                raise HTTPException(status_code=413, detail="Combined portfolio files exceed the 100 MB limit")

            filename = _safe_name(upload.filename, f"file-{index}.bin")
            key = filename
            if key in seen_keys:
                stem = Path(filename).stem or "file"
                suffix = Path(filename).suffix
                candidate_index = index
                key = f"{stem}-{candidate_index}{suffix}"
                while key in seen_keys:
                    candidate_index += 1
                    key = f"{stem}-{candidate_index}{suffix}"
            seen_keys.add(key)

            item_path = temp_dir / f"portfolio-item-{index:03d}.bin"
            item_path.write_bytes(data)
            mime = upload.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
            command.extend(
                [
                    "--add-attachment",
                    str(item_path),
                    f"--key={key}",
                    f"--filename={filename}",
                    f"--mimetype={mime}",
                    "--",
                ]
            )

        command.append(str(base_path))
        _run_text(command)
        if not base_path.exists():
            raise HTTPException(status_code=500, detail="qpdf did not create the portfolio attachment container")

        _portfolio_update(base_path, output_path, temp_dir)
        _validate_portfolio(output_path, expected_files=len(files), temp_dir=temp_dir)
        output = output_path.read_bytes()
        if len(output) > MAX_PORTFOLIO_OUTPUT:
            raise HTTPException(status_code=413, detail="Generated PDF portfolio exceeds the 115 MB response limit")

    return Response(
        content=output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="solyan-portfolio.pdf"',
            "X-SolYan-Portfolio-Files": str(len(files)),
        },
    )
