from __future__ import annotations

import argparse
import io
import json
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import httpx
import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageStat

_GEOMETRY_DIMENSION_TOLERANCE = 0.01
_GEOMETRY_ASPECT_TOLERANCE = 0.005
_SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
_NS = {'x': _SHEET_NS}


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
    source_render_sizes = [list(image.size) for image in a_pages]
    roundtrip_render_sizes = [list(image.size) for image in b_pages]
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
        'source_render_sizes': source_render_sizes,
        'roundtrip_render_sizes': roundtrip_render_sizes,
        'geometry_normalized_pages': geometry_normalized_pages,
        'geometry_mismatches': geometry_mismatches,
        'page_similarity': scores,
        'average_similarity': sum(scores) / max(1, total_slots),
    }


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
    except (KeyError, ET.ParseError):
        return []
    out = []
    for item in root.findall('x:si', _NS):
        out.append(''.join(node.text or '' for node in item.findall('.//x:t', _NS)))
    return out


def _cell_preview(root: ET.Element, shared_strings: list[str], limit: int = 32) -> list[dict]:
    preview = []
    for cell in root.findall('.//x:c', _NS):
        value = cell.find('x:v', _NS)
        raw = value.text if value is not None and value.text is not None else ''
        display = raw
        if cell.attrib.get('t') == 's':
            try:
                display = shared_strings[int(raw)]
            except (ValueError, IndexError):
                display = raw
        preview.append({'ref': cell.attrib.get('r'), 'value': display})
        if len(preview) >= limit:
            break
    return preview


def _xlsx_diagnostics(xlsx_bytes: bytes) -> dict:
    try:
        with zipfile.ZipFile(io.BytesIO(xlsx_bytes), 'r') as archive:
            shared_strings = _read_shared_strings(archive)
            sheet_paths = sorted(
                name
                for name in archive.namelist()
                if name.startswith('xl/worksheets/sheet') and name.endswith('.xml')
            )
            sheets = []
            for path in sheet_paths:
                root = ET.fromstring(archive.read(path))
                rows = root.findall('.//x:row', _NS)
                cols = root.findall('.//x:col', _NS)
                heights = []
                for row in rows:
                    value = row.attrib.get('ht')
                    if value is None:
                        continue
                    try:
                        heights.append(float(value))
                    except ValueError:
                        pass
                width_sum = 0.0
                declared_columns = 0
                for col in cols:
                    try:
                        start = int(col.attrib.get('min', '1'))
                        end = int(col.attrib.get('max', str(start)))
                        width = float(col.attrib.get('width', '0'))
                    except ValueError:
                        continue
                    span = max(1, end - start + 1)
                    declared_columns += span
                    width_sum += width * span

                dimension = root.find('x:dimension', _NS)
                page_setup = root.find('x:pageSetup', _NS)
                page_setup_pr = root.find('x:sheetPr/x:pageSetUpPr', _NS)
                sheets.append(
                    {
                        'path': path,
                        'dimension': dimension.attrib.get('ref') if dimension is not None else None,
                        'row_count': len(rows),
                        'explicit_row_height_count': len(heights),
                        'explicit_row_height_sum': sum(heights),
                        'max_explicit_row_height': max(heights) if heights else None,
                        'declared_columns': declared_columns,
                        'declared_column_width_sum': width_sum,
                        'page_setup': dict(page_setup.attrib) if page_setup is not None else None,
                        'page_setup_properties': dict(page_setup_pr.attrib) if page_setup_pr is not None else None,
                        'cell_preview': _cell_preview(root, shared_strings),
                    }
                )
            return {'sheet_count': len(sheet_paths), 'sheets': sheets}
    except (zipfile.BadZipFile, OSError, ET.ParseError):
        return {'error': 'unable to inspect XLSX package'}


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
    if target == 'xlsx':
        report['xlsx_diagnostics'] = _xlsx_diagnostics(office_bytes)
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
