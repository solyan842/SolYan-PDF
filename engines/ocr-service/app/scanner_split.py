from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

MAX_SCANNER_PAGES = 100
SCAN_RENDER_DPI = 300
MAX_RENDER_LONG_EDGE = 4200
MAX_TOTAL_RENDER_PIXELS = 400_000_000
MAX_PHOTOS = 500


@dataclass
class PhotoCrop:
    page: int
    index: int
    image: Any
    bounds: tuple[int, int, int, int]
    rotation: float


def _validate_parameters(
    *,
    angle_threshold: float,
    tolerance: int,
    min_area: int,
    min_contour_area: float,
    border_size: int,
) -> None:
    if not 0.0 <= angle_threshold <= 45.0:
        raise ValueError("angle_threshold must be between 0 and 45 degrees")
    if not 0 <= tolerance <= 255:
        raise ValueError("tolerance must be between 0 and 255")
    if not 100 <= min_area <= 100_000_000:
        raise ValueError("min_area must be between 100 and 100000000 pixels")
    if not 0.0 <= min_contour_area <= 100_000_000.0:
        raise ValueError("min_contour_area must be between 0 and 100000000 pixels")
    if not 0 <= border_size <= 500:
        raise ValueError("border_size must be between 0 and 500 pixels")


def _edge_samples(image: Any, max_samples_per_edge: int = 256) -> Any:
    import numpy as np

    height, width = image.shape[:2]
    if height < 1 or width < 1:
        raise ValueError("Image has invalid dimensions")

    step_x = max(1, width // max_samples_per_edge)
    step_y = max(1, height // max_samples_per_edge)
    samples = [
        image[0, ::step_x, :3],
        image[height - 1, ::step_x, :3],
        image[::step_y, 0, :3],
        image[::step_y, width - 1, :3],
    ]
    return np.concatenate(samples, axis=0)


def estimate_background_color(image: Any) -> Any:
    """Estimate scanner-bed/background color from image edges only.

    Using edge samples avoids the upstream failure mode where the center sample
    may land inside a photo and pull the background estimate toward foreground.
    """

    import numpy as np

    samples = _edge_samples(image).astype(np.float32)
    return np.median(samples, axis=0)


def foreground_mask(image: Any, background_color: Any, tolerance: int) -> Any:
    import cv2
    import numpy as np

    pixels = image[:, :, :3].astype(np.int16)
    background = np.asarray(background_color, dtype=np.int16).reshape((1, 1, 3))
    delta = np.max(np.abs(pixels - background), axis=2)
    mask = np.where(delta > tolerance, 255, 0).astype(np.uint8)

    # Bridge small scan gaps without aggressively joining nearby photographs.
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.dilate(mask, kernel, iterations=1)
    return mask


def detect_photo_regions(
    image: Any,
    *,
    tolerance: int,
    min_area: int,
    min_contour_area: float,
) -> tuple[list[tuple[int, int, int, int]], Any, Any]:
    import cv2

    background = estimate_background_color(image)
    mask = foreground_mask(image, background, tolerance)
    contours, _hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    regions: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width <= 0 or height <= 0:
            continue
        if width * height < min_area:
            continue
        if float(cv2.contourArea(contour)) < min_contour_area:
            continue
        regions.append((int(x), int(y), int(width), int(height)))

    # Deterministic reading order. Contour enumeration order is not stable
    # across OpenCV versions, so never expose it as output ordering.
    regions.sort(key=lambda rect: (rect[1], rect[0], rect[3], rect[2]))
    return regions, mask, background


def _expand_bounds(
    bounds: tuple[int, int, int, int],
    *,
    border_size: int,
    image_width: int,
    image_height: int,
) -> tuple[int, int, int, int]:
    x, y, width, height = bounds
    left = max(0, x - border_size)
    top = max(0, y - border_size)
    right = min(image_width, x + width + border_size)
    bottom = min(image_height, y + height + border_size)
    return left, top, right - left, bottom - top


def _normalized_rect_angle(contour: Any) -> float:
    import cv2

    rect = cv2.minAreaRect(contour)
    box = cv2.boxPoints(rect)
    longest_angle = 0.0
    longest_length = -1.0
    for index in range(4):
        x1, y1 = box[index]
        x2, y2 = box[(index + 1) % 4]
        dx = float(x2 - x1)
        dy = float(y2 - y1)
        length = math.hypot(dx, dy)
        if length > longest_length:
            longest_length = length
            longest_angle = math.degrees(math.atan2(dy, dx))

    # A rectangle is symmetric every 90 degrees. Fold the selected long edge
    # into [-45, 45] so we only perform deskew, not arbitrary page rotation.
    while longest_angle <= -45.0:
        longest_angle += 90.0
    while longest_angle > 45.0:
        longest_angle -= 90.0
    return longest_angle


def _rotate_bound(image: Any, angle: float, background_color: Any) -> Any:
    import cv2
    import numpy as np

    height, width = image.shape[:2]
    center = (width / 2.0, height / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    cosine = abs(matrix[0, 0])
    sine = abs(matrix[0, 1])
    new_width = max(1, int(math.ceil((height * sine) + (width * cosine))))
    new_height = max(1, int(math.ceil((height * cosine) + (width * sine))))
    matrix[0, 2] += (new_width / 2.0) - center[0]
    matrix[1, 2] += (new_height / 2.0) - center[1]
    border = tuple(int(round(value)) for value in np.asarray(background_color).tolist())
    return cv2.warpAffine(
        image,
        matrix,
        (new_width, new_height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border,
    )


def _deskew_crop(
    crop: Any,
    crop_mask: Any,
    *,
    angle_threshold: float,
    background_color: Any,
) -> tuple[Any, float]:
    import cv2

    contours, _hierarchy = cv2.findContours(crop_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return crop, 0.0
    contour = max(contours, key=cv2.contourArea)
    if len(contour) < 3:
        return crop, 0.0

    angle = _normalized_rect_angle(contour)
    if abs(angle) < angle_threshold:
        return crop, 0.0
    # Rotate in the opposite direction of the detected long edge.
    correction = -angle
    return _rotate_bound(crop, correction, background_color), correction


def split_image(
    image: Any,
    *,
    page: int,
    angle_threshold: float,
    tolerance: int,
    min_area: int,
    min_contour_area: float,
    border_size: int,
) -> list[PhotoCrop]:
    regions, mask, background = detect_photo_regions(
        image,
        tolerance=tolerance,
        min_area=min_area,
        min_contour_area=min_contour_area,
    )
    height, width = image.shape[:2]
    results: list[PhotoCrop] = []
    for index, region in enumerate(regions, start=1):
        x, y, crop_width, crop_height = _expand_bounds(
            region,
            border_size=border_size,
            image_width=width,
            image_height=height,
        )
        crop = image[y : y + crop_height, x : x + crop_width].copy()
        crop_mask = mask[y : y + crop_height, x : x + crop_width].copy()
        if crop.size == 0:
            continue
        crop, correction = _deskew_crop(
            crop,
            crop_mask,
            angle_threshold=angle_threshold,
            background_color=background,
        )
        results.append(
            PhotoCrop(
                page=page,
                index=index,
                image=crop,
                bounds=(x, y, crop_width, crop_height),
                rotation=correction,
            )
        )
    return results


def _render_pdf_images(input_path: Path) -> Iterator[tuple[int, Any]]:
    import cv2
    import numpy as np
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(input_path))
    total_pixels = 0
    try:
        page_count = len(pdf)
        if page_count < 1:
            raise ValueError("PDF contains no pages")
        if page_count > MAX_SCANNER_PAGES:
            raise ValueError(f"PDF exceeds the {MAX_SCANNER_PAGES}-page scanner split limit")

        for index in range(page_count):
            page = pdf[index]
            width_pt = float(page.get_width())
            height_pt = float(page.get_height())
            if width_pt <= 0 or height_pt <= 0:
                raise ValueError(f"Page {index + 1} has invalid geometry")
            scale = SCAN_RENDER_DPI / 72.0
            scale = min(scale, MAX_RENDER_LONG_EDGE / max(width_pt, height_pt))
            bitmap = page.render(scale=scale)
            try:
                rgb = np.asarray(bitmap.to_pil().convert("RGB"))
                bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            finally:
                closer = getattr(bitmap, "close", None)
                if callable(closer):
                    closer()

            pixels = int(bgr.shape[0]) * int(bgr.shape[1])
            total_pixels += pixels
            if total_pixels > MAX_TOTAL_RENDER_PIXELS:
                raise ValueError("Scanner split exceeds the aggregate raster pixel limit")
            yield index + 1, bgr
    finally:
        pdf.close()


def _load_image(input_path: Path) -> Any:
    import cv2
    import numpy as np

    encoded = np.frombuffer(input_path.read_bytes(), dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError("OpenCV could not decode the input image")
    return image


def split_scanned_photos_file(
    input_path: Path,
    suffix: str,
    *,
    angle_threshold: float = 10.0,
    tolerance: int = 30,
    min_area: int = 10_000,
    min_contour_area: float = 500.0,
    border_size: int = 1,
) -> list[PhotoCrop]:
    _validate_parameters(
        angle_threshold=angle_threshold,
        tolerance=tolerance,
        min_area=min_area,
        min_contour_area=min_contour_area,
        border_size=border_size,
    )

    if suffix.lower() == ".pdf":
        images: Iterator[tuple[int, Any]] = _render_pdf_images(input_path)
    else:
        images = iter([(1, _load_image(input_path))])

    results: list[PhotoCrop] = []
    for page, image in images:
        page_results = split_image(
            image,
            page=page,
            angle_threshold=angle_threshold,
            tolerance=tolerance,
            min_area=min_area,
            min_contour_area=min_contour_area,
            border_size=border_size,
        )
        results.extend(page_results)
        if len(results) > MAX_PHOTOS:
            raise ValueError(f"Scanner split exceeds the {MAX_PHOTOS}-photo output limit")
    return results
