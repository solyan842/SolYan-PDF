# SolYan PDF Benchmarking

## Vietnamese OCR

`engines/ocr-service/benchmark.py` measures Character Error Rate (CER) and Word Error Rate (WER) against a JSONL corpus.

### Pinned real-scan corpus

SolYan PDF now uses the `config=real` subset of `nrl-ai/nom-vn`'s `vn_documents_ocr_v2` evaluation set for an external real-world regression baseline.

- Upstream repo: `nrl-ai/nom-vn`
- Pinned commit: `2c99458ff55d7aa6b8c97398e2f0b1282efbcb73`
- Dataset path: `benchmarks/data/vn_documents_ocr_v2`
- Selection rule: `config=real` and per-record license starts with `Public Domain`
- Samples: 9 single-page Vietnamese government-document scans
- Dataset files are downloaded at benchmark time and are **not vendored** into SolYan PDF.

Fetch the pinned corpus:

```bash
python benchmarks/fetch_vietnamese_ocr_real.py --output .cache/vn-ocr-real
```

Then, with the OCR service running:

```bash
python engines/ocr-service/benchmark.py .cache/vn-ocr-real/corpus.jsonl --url http://localhost:8010/ocr/text
```

### Baseline measured in CI — Tesseract fallback

GitHub Actions run `38212926920` exercised all 9 images through the actual `/ocr/text` endpoint with PaddleOCR deliberately unavailable, therefore forcing SolYan's production fallback path.

Environment:

- Ubuntu 24.04 runner
- Tesseract `5.3.4-1build5`
- `vie+eng` language packs `1:4.1.0-2`
- Normalization: Unicode NFC, lowercase, runs of whitespace collapsed
- Aggregation: macro-average of per-document CER/WER

Measured result:

| Metric | Baseline |
|---|---:|
| Samples | 9 |
| Average CER | **13.47%** |
| Average WER | **22.88%** |
| Best document CER | **9.57%** |
| Worst document CER | **21.85%** |

Exact per-document values are versioned in `benchmarks/baselines/vietnamese_real_tesseract_v0.1.json`.

The CI regression gate is intentionally looser (`CER < 40%`, `WER < 70%`) so ordinary distro/engine variation does not break builds while catastrophic Vietnamese OCR regressions are still caught.

Nine real scans are enough for a reproducible initial release/regression baseline, but not enough for broad quality claims. The next corpus expansion should target at least 50–100 diverse real pages across issuers, scan qualities, tables/forms and document dates.

### Generic corpus format

Example local `corpus.jsonl`:

```jsonl
{"file":"scan-01.png","expected":"Cộng hòa Xã hội Chủ nghĩa Việt Nam"}
{"file":"invoice-02.pdf","expected":"Tổng cộng: 1.250.000 đồng"}
```

Run:

```bash
python engines/ocr-service/benchmark.py corpus.jsonl --url http://localhost:8010/ocr/text
```

The report records engine selection and whether Tesseract fallback was used.

## PDF → Office fidelity

`benchmarks/pdf_to_office.py` performs a real round trip:

1. PDF → DOCX/XLSX/PPTX through the experimental Bloom adapter.
2. Converted Office document → PDF through SolYan's LibreOffice service.
3. Original PDF and round-trip PDF are rendered with PDFium.
4. Per-page and average visual similarity are calculated.

Install dependencies:

```bash
pip install -r benchmarks/requirements.txt
```

Example:

```bash
python benchmarks/pdf_to_office.py samples/report.pdf --target docx --api http://localhost:8000 --save-dir benchmark-output/docx
```

Run the same source corpus for `docx`, `xlsx`, and `pptx`. Keep the feature labelled **Experimental** until representative documents meet an agreed fidelity threshold.

## Release benchmark rule

Do not publish claims such as “same quality as Adobe/iLovePDF” from synthetic smoke tests. Release-quality claims must be based on a versioned corpus that covers Vietnamese text, mixed fonts, tables, scanned pages, forms, charts, images, multi-column layouts and Office-origin PDFs.
