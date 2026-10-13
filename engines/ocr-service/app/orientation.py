from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pytesseract
from PIL import Image
from pytesseract import Output

ORIENTATION_MAX_PAGES = 300
ORIENTATION_LONG_EDGE_PIXELS = 1800
ORIENTATION_MAX_RENDER_SCALE = 3.0


def _number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _quarter_turn(value: Any) -> int:
    try:
        angle = int(round(float(value))) % 360
    except (TypeError, ValueError):
        return 0
    return angle if angle in {0, 90, 180, 270} else 0


def detect_image_orientation(image: Image.Image) -> dict[str, Any]:
    """Return Tesseract OSD's clockwise correction without modifying the image.

    Tesseract's ``Rotate`` value is the clockwise correction required to make the
    rendered page upright. Detection failure is intentionally a per-page result
    rather than a document-level exception so sparse/blank pages remain unchanged.
    """

    try:
        payload = pytesseract.image_to_osd(image, output_type=Output.DICT)
    except Exception as exc:
        return {
            "resolved": False,
            "correction": 0,
            "confidence": 0.0,
            "orientation": None,
            "script": None,
            "scriptConfidence": None,
            "note": "osdUnavailableForPage",
            "error": str(exc)[:600],
        }

    correction = _quarter_turn(payload.get("rotate"))
    orientation = _quarter_turn(payload.get("orientation"))
    confidence = _number(payload.get("orientation_conf"))
    script_confidence = _number(payload.get("script_conf"), default=-1.0)
    return {
        "resolved": True,
        "correction": correction,
        "confidence": confidence,
        "orientation": orientation,
        "script": payload.get("script") or None,
        "scriptConfidence": None if script_confidence < 0 else script_confidence,
        "note": None,
    }


def _render_pdf_page(page: Any) -> Image.Image:
    width = max(float(page.get_width()), 1.0)
    height = max(float(page.get_height()), 1.0)
    scale = min(
        ORIENTATION_MAX_RENDER_SCALE,
        ORIENTATION_LONG_EDGE_PIXELS / max(width, height),
    )
    scale = max(scale, 0.1)
    bitmap = page.render(scale=scale)
    return bitmap.to_pil().convert("RGB")


def analyze_orientation_file(input_path: Path, suffix: str) -> list[dict[str, Any]]:
    suffix = suffix.lower()
    results: list[dict[str, Any]] = []

    if suffix == ".pdf":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(str(input_path))
        try:
            page_count = len(pdf)
            if page_count > ORIENTATION_MAX_PAGES:
                raise ValueError(
                    f"Auto Rotate is limited to {ORIENTATION_MAX_PAGES} PDF pages"
                )
            for index in range(page_count):
                page = pdf[index]
                image = _render_pdf_page(page)
                try:
                    result = detect_image_orientation(image)
                finally:
                    image.close()
                result["page"] = index + 1
                results.append(result)
        finally:
            pdf.close()
        return results

    with Image.open(input_path) as source:
        image = source.convert("RGB")
        try:
            result = detect_image_orientation(image)
        finally:
            image.close()
    result["page"] = 1
    return [result]


def plan_corrections(
    pages: list[dict[str, Any]],
    *,
    confidence_threshold: float = 14.0,
    infer_undetected: bool = False,
) -> list[dict[str, Any]]:
    """Apply confidence policy and optionally infer a unanimous document correction.

    Inference is deliberately conservative: only resolved pages meeting the
    threshold participate; all qualifying pages must agree on one correction.
    """

    threshold = max(0.0, min(float(confidence_threshold), 100.0))
    planned: list[dict[str, Any]] = []
    confident_corrections: set[int] = set()

    for source in pages:
        item = dict(source)
        confidence = _number(item.get("confidence"))
        resolved = bool(item.get("resolved"))
        correction = _quarter_turn(item.get("correction"))
        apply = resolved and confidence >= threshold and correction != 0
        accepted = resolved and confidence >= threshold
        item["correction"] = correction
        item["apply"] = apply
        item["method"] = "osd" if accepted else "none"
        if accepted:
            confident_corrections.add(correction)
        elif resolved:
            item["note"] = "lowConfidence"
        planned.append(item)

    if infer_undetected and len(confident_corrections) == 1:
        consensus = next(iter(confident_corrections))
        for item in planned:
            if item["method"] != "none":
                continue
            item["correction"] = consensus
            item["apply"] = consensus != 0
            item["method"] = "inferred"
            item["note"] = "inferredFromDocument"

    return planned
