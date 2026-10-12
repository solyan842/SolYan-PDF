from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from pdf_to_office import benchmark_pdf


def _load_thresholds(path: Path | None) -> dict[str, float]:
    if path is None:
        return {}
    raw = json.loads(path.read_text(encoding='utf-8'))
    return {str(key): float(value) for key, value in raw.items()}


def _summary(results: list[dict]) -> dict:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for result in results:
        grouped[result['target']].append(result)

    targets = {}
    for target, items in sorted(grouped.items()):
        similarities = [float(item['average_similarity']) for item in items]
        targets[target] = {
            'cases': len(items),
            'average_similarity': sum(similarities) / max(1, len(similarities)),
            'minimum_similarity': min(similarities) if similarities else 0.0,
            'source_pages': sum(int(item['source_pages']) for item in items),
            'roundtrip_pages': sum(int(item['roundtrip_pages']) for item in items),
            'page_count_mismatches': sum(1 for item in items if not bool(item.get('page_count_match', True))),
            'unmatched_pages': sum(int(item.get('unmatched_pages', 0)) for item in items),
            'geometry_normalized_pages': sum(int(item.get('geometry_normalized_pages', 0)) for item in items),
            'geometry_mismatches': sum(int(item.get('geometry_mismatches', 0)) for item in items),
            'convert_seconds': sum(float(item['convert_seconds']) for item in items),
            'roundtrip_seconds': sum(float(item['roundtrip_seconds']) for item in items),
        }
    all_scores = [float(item['average_similarity']) for item in results]
    return {
        'cases': len(results),
        'average_similarity': sum(all_scores) / max(1, len(all_scores)),
        'minimum_similarity': min(all_scores) if all_scores else 0.0,
        'page_count_mismatches': sum(1 for item in results if not bool(item.get('page_count_match', True))),
        'unmatched_pages': sum(int(item.get('unmatched_pages', 0)) for item in results),
        'geometry_normalized_pages': sum(int(item.get('geometry_normalized_pages', 0)) for item in results),
        'geometry_mismatches': sum(int(item.get('geometry_mismatches', 0)) for item in results),
        'targets': targets,
    }


def _case_metadata(case: dict) -> dict:
    metadata = {
        'id': case['id'],
        'category': case['category'],
    }
    for key in ('title', 'template', 'selected_pages'):
        if key in case:
            metadata[key] = case[key]
    source = case.get('source')
    if isinstance(source, dict):
        metadata['source_provider'] = source.get('provider')
        metadata['source_license'] = source.get('license')
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description='Run the versioned SolYan PDF PDF-to-Office benchmark corpus.')
    parser.add_argument('--manifest', type=Path, default=Path('benchmarks/corpora/pdf_to_office_synthetic_v1.json'))
    parser.add_argument('--corpus-dir', type=Path, required=True)
    parser.add_argument('--api', default='http://localhost:8000')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--thresholds', type=Path, help='Optional JSON object with target minimum average similarity, e.g. {"docx": 90}.')
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    thresholds = _load_thresholds(args.thresholds)
    results = []

    for case in manifest['cases']:
        pdf_path = args.corpus_dir / case['filename']
        source = pdf_path.read_bytes()
        report, _, _ = benchmark_pdf(source, pdf_path.name, case['target'], args.api)
        report.update(_case_metadata(case))
        results.append(report)
        print(
            f"{case['id']}: {report['average_similarity']:.2f}% "
            f"pages={report['source_pages']}->{report['roundtrip_pages']} "
            f"geometry_normalized={report.get('geometry_normalized_pages', 0)} "
            f"geometry_mismatches={report.get('geometry_mismatches', 0)}"
        )

    summary = _summary(results)
    failures = []
    for target, minimum in thresholds.items():
        actual = summary['targets'].get(target, {}).get('average_similarity')
        if actual is None:
            failures.append(f'{target}: no results')
        elif actual < minimum:
            failures.append(f'{target}: {actual:.2f} < {minimum:.2f}')

    payload = {
        'manifest_version': manifest['version'],
        'corpus_kind': manifest.get('corpus_kind', 'controlled-synthetic'),
        'release_gate': bool(manifest.get('release_gate', False)),
        'thresholds': thresholds,
        'summary': summary,
        'results': results,
        'failures': failures,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'summary': summary, 'failures': failures}, ensure_ascii=False, indent=2))

    if failures:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
