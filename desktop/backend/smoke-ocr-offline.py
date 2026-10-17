from __future__ import annotations

import argparse
import json
from pathlib import Path

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke SolYan OCR text endpoint offline")
    parser.add_argument("--url", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    image = Path(args.image)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with image.open("rb") as handle, httpx.Client(timeout=900.0, trust_env=False) as client:
        response = client.post(
            args.url,
            files={"file": (image.name, handle, "image/png")},
        )

    response.raise_for_status()
    payload = response.json()
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    assert payload.get("engine") == "PaddleOCR", payload
    assert payload.get("fallback_used") is False, payload
    text = str(payload.get("text") or "")
    assert "SOLYAN" in text.upper(), text
    print(text)


if __name__ == "__main__":
    main()
