from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError

router = APIRouter()

MAX_PDF_SIZE = 100 * 1024 * 1024
MAX_LABEL_RULES = 20
MAX_PREFIX_LENGTH = 64
COMMAND_TIMEOUT_SECONDS = 120

STYLE_CODES = {
    "decimal": "D",
    "upper_roman": "R",
    "lower_roman": "r",
    "upper_alpha": "A",
    "lower_alpha": "a",
    "none": "",
}


class PageLabelRule(BaseModel):
    first_page: int = Field(ge=1, le=100000)
    style: Literal[
        "decimal",
        "upper_roman",
        "lower_roman",
        "upper_alpha",
        "lower_alpha",
        "none",
    ] = "decimal"
    start: int = Field(default=1, ge=1, le=1000000)
    prefix: str = Field(default="", max_length=MAX_PREFIX_LENGTH)


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    return env


def _require_qpdf() -> None:
    try:
        result = subprocess.run(
            ["qpdf", "--version"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
            env=_env(),
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="qpdf page-label engine is unavailable") from exc

    version_text = (result.stdout or result.stderr or "").strip()
    parts = version_text.split()
    version = next((part for part in parts if part and part[0].isdigit()), "")
    try:
        major, minor, *_ = [int(piece) for piece in version.split(".")]
    except (TypeError, ValueError):
        return
    if (major, minor) < (11, 8):
        raise HTTPException(status_code=503, detail="qpdf 11.8 or newer is required for page labels")


def _run(command: list[str], *, accept_warnings: bool = True) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=_env(),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="qpdf page-label operation timed out") from exc
    allowed = (0, 3) if accept_warnings else (0,)
    if result.returncode not in allowed:
        detail = (result.stderr or result.stdout or "qpdf page-label operation failed").strip()[-1600:]
        raise HTTPException(status_code=422, detail=detail)
    return result


def _read_pdf(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_PDF_SIZE + 1)
    if len(data) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 100 MB limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF header")
    return data


def _page_count(input_path: Path) -> int:
    result = _run(["qpdf", "--show-npages", str(input_path)])
    try:
        count = int(result.stdout.strip())
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="qpdf returned an invalid page count") from exc
    if count < 1:
        raise HTTPException(status_code=422, detail="PDF does not contain any pages")
    return count


def _parse_rules(rules_json: str, page_count: int) -> list[PageLabelRule]:
    try:
        raw = json.loads(rules_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="rules_json must be valid JSON") from exc
    if not isinstance(raw, list):
        raise HTTPException(status_code=422, detail="rules_json must be a JSON array")
    if not raw:
        raise HTTPException(status_code=422, detail="At least one page-label rule is required")
    if len(raw) > MAX_LABEL_RULES:
        raise HTTPException(status_code=413, detail=f"At most {MAX_LABEL_RULES} page-label rules are allowed")

    try:
        rules = [PageLabelRule.model_validate(item) for item in raw]
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid page-label rule: {exc.errors()[0]['msg']}") from exc

    if rules[0].first_page != 1:
        raise HTTPException(status_code=422, detail="The first page-label rule must start at physical page 1")

    previous = 0
    for rule in rules:
        if rule.first_page <= previous:
            raise HTTPException(status_code=422, detail="Page-label rules must be in strictly increasing page order")
        if rule.first_page > page_count:
            raise HTTPException(
                status_code=422,
                detail=f"Page-label rule starts at page {rule.first_page}, but the PDF has only {page_count} pages",
            )
        if any(char in rule.prefix for char in ("/", "\r", "\n", "\x00")):
            raise HTTPException(status_code=422, detail="Page-label prefix cannot contain slash, NUL or line breaks")
        previous = rule.first_page
    return rules


def _rule_spec(rule: PageLabelRule) -> str:
    style = STYLE_CODES[rule.style]
    prefix = rule.prefix
    if not style:
        return f"{rule.first_page}://{prefix}" if prefix else f"{rule.first_page}:"
    if prefix:
        return f"{rule.first_page}:{style}/{rule.start}/{prefix}"
    if rule.start != 1:
        return f"{rule.first_page}:{style}/{rule.start}"
    return f"{rule.first_page}:{style}"


def _catalog_has_page_labels(input_path: Path) -> bool:
    json_path = input_path.with_suffix(".json")
    result = _run(
        [
            "qpdf",
            "--json-output",
            "--json-stream-data=none",
            str(input_path),
            str(json_path),
        ]
    )
    if result.returncode not in (0, 3) or not json_path.exists():
        raise HTTPException(status_code=500, detail="Unable to inspect page labels in generated PDF")
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="qpdf produced invalid page-label JSON") from exc
    qpdf = payload.get("qpdf")
    if not isinstance(qpdf, list) or len(qpdf) != 2 or not isinstance(qpdf[1], dict):
        raise HTTPException(status_code=500, detail="Unexpected qpdf page-label JSON structure")
    objects = qpdf[1]
    trailer_entry = objects.get("trailer")
    trailer = trailer_entry.get("value") if isinstance(trailer_entry, dict) else None
    root_ref = trailer.get("/Root") if isinstance(trailer, dict) else None
    catalog_entry = objects.get(f"obj:{root_ref}") if isinstance(root_ref, str) else None
    catalog = catalog_entry.get("value") if isinstance(catalog_entry, dict) else None
    return isinstance(catalog, dict) and "/PageLabels" in catalog


def _validate_output(output_path: Path, *, expect_labels: bool, expected_pages: int) -> None:
    if not output_path.exists():
        raise HTTPException(status_code=500, detail="qpdf did not produce a page-labeled PDF")
    if _page_count(output_path) != expected_pages:
        raise HTTPException(status_code=500, detail="Page-label operation changed the physical page count")
    if _catalog_has_page_labels(output_path) != expect_labels:
        state = "present" if expect_labels else "removed"
        raise HTTPException(status_code=500, detail=f"PageLabels validation failed: expected labels to be {state}")
    check = _run(["qpdf", "--check", str(output_path)])
    if check.returncode not in (0, 3):
        raise HTTPException(status_code=500, detail="Generated page-labeled PDF failed qpdf validation")


@router.post("/pdf/page-labels")
def set_page_labels(
    file: UploadFile = File(...),
    mode: Literal["set", "remove"] = Form(default="set"),
    rules_json: str = Form(default="[]", max_length=12000),
) -> Response:
    _require_qpdf()
    data = _read_pdf(file)

    with tempfile.TemporaryDirectory(prefix="solyan-page-labels-") as temp_name:
        temp_dir = Path(temp_name)
        input_path = temp_dir / "input.pdf"
        output_path = temp_dir / "solyan-page-labels.pdf"
        input_path.write_bytes(data)
        pages = _page_count(input_path)

        if mode == "remove":
            _run(["qpdf", "--remove-page-labels", str(input_path), str(output_path)])
            expect_labels = False
        else:
            rules = _parse_rules(rules_json, pages)
            specs = [_rule_spec(rule) for rule in rules]
            _run(["qpdf", "--set-page-labels", *specs, "--", str(input_path), str(output_path)])
            expect_labels = True

        _validate_output(output_path, expect_labels=expect_labels, expected_pages=pages)
        output = output_path.read_bytes()

    filename = "solyan-page-labels-removed.pdf" if mode == "remove" else "solyan-page-labeled.pdf"
    return Response(
        content=output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-SolYan-Page-Labels": "removed" if mode == "remove" else "set",
        },
    )
