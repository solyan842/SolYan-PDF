# Benchmark tooling

## Vietnamese OCR real-scan corpora

SolYan PDF keeps benchmark source material outside the repository and reconstructs it from pinned, licensed sources.

### Modern public-domain slice

`fetch_vietnamese_ocr_real.py` fetches the 9 `config=real` public-domain records from the exact pinned `nrl-ai/nom-vn` commit used by the original v0.1 baseline.

```bash
python benchmarks/fetch_vietnamese_ocr_real.py --output .cache/vn-ocr-real
```

### Proofread Wikisource slice

`fetch_vietnamese_ocr_wikisource.py` reconstructs 50 additional real scan pages from two Vietnamese Wikisource ProofreadPage works. The manifest `corpora/vietnamese_real_wikisource_v1.json` pins:

- exact Commons source PDFs by SHA-256;
- 25 scan pages from *Nam Hải dị nhân liệt truyện*;
- 25 scan pages from *Việt Nam phong tục*;
- exact Wikisource revision IDs for every page;
- minimum proofread quality level 3.

```bash
python benchmarks/fetch_vietnamese_ocr_wikisource.py \
  --manifest benchmarks/corpora/vietnamese_real_wikisource_v1.json \
  --output .cache/vn-ocr-wikisource
```

The scans are Public Domain. Exact proofread transcriptions are fetched at runtime under CC BY-SA 4.0 and are not vendored into the Apache-2.0 SolYan PDF tree. Generated output includes `ATTRIBUTION.json`.

Together with the 9 modern-document samples, this forms the **59-sample expanded real-scan regression corpus**. Its measured Tesseract fallback baseline is versioned in `baselines/vietnamese_real_expanded_tesseract_v0.2.json`; full methodology is documented in `docs/BENCHMARKING.md`.

## PDF -> Office controlled corpus

`pdf_to_office_synthetic_v1` is a versioned, synthetic benchmark corpus for the experimental PDF -> DOCX/XLSX/PPTX adapter.

It contains 18 deterministic cases:

- 6 DOCX-oriented document layouts
- 6 XLSX-oriented table/spreadsheet layouts
- 6 PPTX-oriented slide layouts

The corpus exists to make development comparisons repeatable. It is **not** a substitute for representative real-world release corpora and must not be used to make broad fidelity claims.

### Generate the corpus

```bash
python benchmarks/generate_pdf_to_office_corpus.py \
  --manifest benchmarks/corpora/pdf_to_office_synthetic_v1.json \
  --output-dir ./tmp/pdf-to-office-corpus
```

### Run against a deployed SolYan PDF API

The API must have the experimental Bloom adapter configured and the Office service available.

```bash
PYTHONPATH=benchmarks python benchmarks/run_pdf_to_office_corpus.py \
  --manifest benchmarks/corpora/pdf_to_office_synthetic_v1.json \
  --corpus-dir ./tmp/pdf-to-office-corpus \
  --api http://localhost:8000 \
  --output ./tmp/pdf-to-office-report.json
```

The runner records per-case round-trip similarity, page counts and timings, plus aggregate mean/minimum scores per target.

### Optional acceptance thresholds

Thresholds are deliberately **not** embedded in the synthetic corpus. When a release policy is agreed, pass a separate JSON file:

```json
{
  "docx": 90,
  "xlsx": 85,
  "pptx": 88
}
```

Then run with `--thresholds path/to/thresholds.json`. A target whose aggregate average similarity falls below its configured threshold causes exit code 2.

Any threshold values above are examples only, not current SolYan PDF release criteria.

## Real-world corpus rule

Real-world PDF -> Office release benchmarking remains a separate roadmap item. Any such corpus must be versioned, redistributable or fetchable with clear provenance/license, and diverse enough to represent the intended production workload.
