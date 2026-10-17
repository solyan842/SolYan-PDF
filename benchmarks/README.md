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

Thresholds are deliberately **not** embedded in the synthetic corpus. For ad-hoc experiments, a separate JSON threshold file can be supplied, for example:

```json
{
  "docx": 90,
  "xlsx": 85,
  "pptx": 88
}
```

Then run with `--thresholds path/to/thresholds.json`. A target whose aggregate average similarity falls below its configured threshold causes exit code 2.

The example values above are not SolYan PDF release criteria. Release acceptance is defined only by the versioned release policy below.

## PDF -> Office V1 release policy

The authoritative V1 policy is `corpora/pdf_to_office_release_v1.json` and is enforced by `validate_pdf_to_office_release.py`.

The locked release corpus contains **27 cases / 68 source pages**:

- 18 deterministic synthetic cases / 18 pages;
- 9 pinned real-world cases / 50 selected pages;
- real text scope: 6 DOCX/PPTX cases / 41 source pages;
- real XLSX scope: 3 cases / 9 source pages, with 9 round-trip pages required.

The real corpus is described by `corpora/pdf_to_office_real_diagnostic_v1.json` and is reconstructed by `fetch_pdf_to_office_real_corpus.py` from pinned, verifiable sources rather than vendored binary documents.

Release routing is also part of the contract:

- DOCX/PPTX: LibreOffice first, then Bloom fallback;
- XLSX: Bloom first, then PP-StructureV3 fallback when Bloom reports no logical table.

CI release evidence is produced by the synthetic and real-world PDF-to-Office release-gate workflows. Broad fidelity claims must be based on the complete versioned release policy, not the synthetic corpus alone.
