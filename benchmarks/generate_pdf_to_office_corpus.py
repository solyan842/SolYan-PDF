from __future__ import annotations

import argparse
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas


def _header(c: canvas.Canvas, title: str, subtitle: str, width: float, height: float) -> None:
    c.setFont('Helvetica-Bold', 20)
    c.drawString(42, height - 54, title)
    c.setFont('Helvetica', 9)
    c.setFillColor(colors.HexColor('#555555'))
    c.drawString(42, height - 72, subtitle)
    c.setFillColor(colors.black)


def _table(c: canvas.Canvas, x: float, y: float, rows: list[list[str]], widths: list[float], row_h: float = 24) -> None:
    total_w = sum(widths)
    total_h = row_h * len(rows)
    c.setStrokeColor(colors.HexColor('#999999'))
    c.setLineWidth(0.6)
    c.rect(x, y - total_h, total_w, total_h)
    cursor = x
    for width in widths[:-1]:
        cursor += width
        c.line(cursor, y, cursor, y - total_h)
    for index in range(1, len(rows)):
        c.line(x, y - index * row_h, x + total_w, y - index * row_h)
    for r, row in enumerate(rows):
        for col, text in enumerate(row):
            tx = x + sum(widths[:col]) + 5
            ty = y - (r + 1) * row_h + 8
            c.setFont('Helvetica-Bold' if r == 0 else 'Helvetica', 8)
            c.drawString(tx, ty, text[:36])


def _paragraph(c: canvas.Canvas, x: float, y: float, width_chars: int, lines: int) -> None:
    text = c.beginText(x, y)
    text.setFont('Helvetica', 10)
    sentence = 'SolYan PDF synthetic benchmark content preserves structure, spacing, alignment and reading order.'
    for index in range(lines):
        line = f'{index + 1:02d}. {sentence}'[:width_chars]
        text.textLine(line)
    c.drawText(text)


def _bars(c: canvas.Canvas, x: float, y: float, width: float, values: list[int]) -> None:
    c.setStrokeColor(colors.HexColor('#666666'))
    c.line(x, y, x, y + 150)
    c.line(x, y, x + width, y)
    step = width / len(values)
    for index, value in enumerate(values):
        bar_h = value * 1.3
        bx = x + index * step + 8
        c.setFillColor(colors.HexColor('#6A8DFF'))
        c.rect(bx, y, max(12, step - 16), bar_h, fill=1, stroke=0)
        c.setFillColor(colors.black)
        c.setFont('Helvetica', 7)
        c.drawCentredString(bx + max(12, step - 16) / 2, y - 12, f'Q{index + 1}')


def _draw_case(path: Path, case: dict) -> None:
    target = case['target']
    template = case['template']
    pagesize = landscape(A4) if target == 'pptx' else A4
    width, height = pagesize
    c = canvas.Canvas(str(path), pagesize=pagesize, pageCompression=1)
    c.setTitle(case['id'])
    _header(c, case['title'], f"Synthetic controlled corpus · target={target} · template={template}", width, height)

    if template == 'paragraphs':
        _paragraph(c, 48, height - 105, 92, 28)
    elif template == 'two_columns':
        _paragraph(c, 48, height - 110, 48, 24)
        _paragraph(c, width / 2 + 12, height - 110, 48, 24)
        c.setStrokeColor(colors.HexColor('#BBBBBB'))
        c.line(width / 2, 80, width / 2, height - 95)
    elif template == 'document_table':
        _paragraph(c, 48, height - 110, 86, 6)
        rows = [['Item', 'Description', 'Qty', 'Amount']] + [[f'{i:02d}', f'Line item {i}', str(i % 5 + 1), f'{i * 125:,}'] for i in range(1, 12)]
        _table(c, 48, height - 210, rows, [55, 270, 55, 90], 23)
    elif template == 'form':
        labels = ['Full name', 'Organization', 'Document number', 'Date', 'Address', 'Email', 'Notes']
        y = height - 120
        c.setFont('Helvetica', 10)
        for label in labels:
            c.drawString(48, y, label)
            c.line(160, y - 2, width - 55, y - 2)
            y -= 48
        c.rect(48, y - 110, width - 103, 95)
    elif template == 'mixed_typography':
        sizes = [8, 10, 12, 16, 22, 30]
        y = height - 120
        for size in sizes:
            c.setFont('Helvetica-Bold' if size >= 16 else 'Helvetica', size)
            c.drawString(48, y, f'Typography sample size {size}')
            y -= size + 22
        _paragraph(c, 48, y - 10, 86, 10)
    elif template == 'header_footer':
        _paragraph(c, 48, height - 120, 86, 26)
        c.setFont('Helvetica-Bold', 8)
        c.drawString(42, height - 88, 'CONFIDENTIAL · STRUCTURE TEST')
        c.setFont('Helvetica', 8)
        c.drawString(42, 32, 'SolYan PDF · synthetic page footer')
        c.drawRightString(width - 42, 32, 'Page 1 / 1')
    elif template == 'simple_grid':
        rows = [['Product', 'Jan', 'Feb', 'Mar', 'Total']] + [[f'SKU-{i:02d}', str(10 + i), str(14 + i), str(12 + i), str(36 + 3 * i)] for i in range(1, 14)]
        _table(c, 48, height - 120, rows, [120, 75, 75, 75, 85], 26)
    elif template == 'dense_grid':
        rows = [['ID'] + [f'C{j}' for j in range(1, 9)]] + [[str(i)] + [str(i * j) for j in range(1, 9)] for i in range(1, 23)]
        _table(c, 35, height - 105, rows, [36] + [61] * 8, 19)
    elif template == 'financial':
        rows = [['Account', 'Budget', 'Actual', 'Variance']] + [[f'Cost center {i}', f'{12000+i*700:,}', f'{11800+i*830:,}', f'{-200+i*130:,}'] for i in range(1, 15)]
        _table(c, 55, height - 130, rows, [190, 95, 95, 95], 25)
        c.setFont('Helvetica-Bold', 11)
        c.drawString(55, 80, 'Total variance and subtotal rows should remain aligned.')
    elif template == 'invoice':
        c.setFont('Helvetica-Bold', 28)
        c.drawString(48, height - 125, 'INVOICE')
        c.setFont('Helvetica', 10)
        c.drawRightString(width - 48, height - 115, 'INV-2026-1012')
        rows = [['Description', 'Qty', 'Unit price', 'Line total']] + [[f'Service package {i}', str(i), f'{i*250:,}', f'{i*i*250:,}'] for i in range(1, 9)]
        _table(c, 48, height - 190, rows, [245, 55, 85, 95], 28)
    elif template == 'schedule':
        rows = [['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']] + [[f'{8+i}:00', 'Review', 'Build', 'Test', 'Docs', 'Release'] for i in range(8)]
        _table(c, 42, height - 120, rows, [62, 82, 82, 82, 82, 82], 34)
    elif template == 'matrix':
        rows = [['Metric'] + [f'S{i}' for i in range(1, 7)]] + [[f'M{i}'] + [f'{(i*j)%97}%' for j in range(1, 7)] for i in range(1, 11)]
        _table(c, 65, height - 130, rows, [110] + [65] * 6, 30)
    elif template == 'title_slide':
        c.setFont('Helvetica-Bold', 34)
        c.drawCentredString(width / 2, height / 2 + 30, 'SolYan PDF')
        c.setFont('Helvetica', 18)
        c.drawCentredString(width / 2, height / 2 - 10, 'PDF to PowerPoint structure benchmark')
        c.line(width * 0.25, height / 2 - 35, width * 0.75, height / 2 - 35)
    elif template == 'bullets':
        c.setFont('Helvetica-Bold', 28)
        c.drawString(55, height - 120, 'Release priorities')
        c.setFont('Helvetica', 18)
        y = height - 180
        for text in ['Preserve hierarchy', 'Preserve indentation', 'Preserve line wrapping', 'Preserve visual rhythm', 'Preserve slide boundaries']:
            c.circle(72, y + 5, 4, fill=1)
            c.drawString(92, y, text)
            y -= 58
    elif template == 'slide_columns':
        c.setFont('Helvetica-Bold', 28)
        c.drawString(50, height - 105, 'Two-column comparison')
        c.setStrokeColor(colors.HexColor('#CCCCCC'))
        c.rect(55, 85, width / 2 - 80, height - 230)
        c.rect(width / 2 + 25, 85, width / 2 - 80, height - 230)
        _paragraph(c, 75, height - 155, 42, 12)
        _paragraph(c, width / 2 + 45, height - 155, 42, 12)
    elif template == 'bar_chart':
        c.setFont('Helvetica-Bold', 28)
        c.drawString(55, height - 105, 'Quarterly performance')
        _bars(c, 85, 120, width - 170, [58, 82, 67, 104, 91, 116])
    elif template == 'cards':
        c.setFont('Helvetica-Bold', 28)
        c.drawString(55, height - 105, 'Dashboard cards')
        positions = [(55, 270), (width / 2 + 10, 270), (55, 95), (width / 2 + 10, 95)]
        for idx, (x, y) in enumerate(positions, 1):
            c.setStrokeColor(colors.HexColor('#AAAAAA'))
            c.roundRect(x, y, width / 2 - 80, 135, 12)
            c.setFont('Helvetica-Bold', 22)
            c.drawString(x + 20, y + 82, f'KPI {idx}')
            c.setFont('Helvetica', 14)
            c.drawString(x + 20, y + 45, f'{idx * 23}.7%')
    elif template == 'timeline':
        c.setFont('Helvetica-Bold', 28)
        c.drawString(55, height - 105, 'Project timeline')
        y = height / 2
        c.setLineWidth(3)
        c.line(95, y, width - 95, y)
        for idx in range(5):
            x = 120 + idx * ((width - 240) / 4)
            c.circle(x, y, 9, fill=1)
            c.setFont('Helvetica-Bold', 12)
            c.drawCentredString(x, y + 28, f'M{idx + 1}')
            c.setFont('Helvetica', 9)
            c.drawCentredString(x, y - 32, ['Plan', 'Build', 'Test', 'Pilot', 'Release'][idx])
    else:
        raise ValueError(f"Unknown template: {template}")

    c.showPage()
    c.save()


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate the versioned SolYan PDF synthetic PDF-to-Office benchmark corpus.')
    parser.add_argument('--manifest', type=Path, default=Path('benchmarks/corpora/pdf_to_office_synthetic_v1.json'))
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    cases = manifest['cases']
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for case in cases:
        path = args.output_dir / case['filename']
        _draw_case(path, case)
        if not path.read_bytes().startswith(b'%PDF-'):
            raise RuntimeError(f'Generator did not produce a PDF: {path}')
    print(json.dumps({'version': manifest['version'], 'cases': len(cases), 'output_dir': str(args.output_dir)}, indent=2))


if __name__ == '__main__':
    main()
