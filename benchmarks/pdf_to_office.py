from __future__ import annotations

import argparse
import io
import json
import time
from pathlib import Path

import httpx
import pypdfium2 as pdfium
from PIL import ImageChops, ImageStat


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


def visual_similarity(left: bytes, right: bytes) -> dict:
    a_pages = render_pages(left)
    b_pages = render_pages(right)
    compared = min(len(a_pages), len(b_pages))
    scores = []
    try:
        for index in range(compared):
            a = a_pages[index]
            b = b_pages[index]
            if a.size != b.size:
                scores.append(0.0)
                continue
            diff = ImageChops.difference(a, b)
            stat = ImageStat.Stat(diff)
            mean_delta = sum(stat.mean[:3]) / 3.0
            scores.append(max(0.0, 100.0 * (1.0 - mean_delta / 255.0)))
    finally:
        for image in [*a_pages, *b_pages]:
            image.close()
    return {
        'source_pages': len(a_pages),
        'roundtrip_pages': len(b_pages),
        'compared_pages': compared,
        'page_similarity': scores,
        'average_similarity': sum(scores) / max(1, len(scores)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Round-trip fidelity benchmark for experimental PDF -> Office conversion.')
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--target', choices=['docx', 'xlsx', 'pptx'], default='docx')
    parser.add_argument('--api', default='http://localhost:8000')
    parser.add_argument('--save-dir', type=Path)
    args = parser.parse_args()

    source = args.pdf.read_bytes()
    if not source.startswith(b'%PDF-'):
        raise SystemExit('Input is not a PDF')

    start = time.perf_counter()
    with httpx.Client(timeout=360.0) as client:
        converted = client.post(
            f"{args.api.rstrip('/')}/experimental/pdf-to-office",
            files={'file': (args.pdf.name, source, 'application/pdf')},
            data={'target': args.target},
        )
        converted.raise_for_status()
        office_bytes = converted.content
        convert_seconds = time.perf_counter() - start

        roundtrip_start = time.perf_counter()
        roundtrip = client.post(
            f"{args.api.rstrip('/')}/office/to-pdf",
            files={'file': (f'roundtrip.{args.target}', office_bytes, 'application/octet-stream')},
        )
        roundtrip.raise_for_status()
        roundtrip_pdf = roundtrip.content
        roundtrip_seconds = time.perf_counter() - roundtrip_start

    metrics = visual_similarity(source, roundtrip_pdf)
    report = {
        'source': str(args.pdf),
        'target': args.target,
        'source_bytes': len(source),
        'office_bytes': len(office_bytes),
        'roundtrip_pdf_bytes': len(roundtrip_pdf),
        'convert_seconds': convert_seconds,
        'roundtrip_seconds': roundtrip_seconds,
        **metrics,
    }

    if args.save_dir:
        args.save_dir.mkdir(parents=True, exist_ok=True)
        (args.save_dir / f'converted.{args.target}').write_bytes(office_bytes)
        (args.save_dir / 'roundtrip.pdf').write_bytes(roundtrip_pdf)
        (args.save_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
