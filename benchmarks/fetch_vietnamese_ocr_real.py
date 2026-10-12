from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

UPSTREAM_REPO = "nrl-ai/nom-vn"
UPSTREAM_COMMIT = "2c99458ff55d7aa6b8c97398e2f0b1282efbcb73"
DATASET_ROOT = "benchmarks/data/vn_documents_ocr_v2"
RAW_ROOT = f"https://raw.githubusercontent.com/{UPSTREAM_REPO}/{UPSTREAM_COMMIT}/{DATASET_ROOT}"


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "SolYan-PDF-benchmark/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch pinned public-domain Vietnamese real-scan OCR corpus.")
    parser.add_argument("--output", type=Path, default=Path(".cache/vn-ocr-real"))
    parser.add_argument("--limit", type=int, default=0, help="0 = all real records")
    args = parser.parse_args()

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    metadata_text = download(f"{RAW_ROOT}/metadata.jsonl").decode("utf-8")
    records = []
    for line in metadata_text.splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        if record.get("config") != "real":
            continue
        if not str(record.get("license", "")).startswith("Public Domain"):
            raise RuntimeError(f"Unexpected license for {record.get('doc_id')}: {record.get('license')}")
        records.append(record)

    records.sort(key=lambda item: item["doc_id"])
    if args.limit > 0:
        records = records[: args.limit]
    if not records:
        raise RuntimeError("No public-domain real OCR records found in pinned upstream metadata")

    corpus_lines = []
    for record in records:
        image_rel = record["image"]
        image_name = Path(image_rel).name
        image_bytes = download(f"{RAW_ROOT}/{image_rel}")
        (output / image_name).write_bytes(image_bytes)
        corpus_lines.append(
            json.dumps(
                {
                    "file": image_name,
                    "expected": record["text"],
                    "doc_id": record["doc_id"],
                    "title": record.get("title"),
                    "source_url": record.get("source_url"),
                    "license": record.get("license"),
                    "upstream_commit": UPSTREAM_COMMIT,
                },
                ensure_ascii=False,
            )
        )

    (output / "corpus.jsonl").write_text("\n".join(corpus_lines) + "\n", encoding="utf-8")
    (output / "SOURCE.txt").write_text(
        "SolYan PDF Vietnamese OCR real-scan benchmark\n"
        f"Upstream: https://github.com/{UPSTREAM_REPO}\n"
        f"Commit: {UPSTREAM_COMMIT}\n"
        f"Dataset path: {DATASET_ROOT}\n"
        "Selection: config=real only; each selected record must declare Public Domain.\n"
        "Corpus files are downloaded for benchmarking and are not vendored into SolYan PDF.\n",
        encoding="utf-8",
    )
    print(f"Fetched {len(records)} public-domain real-scan samples to {output}")


if __name__ == "__main__":
    main()
