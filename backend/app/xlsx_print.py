from __future__ import annotations

import io
import json
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

_WORKSHEET_RE = re.compile(r"^xl/worksheets/sheet\d+\.xml$")
_PAGE_REF_RE = re.compile(r"page\s+1:\s+(\d+)\s+(\d+)\s+R")
_OBJECT_REF_RE = re.compile(r"^(\d+)\s+(\d+)\s+R$")

# Common spreadsheet print-paper codes from OOXML / Excel conventions.
# Dimensions are PDF points in portrait orientation. Matching is orientation-
# independent and allows a small tolerance for producer rounding.
_PAPER_SIZES = (
    (1, 612.0, 792.0),       # Letter
    (3, 792.0, 1224.0),      # Tabloid
    (5, 612.0, 1008.0),      # Legal
    (8, 841.89, 1190.55),    # A3
    (9, 595.28, 841.89),     # A4
    (11, 419.53, 595.28),    # A5
)
_PAPER_TOLERANCE_POINTS = 8.0


def detect_pdf_print_setup(pdf_bytes: bytes) -> tuple[int, str] | None:
    """Return ``(paperSize, orientation)`` for the first PDF page when known.

    qpdf is already a required backend engine. Using its object/JSON inspection
    keeps this helper dependency-free and handles inherited MediaBox/Rotate
    values instead of assuming A4 or parsing raw PDF syntax heuristically.
    Unknown/custom paper sizes deliberately return ``None`` so SolYan leaves the
    upstream XLSX unchanged.
    """

    if not pdf_bytes.startswith(b"%PDF-"):
        return None

    try:
        with tempfile.TemporaryDirectory(prefix="solyan-xlsx-print-") as temp_dir:
            path = Path(temp_dir) / "source.pdf"
            path.write_bytes(pdf_bytes)

            shown = subprocess.run(
                ["qpdf", "--show-pages", str(path)],
                check=True,
                capture_output=True,
                text=True,
                timeout=15,
            )
            match = _PAGE_REF_RE.search(shown.stdout)
            if not match:
                return None

            obj = int(match.group(1))
            gen = int(match.group(2))
            media_box: list[float] | None = None
            rotate: float | None = None
            seen: set[tuple[int, int]] = set()

            for _ in range(16):
                ref = (obj, gen)
                if ref in seen:
                    break
                seen.add(ref)
                value = _read_qpdf_object(path, obj, gen)
                if value is None:
                    break

                if media_box is None:
                    candidate = value.get("/MediaBox")
                    if isinstance(candidate, list) and len(candidate) == 4:
                        try:
                            media_box = [float(item) for item in candidate]
                        except (TypeError, ValueError):
                            media_box = None

                if rotate is None and "/Rotate" in value:
                    try:
                        rotate = float(value["/Rotate"])
                    except (TypeError, ValueError):
                        rotate = None

                if media_box is not None and rotate is not None:
                    break

                parent = value.get("/Parent")
                if not isinstance(parent, str):
                    break
                parent_match = _OBJECT_REF_RE.match(parent)
                if not parent_match:
                    break
                obj = int(parent_match.group(1))
                gen = int(parent_match.group(2))

            if media_box is None:
                return None

            width = abs(media_box[2] - media_box[0])
            height = abs(media_box[3] - media_box[1])
            if width <= 0 or height <= 0:
                return None

            if rotate is not None and int(rotate) % 180 != 0:
                width, height = height, width

            paper_size = _match_paper_size(width, height)
            if paper_size is None:
                return None
            orientation = "landscape" if width > height else "portrait"
            return paper_size, orientation
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return None


def apply_fit_to_width(xlsx_bytes: bytes, paper_size: int, orientation: str) -> bytes:
    """Add fit-to-width metadata without changing workbook content or custom setup.

    A worksheet that already contains ``<pageSetup>`` is left byte-for-byte
    unchanged. The caller must supply page geometry derived from the source PDF;
    SolYan does not guess a paper size for unknown/custom documents.
    """

    if paper_size <= 0 or orientation not in {"portrait", "landscape"}:
        return xlsx_bytes

    try:
        source = zipfile.ZipFile(io.BytesIO(xlsx_bytes), "r")
    except (zipfile.BadZipFile, OSError):
        return xlsx_bytes

    output = io.BytesIO()
    changed = False
    try:
        with source, zipfile.ZipFile(output, "w") as target:
            for info in source.infolist():
                payload = source.read(info.filename)
                if _WORKSHEET_RE.match(info.filename):
                    updated = _patch_worksheet(payload, paper_size, orientation)
                    changed = changed or updated != payload
                    payload = updated
                target.writestr(info, payload)
    except (zipfile.BadZipFile, OSError, UnicodeError):
        return xlsx_bytes

    return output.getvalue() if changed else xlsx_bytes


def _read_qpdf_object(path: Path, obj: int, gen: int) -> dict | None:
    result = subprocess.run(
        [
            "qpdf",
            "--json=2",
            "--json-key=qpdf",
            f"--json-object={obj},{gen}",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    payload = json.loads(result.stdout)
    qpdf_data = payload.get("qpdf")
    if not isinstance(qpdf_data, list) or len(qpdf_data) < 2 or not isinstance(qpdf_data[1], dict):
        return None
    entry = qpdf_data[1].get(f"obj:{obj} {gen} R")
    if not isinstance(entry, dict):
        return None
    value = entry.get("value")
    return value if isinstance(value, dict) else None


def _match_paper_size(width: float, height: float) -> int | None:
    short, long = sorted((width, height))
    for code, expected_width, expected_height in _PAPER_SIZES:
        expected_short, expected_long = sorted((expected_width, expected_height))
        if (
            abs(short - expected_short) <= _PAPER_TOLERANCE_POINTS
            and abs(long - expected_long) <= _PAPER_TOLERANCE_POINTS
        ):
            return code
    return None


def _patch_worksheet(xml_bytes: bytes, paper_size: int, orientation: str) -> bytes:
    text = xml_bytes.decode("utf-8")
    if "<pageSetup" in text:
        return xml_bytes

    text = _ensure_fit_to_page_property(text)
    page_setup = (
        f'<pageSetup paperSize="{paper_size}" orientation="{orientation}" '
        'fitToWidth="1" fitToHeight="0"/>'
    )
    if "</worksheet>" not in text:
        return xml_bytes
    text = text.replace("</worksheet>", f"  {page_setup}\n</worksheet>", 1)
    return text.encode("utf-8")


def _ensure_fit_to_page_property(text: str) -> str:
    if "<pageSetUpPr" in text:
        return text

    if "</sheetPr>" in text:
        return text.replace("</sheetPr>", '<pageSetUpPr fitToPage="1"/></sheetPr>', 1)

    if "<sheetPr/>" in text:
        return text.replace("<sheetPr/>", '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>', 1)

    match = re.search(r"<worksheet\b[^>]*>", text)
    if not match:
        return text
    insertion = '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    return text[: match.end()] + f"\n  {insertion}" + text[match.end() :]
