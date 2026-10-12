from __future__ import annotations

import argparse
import io
import json
import os
import zipfile
from pathlib import Path
from typing import Any

import cv2
import pypdfium2 as pdfium
import xlsxwriter
from img2table.document import Image
from img2table.ocr import TesseractOCR


CONFIGS = [
    {
        "id": "bordered-strict",
        "implicit_rows": False,
        "implicit_columns": False,
        "borderless_tables": False,
    },
    {
        "id": "bordered-implicit",
        "implicit_rows": True,
        "implicit_columns": True,
        "borderless_tables": False,
    },
    {
        "id": "hybrid-implicit",
        "implicit_rows": True,
        "implicit_columns": True,
        "borderless_tables": True,
    },
    {
        "id": "borderless-conservative",
        "implicit_rows": False,
        "implicit_columns": False,
        "borderless_tables": True,
    },
]

# img2table's PDF path renders at 200 DPI. On the historical USSBS scans this
# creates a pathological bordered-line candidate explosion (the first probe
# attempted a 22.3 GiB intermediate array). Render each page ourselves at a
# bounded resolution, then feed the resulting image to img2table. The tiers are
# deliberately conservative and descend when the higher tier is still noisy.
DPI_TIERS = (120, 96, 72)


def _cell_value(cell: Any) -> str:
    value = getattr(cell, "value", "")
    if value is None:
        return ""
    return str(value).strip()


def _summarize_tables(tables: list[Any], page_index: int) -> dict[str, Any]:
    summaries: list[dict[str, Any]] = []
    table_count = 0
    cell_count = 0
    nonempty_cells = 0
    useful_tables = 0

    for table_index, table in enumerate(tables):
        content = getattr(table, "content", {}) or {}
        rows = list(content.values())
        row_count = len(rows)
        col_count = max((len(row) for row in rows), default=0)
        cells = sum(len(row) for row in rows)
        values = [_cell_value(cell) for row in rows for cell in row]
        nonempty = sum(1 for value in values if value)
        preview = [value for value in values if value][:12]
        title = str(getattr(table, "title", "") or "").strip()
        bbox = getattr(table, "bbox", None)
        bbox_summary = None
        if bbox is not None:
            bbox_summary = {
                "x1": getattr(bbox, "x1", None),
                "y1": getattr(bbox, "y1", None),
                "x2": getattr(bbox, "x2", None),
                "y2": getattr(bbox, "y2", None),
            }
        summaries.append(
            {
                "table_index": table_index,
                "title": title,
                "rows": row_count,
                "columns": col_count,
                "cells": cells,
                "nonempty_cells": nonempty,
                "preview": preview,
                "bbox": bbox_summary,
            }
        )
        table_count += 1
        cell_count += cells
        nonempty_cells += nonempty
        if row_count >= 2 and col_count >= 2 and cells >= 4:
            useful_tables += 1

    # Structural scoring is used before OCR so we only OCR one configuration per
    # page. Cap raw cell contribution to keep a noisy giant lattice from winning.
    structural_score = useful_tables * 1000 + min(cell_count, 500) * 3 + table_count * 10
    content_score = structural_score + nonempty_cells * 20
    return {
        "page_index": page_index,
        "tables": summaries,
        "table_count": table_count,
        "useful_tables": useful_tables,
        "cell_count": cell_count,
        "nonempty_cells": nonempty_cells,
        "structural_score": structural_score,
        "score": content_score,
    }


def _render_page_png(document: pdfium.PdfDocument, page_index: int, dpi: int) -> tuple[bytes, int, int]:
    page = document[page_index]
    bitmap = None
    try:
        bitmap = page.render(scale=dpi / 72.0)
        array = bitmap.to_numpy().copy()
        ok, encoded = cv2.imencode(".png", array)
        if not ok:
            raise RuntimeError("OpenCV failed to encode rendered PDF page")
        return encoded.tobytes(), int(bitmap.width), int(bitmap.height)
    finally:
        if bitmap is not None:
            bitmap.close()
        page.close()


def _extract_image_tables(
    png_bytes: bytes,
    config: dict[str, Any],
    min_confidence: int,
    ocr: TesseractOCR | None,
) -> list[Any]:
    image = Image(src=png_bytes, detect_rotation=False)
    return image.extract_tables(
        ocr=ocr,
        implicit_rows=bool(config["implicit_rows"]),
        implicit_columns=bool(config["implicit_columns"]),
        borderless_tables=bool(config["borderless_tables"]),
        min_confidence=min_confidence,
        max_workers=1,
    )


def _xlsx_shape(data: bytes) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            sheets = sorted(
                name
                for name in archive.namelist()
                if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
            )
            return {
                "bytes": len(data),
                "worksheets": len(sheets),
                "worksheet_files": sheets,
            }
    except zipfile.BadZipFile:
        return {"bytes": len(data), "worksheets": 0, "worksheet_files": []}


def _write_tables_xlsx(page_tables: list[tuple[int, list[Any]]]) -> bytes:
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {"in_memory": True})
    cell_format = workbook.add_format({"text_wrap": True, "valign": "top"})
    sheet_count = 0

    for page_index, tables in page_tables:
        for table_index, table in enumerate(tables):
            sheet_count += 1
            name = f"P{page_index + 1}_T{table_index + 1}"[:31]
            sheet = workbook.add_worksheet(name)
            try:
                table._to_worksheet(sheet, cell_format)
            except Exception:
                # Diagnostic fallback: preserve recognized text even if a malformed
                # merged-cell topology cannot be represented by xlsxwriter.
                content = getattr(table, "content", {}) or {}
                for row_index, row in content.items():
                    for col_index, cell in enumerate(row):
                        sheet.write(int(row_index), col_index, getattr(cell, "value", None), cell_format)
                sheet.autofit()

    if sheet_count == 0:
        sheet = workbook.add_worksheet("No_tables")
        sheet.write(0, 0, "No scan tables extracted")

    workbook.close()
    return output.getvalue()


def probe_one(pdf_path: Path, output_dir: Path, min_confidence: int, psm: int) -> dict[str, Any]:
    ocr = TesseractOCR(
        n_threads=1,
        lang=os.getenv("XLSX_SCAN_TESSERACT_LANG", "eng"),
        psm=psm,
    )
    document = pdfium.PdfDocument(str(pdf_path))
    pages: list[dict[str, Any]] = []
    export_tables: list[tuple[int, list[Any]]] = []

    try:
        for page_index in range(len(document)):
            attempts: list[dict[str, Any]] = []
            best: dict[str, Any] | None = None
            best_png: bytes | None = None
            best_config: dict[str, Any] | None = None

            for dpi in DPI_TIERS:
                try:
                    png_bytes, width, height = _render_page_png(document, page_index, dpi)
                except Exception as exc:
                    attempts.append(
                        {
                            "dpi": dpi,
                            "stage": "render",
                            "error": f"{type(exc).__name__}: {exc}"[:1200],
                        }
                    )
                    continue

                tier_found_useful = False
                for config in CONFIGS:
                    try:
                        tables = _extract_image_tables(
                            png_bytes,
                            config,
                            min_confidence=min_confidence,
                            ocr=None,
                        )
                        summary = _summarize_tables(tables, page_index)
                        attempt = {
                            "dpi": dpi,
                            "width": width,
                            "height": height,
                            **config,
                            **summary,
                        }
                        attempts.append(attempt)
                        print(
                            f"{pdf_path.name} page={page_index + 1} dpi={dpi} {config['id']}: "
                            f"tables={summary['table_count']} useful={summary['useful_tables']} "
                            f"cells={summary['cell_count']} structural={summary['structural_score']}",
                            flush=True,
                        )
                        if best is None or int(summary["structural_score"]) > int(best["structural_score"]):
                            best = attempt
                            best_png = png_bytes
                            best_config = config
                        if summary["useful_tables"] > 0:
                            tier_found_useful = True
                    except Exception as exc:
                        attempts.append(
                            {
                                "dpi": dpi,
                                "width": width,
                                "height": height,
                                **config,
                                "stage": "detect",
                                "error": f"{type(exc).__name__}: {exc}"[:1200],
                            }
                        )
                        print(
                            f"{pdf_path.name} page={page_index + 1} dpi={dpi} {config['id']} ERROR "
                            f"{type(exc).__name__}: {exc}",
                            flush=True,
                        )

                # Prefer the highest bounded resolution that produces a plausible
                # lattice. Lower tiers are only fallbacks for pathological/noisy scans.
                if tier_found_useful:
                    break

            page_result: dict[str, Any] = {
                "page_index": page_index,
                "attempts": attempts,
            }

            if best is None or best_png is None or best_config is None:
                page_result["error"] = "No table-detection configuration completed"
                pages.append(page_result)
                continue

            page_result["selected"] = {
                key: best[key]
                for key in (
                    "dpi",
                    "width",
                    "height",
                    "id",
                    "implicit_rows",
                    "implicit_columns",
                    "borderless_tables",
                    "table_count",
                    "useful_tables",
                    "cell_count",
                    "structural_score",
                )
            }

            try:
                recognized = _extract_image_tables(
                    best_png,
                    best_config,
                    min_confidence=min_confidence,
                    ocr=ocr,
                )
                recognized_summary = _summarize_tables(recognized, page_index)
                page_result["recognized"] = recognized_summary
                export_tables.append((page_index, recognized))
                print(
                    f"{pdf_path.name} page={page_index + 1} OCR: tables={recognized_summary['table_count']} "
                    f"useful={recognized_summary['useful_tables']} cells={recognized_summary['cell_count']} "
                    f"nonempty={recognized_summary['nonempty_cells']}",
                    flush=True,
                )
            except Exception as exc:
                page_result["ocr_error"] = f"{type(exc).__name__}: {exc}"[:1200]
                print(
                    f"{pdf_path.name} page={page_index + 1} OCR ERROR {type(exc).__name__}: {exc}",
                    flush=True,
                )

            pages.append(page_result)
    finally:
        document.close()

    xlsx_bytes = _write_tables_xlsx(export_tables)
    xlsx_path = output_dir / f"{pdf_path.stem}.img2table.xlsx"
    xlsx_path.write_bytes(xlsx_bytes)

    recognized_summaries = [
        page["recognized"] for page in pages if isinstance(page.get("recognized"), dict)
    ]
    return {
        "file": pdf_path.name,
        "psm": psm,
        "min_confidence": min_confidence,
        "dpi_tiers": list(DPI_TIERS),
        "pages": pages,
        "summary": {
            "pages": len(pages),
            "pages_with_useful_tables": sum(
                1 for summary in recognized_summaries if int(summary["useful_tables"]) > 0
            ),
            "tables": sum(int(summary["table_count"]) for summary in recognized_summaries),
            "useful_tables": sum(int(summary["useful_tables"]) for summary in recognized_summaries),
            "cells": sum(int(summary["cell_count"]) for summary in recognized_summaries),
            "nonempty_cells": sum(int(summary["nonempty_cells"]) for summary in recognized_summaries),
            "detection_errors": sum(
                1
                for page in pages
                for attempt in page["attempts"]
                if "error" in attempt
            ),
        },
        "export": _xlsx_shape(xlsx_bytes),
        "xlsx": xlsx_path.name,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Probe bounded-resolution scan-table extraction with img2table/Tesseract."
    )
    parser.add_argument("--corpus-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--min-confidence", type=int, default=30)
    parser.add_argument("--psm", type=int, default=11)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = []
    for pdf_path in sorted(args.corpus_dir.glob("*.pdf")):
        try:
            cases.append(probe_one(pdf_path, args.output_dir, args.min_confidence, args.psm))
        except Exception as exc:
            cases.append(
                {
                    "file": pdf_path.name,
                    "error": f"{type(exc).__name__}: {exc}"[:2000],
                }
            )
            print(f"CASE ERROR {pdf_path.name}: {type(exc).__name__}: {exc}", flush=True)

    payload = {
        "engine": "img2table",
        "img2table_version": "2.0.0",
        "strategy": "bounded-page-render",
        "ocr": "Tesseract",
        "language": os.getenv("XLSX_SCAN_TESSERACT_LANG", "eng"),
        "cases": cases,
        "summary": {
            "cases": len(cases),
            "cases_with_useful_tables": sum(
                1
                for case in cases
                if int((case.get("summary") or {}).get("useful_tables", 0)) > 0
            ),
            "pages_with_useful_tables": sum(
                int((case.get("summary") or {}).get("pages_with_useful_tables", 0))
                for case in cases
            ),
            "useful_tables": sum(
                int((case.get("summary") or {}).get("useful_tables", 0)) for case in cases
            ),
            "nonempty_cells": sum(
                int((case.get("summary") or {}).get("nonempty_cells", 0)) for case in cases
            ),
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], indent=2), flush=True)

    if not cases or payload["summary"]["cases_with_useful_tables"] == 0:
        raise SystemExit("No useful tables were extracted from the bounded scan corpus")


if __name__ == "__main__":
    main()
