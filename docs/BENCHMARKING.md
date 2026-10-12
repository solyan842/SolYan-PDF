# SolYan PDF Benchmarking

## Vietnamese OCR

`engines/ocr-service/benchmark.py` measures Character Error Rate (CER) and Word Error Rate (WER) against a local JSONL corpus.

Example corpus `corpus.jsonl`:

```jsonl
{"file":"scan-01.png","expected":"Cộng hòa Xã hội Chủ nghĩa Việt Nam"}
{"file":"invoice-02.pdf","expected":"Tổng cộng: 1.250.000 đồng"}
```

Run:

```bash
python engines/ocr-service/benchmark.py corpus.jsonl --url http://localhost:8010/ocr/text
```

The report records engine selection and whether Tesseract fallback was used. Real quality baselines require a representative Vietnamese corpus; the repository intentionally does not fabricate benchmark scores without such a corpus.

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
