from __future__ import annotations

from pathlib import Path
from typing import Any

DEFAULT_DIVIDER_MARKER = "SOLYAN:PDF:AUTO-SPLIT:v1"
MAX_AUTO_SPLIT_PAGES = 300
LOW_DPI = 150
RETRY_DPI = 300
MAX_RENDER_LONG_EDGE = 2400
MAX_TOTAL_RENDER_PIXELS = 700_000_000


def _render_page(page: Any, dpi: int) -> Any:
    from PIL import Image

    width_pt = float(page.get_width())
    height_pt = float(page.get_height())
    if width_pt <= 0 or height_pt <= 0:
        raise ValueError("Invalid PDF page geometry")

    scale = dpi / 72.0
    scale = min(scale, MAX_RENDER_LONG_EDGE / max(width_pt, height_pt))
    bitmap = page.render(scale=scale)
    try:
        return bitmap.to_pil().convert("RGB")
    finally:
        closer = getattr(bitmap, "close", None)
        if callable(closer):
            closer()


def _decoded_qr_values(image: Any) -> set[str]:
    import cv2
    import numpy as np

    rgb = np.asarray(image)
    if rgb.ndim != 3 or rgb.shape[2] < 3:
        return set()
    bgr = cv2.cvtColor(rgb[:, :, :3], cv2.COLOR_RGB2BGR)
    detector = cv2.QRCodeDetector()
    values: set[str] = set()

    try:
        ok, decoded_info, _points, _straight = detector.detectAndDecodeMulti(bgr)
        if ok:
            values.update(value for value in decoded_info if value)
    except (AttributeError, cv2.error, ValueError):
        pass

    if values:
        return values

    try:
        value, _points, _straight = detector.detectAndDecode(bgr)
        if value:
            values.add(value)
    except (cv2.error, ValueError):
        pass
    return values


def analyze_qr_dividers_file(
    input_path: Path,
    suffix: str,
    marker: str = DEFAULT_DIVIDER_MARKER,
) -> list[dict[str, Any]]:
    """Find exact-match QR divider pages without modifying the source PDF.

    Pages are rendered temporarily with PDFium at 150 DPI first and retried at
    300 DPI only when the marker is not found. Render dimensions and aggregate
    pixels are bounded so a large PDF cannot expand without limit in memory/CPU.
    """

    if suffix.lower() != ".pdf":
        raise ValueError("QR Auto Split accepts PDF input only")
    marker = marker.strip()
    if not marker or len(marker) > 512:
        raise ValueError("Divider marker must contain 1-512 characters")

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(input_path))
    total_pixels = 0
    try:
        page_count = len(pdf)
        if page_count < 1:
            raise ValueError("PDF contains no pages")
        if page_count > MAX_AUTO_SPLIT_PAGES:
            raise ValueError(f"PDF exceeds the {MAX_AUTO_SPLIT_PAGES}-page Auto Split limit")

        results: list[dict[str, Any]] = []
        for index in range(page_count):
            page = pdf[index]
            matched_at_dpi: int | None = None
            qr_count = 0

            for dpi in (LOW_DPI, RETRY_DPI):
                image = _render_page(page, dpi)
                try:
                    pixels = image.width * image.height
                    total_pixels += pixels
                    if total_pixels > MAX_TOTAL_RENDER_PIXELS:
                        raise ValueError("QR analysis exceeds the aggregate raster pixel limit")
                    values = _decoded_qr_values(image)
                finally:
                    image.close()

                qr_count = max(qr_count, len(values))
                if marker in values:
                    matched_at_dpi = dpi
                    break

            results.append(
                {
                    "page": index + 1,
                    "divider": matched_at_dpi is not None,
                    "matchedAtDpi": matched_at_dpi,
                    "qrCount": qr_count,
                }
            )
        return results
    finally:
        pdf.close()


def make_divider_png(marker: str = DEFAULT_DIVIDER_MARKER, size: int = 1200) -> bytes:
    """Create a high-contrast printable QR image for the exact divider marker."""

    marker = marker.strip()
    if not marker or len(marker) > 512:
        raise ValueError("Divider marker must contain 1-512 characters")
    if size < 320 or size > 2400:
        raise ValueError("Divider image size must be between 320 and 2400 pixels")

    import cv2
    import numpy as np

    encoder = cv2.QRCodeEncoder_create()
    matrix = encoder.encode(marker)
    if matrix is None or matrix.size == 0:
        raise ValueError("Unable to generate divider QR code")

    quiet_modules = 4
    module_count = int(matrix.shape[0])
    canvas_modules = module_count + quiet_modules * 2
    module_size = max(1, size // canvas_modules)
    actual = canvas_modules * module_size
    canvas = np.full((actual, actual), 255, dtype=np.uint8)
    qr = cv2.resize(
        matrix,
        (module_count * module_size, module_count * module_size),
        interpolation=cv2.INTER_NEAREST,
    )
    offset = quiet_modules * module_size
    canvas[offset : offset + qr.shape[0], offset : offset + qr.shape[1]] = qr

    ok, encoded = cv2.imencode(".png", canvas)
    if not ok:
        raise ValueError("Unable to encode divider QR image")
    return encoded.tobytes()
