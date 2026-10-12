from __future__ import annotations

import argparse
import io
import json
import os
import zipfile
from pathlib import Path
from typing import Any

from img2table.document import PDF
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


def _cell_value(cell: Any) -> str:
    value = getattr(cell, "value", "")
    if value is None:
        return ""
    return str(value).strip()


def _summarize_tables(extracted: Any) -> dict[str, Any]:
    page_summaries: list[dict[str, Any]] = []
    table_count = 0
    cell_count = 0
    nonempty_cells = 0
    useful_tables = 0

    for page_index, tables in extracted.items():
        summaries: list[dict[str, Any]] = []
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
            if row_count >= 2 and col_count >= 2 and nonempty >= 2:
                useful_tables += 1

        page_summaries.append(
            {
                "page_index": int(page_index),
                "tables": summaries,
            }
        )

    # Favor actual OCR-populated table cells, then structural coverage. Tiny
    # accidental boxes should not beat a dense table simply by count.
    score = nonempty_cells * 20 + cell_count * 2 + useful_tables * 100 + table_count
    return {
        "pages": page_summaries,
        "table_count": table_count,
        "useful_tables": useful_tables,
        "cell_count": cell_count,
        "nonempty_cells": nonempty_cells,
        "score": score,
    }


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


def probe_one(pdf_path: Path, output_dir: Path, min_confidence: int, psm: int) -> dict[str, Any]:
    ocr = TesseractOCR(
        n_threads=1,
        lang=os.getenv("XLSX_SCAN_TESSERACT_LANG", "eng"),
        psm=psm,
    )
    configs: list[dict[str, Any]] = []

    for config in CONFIGS:
        doc = PDF(src=pdf_path, detect_rotation=True, pdf_text_extraction=True)
        extracted = doc.extract_tables(
            ocr=ocr,
            implicit_rows=config["implicit_rows"],
            implicit_columns=config["implicit_columns"],
            borderless_tables=config["borderless_tables"],
            min_confidence=min_confidence,
            max_workers=1,
        )
        summary = _summarize_tables(extracted)
        summary.update(config)
        configs.append(summary)
        print(
            f"{pdf_path.name} {config['id']}: tables={summary['table_count']} "
            f"useful={summary['useful_tables']} cells={summary['cell_count']} "
            f"nonempty={summary['nonempty_cells']} score={summary['score']}",
            flush=True,
        )

    best = max(configs, key=lambda item: int(item["score"]))
    best_config = next(item for item in CONFIGS if item["id"] == best["id"])

    export_doc = PDF(src=pdf_path, detect_rotation=True, pdf_text_extraction=True)
    buffer = io.BytesIO()
    export_doc.to_xlsx(
        dest=buffer,
        ocr=ocr,
        implicit_rows=best_config["implicit_rows"],
        implicit_columns=best_config["implicit_columns"],
        borderless_tables=best_config["borderless_tables"],
        min_confidence=min_confidence,
        max_workers=1,
    )
    xlsx_bytes = buffer.getvalue()
    xlsx_path = output_dir / f"{pdf_path.stem}.img2table.xlsx"
    xlsx_path.write_bytes(xlsx_bytes)

    return {
        "file": pdf_path.name,
        "psm": psm,
        "min_confidence": min_confidence,
        "configs": configs,
        "best_config": best["id"],
        "best_score": best["score"],
        "export": _xlsx_shape(xlsx_bytes),
        "xlsx": xlsx_path.name,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe scan-heavy PDF table extraction with pinned img2table/Tesseract.")
    parser.add_argument("--corpus-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--min-confidence", type=int, default=30)
    parser.add_argument("--psm", type=int, default=11)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = []
    for pdf_path in sorted(args.corpus_dir.glob("*.pdf")):
        cases.append(probe_one(pdf_path, args.output_dir, args.min_confidence, args.psm))

    payload = {
        "engine": "img2table",
        "img2table_version": "2.0.0",
        "ocr": "Tesseract",
        "language": os.getenv("XLSX_SCAN_TESSERACT_LANG", "eng"),
        "cases": cases,
        "summary": {
            "cases": len(cases),
            "cases_with_useful_tables": sum(
                1
                for case in cases
                if max((cfg["useful_tables"] for cfg in case["configs"]), default=0) > 0
            ),
            "best_nonempty_cells": sum(
                max((cfg["nonempty_cells"] for cfg in case["configs"]), default=0)
                for case in cases
            ),
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], indent=2), flush=True)

    if not cases or payload["summary"]["cases_with_useful_tables"] == 0:
        raise SystemExit("No useful tables were extracted from the scan corpus")


if __name__ == "__main__":
    main()
