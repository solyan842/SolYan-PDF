from __future__ import annotations

import argparse
import json
import os
import shutil
import zipfile
from pathlib import Path
from typing import Any


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if hasattr(value, "tolist"):
        return json_safe(value.tolist())
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if isinstance(value, Path):
        return str(value)
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def result_json(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", None)
    if callable(payload):
        payload = payload()
    if payload is None:
        payload = getattr(result, "res", None)
    if payload is None:
        payload = {"result": str(result)}
    safe = json_safe(payload)
    return safe if isinstance(safe, dict) else {"result": safe}


def count_table_markers(value: Any) -> int:
    count = 0
    if isinstance(value, dict):
        lowered = {str(k).lower(): v for k, v in value.items()}
        for key in ("label", "type", "block_label", "layout_type"):
            candidate = lowered.get(key)
            if isinstance(candidate, str) and candidate.lower() == "table":
                count += 1
                break
        for child in value.values():
            count += count_table_markers(child)
    elif isinstance(value, list):
        for child in value:
            count += count_table_markers(child)
    return count


def xlsx_shape(path: Path) -> dict[str, Any]:
    try:
        with zipfile.ZipFile(path) as archive:
            sheets = sorted(
                name
                for name in archive.namelist()
                if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
            )
            shared_strings = "xl/sharedStrings.xml" in archive.namelist()
            return {
                "bytes": path.stat().st_size,
                "worksheets": len(sheets),
                "worksheet_files": sheets,
                "shared_strings": shared_strings,
            }
    except Exception as exc:
        return {"bytes": path.stat().st_size if path.exists() else 0, "error": f"{type(exc).__name__}: {exc}"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe PP-StructureV3 native XLSX export on scanned PDF table cases.")
    parser.add_argument("--corpus-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--lang", default=os.getenv("PPSTRUCTURE_LANG", "en"))
    args = parser.parse_args()

    from paddleocr import PPStructureV3

    args.output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Initializing PPStructureV3 lang={args.lang}", flush=True)
    pipeline = PPStructureV3(
        lang=args.lang,
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        engine="paddle",
    )

    cases: list[dict[str, Any]] = []
    for pdf_path in sorted(args.corpus_dir.glob("*.pdf")):
        case_dir = args.output_dir / pdf_path.stem
        if case_dir.exists():
            shutil.rmtree(case_dir)
        case_dir.mkdir(parents=True)
        print(f"PREDICT {pdf_path.name}", flush=True)
        try:
            results = list(pipeline.predict(input=str(pdf_path)))
        except Exception as exc:
            cases.append({"file": pdf_path.name, "predict_error": f"{type(exc).__name__}: {exc}"[:2000]})
            print(f"PREDICT ERROR {pdf_path.name}: {type(exc).__name__}: {exc}", flush=True)
            continue

        page_results: list[dict[str, Any]] = []
        for page_index, result in enumerate(results, start=1):
            payload = result_json(result)
            before = set(case_dir.rglob("*.xlsx"))
            error = None
            saver = getattr(result, "save_to_xlsx", None)
            if callable(saver):
                try:
                    saver(save_path=str(case_dir / f"page_{page_index}.xlsx"))
                except Exception as exc:
                    error = f"{type(exc).__name__}: {exc}"[:2000]
            else:
                error = "Result has no save_to_xlsx method"
            after = set(case_dir.rglob("*.xlsx"))
            created = sorted(after - before)
            page_results.append(
                {
                    "page": page_index,
                    "table_markers": count_table_markers(payload),
                    "xlsx_error": error,
                    "xlsx_files": [
                        {
                            "path": str(path.relative_to(args.output_dir)),
                            **xlsx_shape(path),
                        }
                        for path in created
                    ],
                    "payload": payload,
                }
            )
            print(
                f"{pdf_path.name} page={page_index}: table_markers={page_results[-1]['table_markers']} "
                f"xlsx_files={len(created)} error={error or 'none'}",
                flush=True,
            )

        all_xlsx = sorted(case_dir.rglob("*.xlsx"))
        cases.append(
            {
                "file": pdf_path.name,
                "pages": len(page_results),
                "page_results": page_results,
                "summary": {
                    "table_markers": sum(item["table_markers"] for item in page_results),
                    "xlsx_files": len(all_xlsx),
                    "xlsx_bytes": sum(path.stat().st_size for path in all_xlsx),
                    "pages_with_xlsx": sum(1 for item in page_results if item["xlsx_files"]),
                    "xlsx_errors": sum(1 for item in page_results if item["xlsx_error"]),
                },
            }
        )

    summary = {
        "cases": len(cases),
        "cases_with_xlsx": sum(1 for case in cases if int((case.get("summary") or {}).get("xlsx_files", 0)) > 0),
        "pages_with_xlsx": sum(int((case.get("summary") or {}).get("pages_with_xlsx", 0)) for case in cases),
        "table_markers": sum(int((case.get("summary") or {}).get("table_markers", 0)) for case in cases),
        "xlsx_files": sum(int((case.get("summary") or {}).get("xlsx_files", 0)) for case in cases),
        "xlsx_bytes": sum(int((case.get("summary") or {}).get("xlsx_bytes", 0)) for case in cases),
    }
    payload = {
        "engine": "PP-StructureV3",
        "paddleocr_version": "3.7.0",
        "language": args.lang,
        "cases": cases,
        "summary": summary,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)

    if summary["cases_with_xlsx"] == 0:
        raise SystemExit("PP-StructureV3 produced no XLSX output for the scanned table corpus")


if __name__ == "__main__":
    main()
