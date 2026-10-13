from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def _fail(errors: list[str], message: str) -> None:
    errors.append(message)


def _validate_common(report: dict, policy: dict, errors: list[str]) -> None:
    summary = report.get("summary", {})
    results = report.get("results", [])
    if int(summary.get("cases", -1)) != int(policy["expected_cases"]):
        _fail(errors, f"cases: {summary.get('cases')} != {policy['expected_cases']}")

    source_pages = sum(int(item.get("source_pages", 0)) for item in results)
    if source_pages != int(policy["expected_source_pages"]):
        _fail(errors, f"source_pages: {source_pages} != {policy['expected_source_pages']}")

    if policy.get("require_zero_page_count_mismatches") and int(summary.get("page_count_mismatches", -1)) != 0:
        _fail(errors, f"page_count_mismatches: {summary.get('page_count_mismatches')}")
    if policy.get("require_zero_unmatched_pages") and int(summary.get("unmatched_pages", -1)) != 0:
        _fail(errors, f"unmatched_pages: {summary.get('unmatched_pages')}")
    if policy.get("require_zero_geometry_mismatches") and int(summary.get("geometry_mismatches", -1)) != 0:
        _fail(errors, f"geometry_mismatches: {summary.get('geometry_mismatches')}")

    expected_engines = policy.get("engines")
    if expected_engines is not None:
        actual_engines = Counter(str(item.get("conversion_engine", "unknown")) for item in results)
        if dict(sorted(actual_engines.items())) != dict(sorted(expected_engines.items())):
            _fail(errors, f"engines: {dict(actual_engines)} != {expected_engines}")

    for target, target_policy in policy.get("targets", {}).items():
        items = [item for item in results if item.get("target") == target]
        target_summary = summary.get("targets", {}).get(target, {})
        expected_cases = int(target_policy["expected_cases"])
        if len(items) != expected_cases:
            _fail(errors, f"{target}.cases: {len(items)} != {expected_cases}")
            continue

        average = float(target_summary.get("average_similarity", -1.0))
        minimum_average = float(target_policy["minimum_average_similarity"])
        if average < minimum_average:
            _fail(errors, f"{target}.average_similarity: {average:.4f} < {minimum_average:.4f}")

        minimum_case = min(float(item.get("average_similarity", -1.0)) for item in items)
        required_minimum_case = float(target_policy["minimum_case_similarity"])
        if minimum_case < required_minimum_case:
            _fail(errors, f"{target}.minimum_case_similarity: {minimum_case:.4f} < {required_minimum_case:.4f}")

        required_editable = target_policy.get("require_editable_text_cases")
        if required_editable is not None:
            editable = sum(
                1
                for item in items
                if bool(item.get("ooxml_diagnostics", {}).get("editable_text_present", False))
            )
            if editable != int(required_editable):
                _fail(errors, f"{target}.editable_text_cases: {editable} != {required_editable}")


def _validate_real_xlsx(report: dict, policy: dict, errors: list[str]) -> None:
    results = report.get("results", [])
    if len(results) != int(policy["expected_cases"]):
        _fail(errors, f"real_xlsx.cases: {len(results)} != {policy['expected_cases']}")
        return

    source_pages = sum(int(item.get("source_pages", 0)) for item in results)
    roundtrip_pages = sum(int(item.get("roundtrip_pages", 0)) for item in results)
    unmatched_pages = sum(int(item.get("unmatched_pages", 0)) for item in results)

    if source_pages != int(policy["expected_source_pages"]):
        _fail(errors, f"real_xlsx.source_pages: {source_pages} != {policy['expected_source_pages']}")
    if roundtrip_pages != int(policy["expected_roundtrip_pages"]):
        _fail(errors, f"real_xlsx.roundtrip_pages: {roundtrip_pages} != {policy['expected_roundtrip_pages']}")
    if policy.get("require_zero_unmatched_pages") and unmatched_pages != 0:
        _fail(errors, f"real_xlsx.unmatched_pages: {unmatched_pages}")

    expected_engine = policy["expected_conversion_engine"]
    expected_ocr_engine = policy["expected_ocr_engine"]
    expected_sheets = int(policy["expected_sheets_per_case"])
    expected_raster = policy["expected_raster_image_sheets"]

    ids = {str(item.get("id")) for item in results}
    if ids != set(expected_raster):
        _fail(errors, f"real_xlsx.ids: {sorted(ids)} != {sorted(expected_raster)}")

    for item in results:
        case_id = str(item.get("id"))
        if item.get("conversion_engine") != expected_engine:
            _fail(errors, f"{case_id}.conversion_engine: {item.get('conversion_engine')} != {expected_engine}")
        if item.get("ocr_engine") != expected_ocr_engine:
            _fail(errors, f"{case_id}.ocr_engine: {item.get('ocr_engine')} != {expected_ocr_engine}")
        if int(item.get("sheet_count", -1)) != expected_sheets:
            _fail(errors, f"{case_id}.sheet_count: {item.get('sheet_count')} != {expected_sheets}")
        if policy.get("require_nonempty_cells") and int(item.get("nonempty_cells", 0)) <= 0:
            _fail(errors, f"{case_id}.nonempty_cells must be > 0")
        if policy.get("require_orientation_match") and not bool(item.get("orientation_match", False)):
            _fail(errors, f"{case_id}.orientation_match is false")
        actual_raster = list(item.get("raster_image_sheets", []))
        if actual_raster != list(expected_raster.get(case_id, [])):
            _fail(errors, f"{case_id}.raster_image_sheets: {actual_raster} != {expected_raster.get(case_id, [])}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a SolYan PDF-to-Office V1 release-gate report.")
    parser.add_argument("--policy", type=Path, required=True)
    parser.add_argument("--scope", choices=["synthetic", "real_text", "real_xlsx"], required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    release_policy = json.loads(args.policy.read_text(encoding="utf-8"))
    if release_policy.get("release_gate") is not True:
        raise SystemExit("Release policy must set release_gate=true")
    policy = release_policy["scopes"][args.scope]
    report = json.loads(args.report.read_text(encoding="utf-8"))

    errors: list[str] = []
    if args.scope == "real_xlsx":
        _validate_real_xlsx(report, policy, errors)
    else:
        _validate_common(report, policy, errors)

    result = {
        "policy_version": release_policy["version"],
        "scope": args.scope,
        "passed": not errors,
        "errors": errors,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
