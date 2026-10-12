from __future__ import annotations

import io
import re
import zipfile

_WORKSHEET_RE = re.compile(r"^xl/worksheets/sheet\d+\.xml$")


def apply_fit_to_width(xlsx_bytes: bytes) -> bytes:
    """Add fit-to-width print metadata to worksheets that do not define page setup.

    Bloom's current XLSX exporter writes worksheet cell geometry but no print-page
    setup. Office applications then choose their own default print pagination,
    which can turn a one-page source table into multiple PDF pages on round-trip.

    This postprocessor is intentionally conservative:
    - only worksheet XML parts are considered;
    - worksheets that already contain ``<pageSetup>`` are left unchanged;
    - cell values, formulas, styles and dimensions are not modified;
    - invalid/non-XLSX ZIP input is returned unchanged rather than corrupting the
      upstream conversion result.
    """

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
                    updated = _patch_worksheet(payload)
                    changed = changed or updated != payload
                    payload = updated
                target.writestr(info, payload)
    except (zipfile.BadZipFile, OSError, UnicodeError):
        return xlsx_bytes

    return output.getvalue() if changed else xlsx_bytes


def _patch_worksheet(xml_bytes: bytes) -> bytes:
    text = xml_bytes.decode("utf-8")
    if "<pageSetup" in text:
        return xml_bytes

    text = _ensure_fit_to_page_property(text)
    page_setup = '<pageSetup fitToWidth="1" fitToHeight="0"/>'
    if "</worksheet>" not in text:
        return xml_bytes
    text = text.replace("</worksheet>", f"  {page_setup}\n</worksheet>", 1)
    return text.encode("utf-8")


def _ensure_fit_to_page_property(text: str) -> str:
    if "<pageSetUpPr" in text:
        return text

    # Bloom currently emits no sheetPr. Keep support for a future non-empty
    # sheetPr without overriding any other sheet properties.
    if "</sheetPr>" in text:
        return text.replace("</sheetPr>", '<pageSetUpPr fitToPage="1"/></sheetPr>', 1)

    if "<sheetPr/>" in text:
        return text.replace("<sheetPr/>", '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>', 1)

    match = re.search(r"<worksheet\b[^>]*>", text)
    if not match:
        return text
    insertion = '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    return text[: match.end()] + f"\n  {insertion}" + text[match.end() :]
