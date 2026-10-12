from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import httpx
import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageStat

_GEOMETRY_DIMENSION_TOLERANCE = 0.01
_GEOMETRY_ASPECT_TOLERANCE = 0.005


def render_pages(pdf_bytes: bytes, scale: float = 1.25):
    document = pdfium.PdfDocument(pdf_bytes)
    pages = []
    try:
        for index in range(len(document)):
            page = document[index]
            pages.append(page.render(scale=scale).to_pil().convert('RGB'))
    finally:
        document.close()
    return pages


def _geometry_is_equivalent(left: tuple[int, int], right: tuple[int, int]) -> bool:
    if left == right:
        return True
    lw, lh = left
    rw, rh = right
    if min(lw, lh, rw, rh) <= 0:
        return False
    width_delta = abs(lw - rw) / max(lw, rw)
    height_delta = abs(lh - rh) / max(lh, rh)
    left_aspect = lw / lh
    right_aspect = rw / rh
    aspect_delta = abs(left_aspect - right_aspect) / max(left_aspect, right_aspect)
    return (
        width_delta <= _GEOMETRY_DIMENSION_TOLERANCE
        and height_delta <= _GEOMETRY_DIMENSION_TOLERANCE
        and aspect_delta <= _GEOMETRY_ASPECT_TOLERANCE
    )


def visual_similarity(left: bytes, right: bytes) -> dict:
    a_pages = render_pages(left)
    b_pages = render_pages(right)
    compared = min(len(a_pages), len(b_pages))
    total_slots = max(len(a_pages), len(b_pages))
    scores = []
    geometry_normalized_pages = 0
    geometry_mismatches = 0
    try:
        for index in range(compared):
            a = a_pages[index]
            b = b_pages[index]
            comparison = b
            resized = None
            if a.size != b.size:
                if not _geometry_is_equivalent(a.size, b.size):
                    geometry_mismatches += 1
                    scores.append(0.0)
                    continue
                resized = b.resize(a.size, resample=Image.Resampling.LANCZOS)
                comparison = resized
                geometry_normalized_pages += 1

            try:
                diff = ImageChops.difference(a, comparison)
                stat = ImageStat.Stat(diff)
                mean_delta = sum(stat.mean[:3]) / 3.0
                scores.append(max(0.0, 100.0 * (1.0 - mean_delta / 255.0)))
            finally:
                if resized is not None:
                    resized.close()

        # Missing or extra round-trip pages are a structural fidelity failure.
        # Represent each unmatched page as a zero-similarity slot so a conversion
        # cannot score highly by reproducing only the first N matching pages.
        scores.extend([0.0] * (total_slots - compared))
    finally:
        for image in [*a_pages, *b_pages]:
            image.close()

    return {
        'source_pages': len(a_pages),
        'roundtrip_pages': len(b_pages),
        'compared_pages': compared,
        'unmatched_pages': abs(len(a_pages) - len(b_pages)),
        'page_count_match': len(a_pages) == len(b_pages),
        'source_render_sizes': [list(image.size) for image in a_pages],
        'roundtrip_render_sizes': [list(image.size) for image in b_pages],
        'geometry_normalized_pages': geometry_normalized_pages,
        'geometry_mismatches': geometry_mismatches,
        'page_similarity': scores,
        'average_similarity': sum(scores) / max(1, total_slots),
    }


def benchmark_pdf(source: bytes, filename: str, target: str, api: str) -> tuple[dict, bytes, bytes]:
    if not source.startswith(b'%PDF-'):
        raise ValueError('Input is not a PDF')
    if target not in {'docx', 'xlsx', 'pptx'}:
        raise ValueError(f'Unsupported target: {target}')

    start = time.perf_counter()
    with httpx.Client(timeout=360.0) as client:
        converted = client.post(
            f"{api.rstrip('/')}/experimental/pdf-to-office",
            files={'file': (filename, source, 'application/pdf')},
            data={'target': target},
        )
        converted.raise_for_status()
        office_bytes = converted.content
        convert_seconds = time.perf_counter() - start

        roundtrip_start = time.perf_counter()
        roundtrip = client.post(
            f"{api.rstrip('/')}/office/to-pdf",
            files={'file': (f'roundtrip.{target}', office_bytes, 'application/octet-stream')},
        )
        roundtrip.raise_for_status()
        roundtrip_pdf = roundtrip.content
        roundtrip_seconds = time.perf_counter() - roundtrip_start

    metrics = visual_similarity(source, roundtrip_pdf)
    report = {
        'source': filename,
        'target': target,
        'source_bytes': len(source),
        'office_bytes': len(office_bytes),
        'roundtrip_pdf_bytes': len(roundtrip_pdf),
        'convert_seconds': convert_seconds,
        'roundtrip_seconds': roundtrip_seconds,
        **metrics,
    }
    return report, office_bytes, roundtrip_pdf


def main() -> None:
    parser = argparse.ArgumentParser(description='Round-trip fidelity benchmark for experimental PDF -> Office conversion.')
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--target', choices=['docx', 'xlsx', 'pptx'], default='docx')
    parser.add_argument('--api', default='http://localhost:8000')
    parser.add_argument('--save-dir', type=Path)
    args = parser.parse_args()

    source = args.pdf.read_bytes()
    try:
        report, office_bytes, roundtrip_pdf = benchmark_pdf(source, args.pdf.name, args.target, args.api)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    if args.save_dir:
        args.save_dir.mkdir(parents=True, exist_ok=True)
        (args.save_dir / f'converted.{args.target}').write_bytes(office_bytes)
        (args.save_dir / 'roundtrip.pdf').write_bytes(roundtrip_pdf)
        (args.save_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
