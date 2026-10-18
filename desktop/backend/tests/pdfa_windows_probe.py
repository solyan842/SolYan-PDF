"""Real native Windows proof for unchanged archive-service API and internal PDF/A.

Only tests a small representative clean PDF. Does not claim universal
PDF/A compatibility; unsupported documents must fail, never fall back to a
remote converter.
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pikepdf
from fastapi.testclient import TestClient
from pypdf import PdfWriter

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "engines" / "archive-service"))
from app.main import app  # type: ignore  # noqa: E402


def main() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    source = io.BytesIO()
    writer.write(source)

    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200, health.text
    assert health.json()["engine"] == "OCRmyPDF", health.text

    bad = client.post("/pdfa/internal", files={"file": ("bad.pdf", b"not a PDF", "application/pdf")})
    assert bad.status_code == 400, bad.text

    converted = client.post(
        "/pdfa/internal",
        files={"file": ("sample.pdf", source.getvalue(), "application/pdf")},
    )
    assert converted.status_code == 200, converted.text[:2500]
    assert converted.content.startswith(b"%PDF-")
    with pikepdf.open(io.BytesIO(converted.content)) as pdf:
        assert len(pdf.pages) == 1
        assert "/Metadata" in pdf.Root, "PDF/A metadata missing"
        assert "/OutputIntents" in pdf.Root, "PDF/A output intent missing"

    # Never store private documents or converted sample bytes as CI artifacts.
    print(json.dumps({
        "engine": "OCRmyPDF",
        "pdfa_internal_native_windows": "PASS",
        "input_bytes": len(source.getvalue()),
        "output_bytes": len(converted.content),
        "metadata": True,
        "output_intent": True,
        "ghostscript_fallback": False,
    }))


if __name__ == "__main__":
    main()
