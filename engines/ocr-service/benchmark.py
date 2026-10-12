from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import httpx


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).lower()
    text = re.sub(r"\s+", " ", text).strip()
    return text


def distance(a: list[str], b: list[str]) -> int:
    previous = list(range(len(b) + 1))
    for i, left in enumerate(a, start=1):
        current = [i]
        for j, right in enumerate(b, start=1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (left != right)))
        previous = current
    return previous[-1]


def score(expected: str, actual: str) -> tuple[float, float]:
    expected_n = normalize(expected)
    actual_n = normalize(actual)
    expected_chars = list(expected_n)
    actual_chars = list(actual_n)
    expected_words = expected_n.split()
    actual_words = actual_n.split()
    cer = distance(expected_chars, actual_chars) / max(1, len(expected_chars))
    wer = distance(expected_words, actual_words) / max(1, len(expected_words))
    return cer, wer


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Vietnamese OCR with CER/WER.")
    parser.add_argument("corpus", type=Path, help="JSONL: {file, expected}")
    parser.add_argument("--url", default="http://localhost:8010/ocr/text")
    args = parser.parse_args()

    records = [json.loads(line) for line in args.corpus.read_text(encoding="utf-8").splitlines() if line.strip()]
    results = []
    with httpx.Client(timeout=300.0) as client:
        for record in records:
            path = (args.corpus.parent / record["file"]).resolve()
            with path.open("rb") as handle:
                response = client.post(args.url, files={"file": (path.name, handle)})
            response.raise_for_status()
            payload = response.json()
            actual = payload.get("text", "")
            cer, wer = score(record["expected"], actual)
            results.append({"file": record["file"], "engine": payload.get("engine"), "fallback_used": payload.get("fallback_used", False), "cer": cer, "wer": wer})

    avg_cer = sum(item["cer"] for item in results) / max(1, len(results))
    avg_wer = sum(item["wer"] for item in results) / max(1, len(results))
    print(json.dumps({"samples": len(results), "average_cer": avg_cer, "average_wer": avg_wer, "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
