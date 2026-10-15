from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.pdf_to_csv import _xlsx_to_csv_outputs

ROOT = Path("/tmp/solyan-pdf-to-csv")
ROOT.mkdir(parents=True, exist_ok=True)

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>"""

SHARED = """<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6">
  <si><t>Tên</t></si><si><t>Giá</t></si><si><t>Cáp đồng</t></si>
  <si><t>=2+2</t></si><si><t>Hà Nội</t></si><si><t>@cmd</t></si>
</sst>"""

SHEET1 = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
  <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>-123</v></c></row>
  <row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>42.5</v></c></row>
</sheetData></worksheet>"""

SHEET2 = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"/></sheetData></worksheet>"""

SHEET3 = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="s"><v>4</v></c><c r="B1" t="s"><v>5</v></c></row>
</sheetData></worksheet>"""


def make_workbook(*, multi: bool) -> bytes:
    sheet_defs = [('Page 1', 1, 'rId1', SHEET1)]
    if multi:
        sheet_defs.extend([
            ('Raster Only', 2, 'rId2', SHEET2),
            ('Page 3', 3, 'rId3', SHEET3),
        ])

    sheets_xml = "\n".join(
        f'<sheet name="{name}" sheetId="{sheet_id}" r:id="{rel_id}"/>'
        for name, sheet_id, rel_id, _ in sheet_defs
    )
    workbook = f'''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>{sheets_xml}</sheets>
</workbook>'''
    rels_xml = "\n".join(
        f'<Relationship Id="{rel_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{sheet_id}.xml"/>'
        for _, sheet_id, rel_id, _ in sheet_defs
    )
    rels = f'''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels_xml}</Relationships>'''

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', CONTENT_TYPES)
        archive.writestr('xl/workbook.xml', workbook)
        archive.writestr('xl/_rels/workbook.xml.rels', rels)
        archive.writestr('xl/sharedStrings.xml', SHARED)
        for _, sheet_id, _, sheet_xml in sheet_defs:
            archive.writestr(f'xl/worksheets/sheet{sheet_id}.xml', sheet_xml)
    return buffer.getvalue()


def gate_semantics(multi: bytes) -> None:
    outputs = _xlsx_to_csv_outputs(multi, 'bao-cao')
    assert [name for name, _ in outputs] == ['bao-cao_Page-1.csv', 'bao-cao_Page-3.csv'], outputs
    assert all(content.startswith(b'\xef\xbb\xbf') for _, content in outputs)

    first = outputs[0][1].decode('utf-8-sig')
    rows = list(csv.reader(io.StringIO(first)))
    assert rows[0] == ['Tên', 'Giá'], rows
    assert rows[1] == ['Cáp đồng', '-123'], rows
    assert rows[2] == ["'=2+2", '42.5'], rows
    assert '"-123"' in first, first

    third = outputs[1][1].decode('utf-8-sig')
    assert list(csv.reader(io.StringIO(third))) == [['Hà Nội', "'@cmd"]]
    print('XLSX -> CSV semantic gate: PASS')


def gate_routes(multi: bytes, single: bytes) -> None:
    client = TestClient(app)

    class MultiClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def post(self, url, files=None, data=None):
            assert url.endswith('/ocr/xlsx'), url
            assert files['file'][1].startswith(b'%PDF-')
            return httpx.Response(200, content=multi, headers={'x-solyan-ocr-engine': 'PP-StructureV3'})

    with patch('app.pdf_to_csv.httpx.Client', MultiClient):
        response = client.post('/pdf/to-csv', files={'file': ('Báo cáo 2026.pdf', b'%PDF-1.7\nfixture', 'application/pdf')})
    assert response.status_code == 200, response.text
    assert response.headers['content-type'].startswith('application/zip'), response.headers
    assert response.headers['x-solyan-csv-engine'] == 'PP-StructureV3'
    assert response.headers['x-solyan-csv-files'] == '2'
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert names == ['B-o-c-o-2026_Page-1.csv', 'B-o-c-o-2026_Page-3.csv'], names
        assert archive.read(names[0]).startswith(b'\xef\xbb\xbf')

    class SingleClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def post(self, *args, **kwargs):
            return httpx.Response(200, content=single, headers={'x-solyan-ocr-engine': 'PP-StructureV3'})

    with patch('app.pdf_to_csv.httpx.Client', SingleClient):
        one = client.post('/pdf/to-csv', files={'file': ('one.pdf', b'%PDF-1.7\nfixture', 'application/pdf')})
    assert one.status_code == 200, one.text
    assert one.headers['content-type'].startswith('text/csv'), one.headers
    assert one.headers['x-solyan-csv-files'] == '1'
    assert one.content.startswith(b'\xef\xbb\xbf')

    class EmptyClient:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def post(self, *args, **kwargs):
            return httpx.Response(422, json={'detail': 'PP-StructureV3 found no exportable tables'})

    with patch('app.pdf_to_csv.httpx.Client', EmptyClient):
        empty = client.post('/pdf/to-csv', files={'file': ('empty.pdf', b'%PDF-1.7\nfixture', 'application/pdf')})
    assert empty.status_code == 422, empty.text
    assert 'no exportable tables' in empty.json()['detail']

    bad = client.post('/pdf/to-csv', files={'file': ('x.txt', b'hello', 'text/plain')})
    assert bad.status_code == 400, bad.text
    print('public PDF -> CSV single/ZIP/error routes: PASS')


def main() -> None:
    multi = make_workbook(multi=True)
    single = make_workbook(multi=False)
    ROOT.joinpath('fixture.xlsx').write_bytes(multi)
    ROOT.joinpath('single.xlsx').write_bytes(single)
    gate_semantics(multi)
    gate_routes(multi, single)
    print('PDF -> CSV regression gate: PASS')


if __name__ == '__main__':
    main()
