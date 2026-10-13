# SolYan PDF Benchmarking

## Vietnamese OCR

`engines/ocr-service/benchmark.py` measures Character Error Rate (CER) and Word Error Rate (WER) against a JSONL corpus.

### Initial pinned real-scan corpus

SolYan PDF retains the `config=real` subset of `nrl-ai/nom-vn`'s `vn_documents_ocr_v2` evaluation set as the original modern-government regression slice.

- Upstream repo: `nrl-ai/nom-vn`
- Pinned commit: `2c99458ff55d7aa6b8c97398e2f0b1282efbcb73`
- Dataset path: `benchmarks/data/vn_documents_ocr_v2`
- Selection rule: `config=real` and per-record license starts with `Public Domain`
- Samples: 9 single-page Vietnamese government-document scans
- Dataset files are downloaded at benchmark time and are **not vendored** into SolYan PDF.

Fetch that slice:

```bash
python benchmarks/fetch_vietnamese_ocr_real.py --output .cache/vn-ocr-real
```

Its original Tesseract fallback baseline remains versioned in `benchmarks/baselines/vietnamese_real_tesseract_v0.1.json`: average CER **13.47%**, average WER **22.88%**.

### Expanded 59-sample real-scan corpus

The expanded regression corpus adds 50 proofread historical scan pages fetched from Vietnamese Wikisource and their original Wikimedia Commons scan files:

- 25 pages from *Nam Hải dị nhân liệt truyện*
- 25 pages from *Việt Nam phong tục*
- plus the 9 modern public-domain government scans above
- total: **59 real scanned pages/samples**

The Wikisource slice is locked by `benchmarks/corpora/vietnamese_real_wikisource_v1.json`.

For each historical source the manifest records:

- the exact Commons PDF download/source URL;
- a SHA-256 of the complete source PDF;
- an exact Wikisource revision ID for every selected page;
- a minimum ProofreadPage quality level of 3;
- the scan-page number used when rendering the PDF page.

The scan files are declared **Public Domain** on Wikimedia Commons. Human/proofread transcriptions are fetched at benchmark time from the exact pinned Vietnamese Wikisource revisions under **CC BY-SA 4.0**. Those transcriptions and generated page images are not committed into the Apache-2.0 SolYan PDF source tree. Runtime fetch output includes `ATTRIBUTION.json` with the source/revision references.

Fetch and render the 50 pinned pages:

```bash
python benchmarks/fetch_vietnamese_ocr_wikisource.py \
  --manifest benchmarks/corpora/vietnamese_real_wikisource_v1.json \
  --output .cache/vn-ocr-wikisource
```

The fetcher verifies the complete PDF SHA-256 before rendering, validates that each pinned revision still belongs to the expected `Trang:` page, requires ProofreadPage quality >= 3, and renders the exact scan sequence page with PDFium.

### Expanded baseline measured in CI — Tesseract fallback

GitHub Actions run `38256543924` exercised all **59** images through the actual SolYan `/ocr/text` endpoint with PaddleOCR unavailable, forcing the production Tesseract fallback path.

Environment:

- Ubuntu 24.04 runner
- Tesseract `5.3.4-1build5`
- `vie+eng` language packs `1:4.1.0-2`
- Wikisource scan render scale: 2.0
- Normalization: Unicode NFC, lowercase, runs of whitespace collapsed
- Aggregation: macro-average of per-sample CER/WER

Measured result:

| Slice | Samples | Average CER | Average WER |
|---|---:|---:|---:|
| Existing modern public-domain documents | 9 | **13.47%** | **22.88%** |
| *Nam Hải dị nhân liệt truyện* | 25 | **9.63%** | **27.18%** |
| *Việt Nam phong tục* | 25 | **7.74%** | **16.93%** |
| **Combined** | **59** | **9.41%** | **22.18%** |

The exact aggregate/source values, corpus provenance and regression budget are versioned in `benchmarks/baselines/vietnamese_real_expanded_tesseract_v0.2.json`. Per-sample measurements are retained as a CI artifact for diagnostic use.

### Regression policy

`.github/workflows/ocr-real-expanded-ci.yml` reconstructs the full 59-sample corpus from pinned sources and re-runs it through the production fallback endpoint.

The gate requires:

- exactly 59 samples and the expected source counts (9 / 25 / 25);
- Tesseract fallback selected for every sample;
- non-empty OCR output for every page;
- overall and per-source CER/WER no worse than the committed measured baseline plus an absolute drift budget of `0.08` CER and `0.18` WER.

The drift budget is intentionally a **regression guard**, not a quality target. It is loose enough for ordinary runner/Tesseract variation while detecting catastrophic OCR, page-mapping, source or language-pack regressions.

The 59-sample set is materially broader than the initial 9-page baseline, but it still must not be presented as universal Vietnamese OCR accuracy. Future expansion should add more scan qualities, forms/tables, publishers, typefaces and document eras.

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

## PDF → Office fidelity and editability

`benchmarks/pdf_to_office.py` measures the production `auto` path with a real round trip:

1. PDF → DOCX/PPTX uses LibreOffice PDF import first, with pinned Bloom as a best-effort fallback.
2. PDF → XLSX uses pinned Bloom first and PP-StructureV3 only when Bloom returns its exact no-logical-table placeholder.
3. The converted Office document is converted back to PDF through SolYan's LibreOffice service.
4. Original and round-trip PDFs are rendered with PDFium.
5. Per-page similarity, page-count preservation and geometry mismatches are measured.
6. DOCX/PPTX packages are also inspected for native OOXML text nodes/characters so a page-image-only result cannot be mistaken for editable conversion.
7. XLSX diagnostics inspect workbook/sheet structure; the real scanned-table release gate additionally checks PP-Structure engine selection, non-empty cells, source-page preservation, orientation and expected raster-page fallback.

Install dependencies:

```bash
pip install -r benchmarks/requirements.txt
```

Example:

```bash
python benchmarks/pdf_to_office.py samples/report.pdf \
  --target docx \
  --mode auto \
  --api http://localhost:8000 \
  --save-dir benchmark-output/docx
```

Available benchmark modes are `auto`, `bloom` and `libreoffice`. `auto` is the release path; forced modes exist for diagnostics and A/B measurement.

### Measured routing baselines

The 2026-10-13 A/B run used the same pinned 6-case / 41-page public DOCX/PPTX slice for both engines:

| Route | Overall | DOCX | PPTX | Editable cases |
|---|---:|---:|---:|---:|
| LibreOffice PDF import | **96.44%** | **97.46%** | **95.42%** | **6/6** |
| Pinned Bloom | **84.56%** | **89.51%** | **79.60%** | **6/6** |

That evidence is why production `auto` now prefers LibreOffice for DOCX/PPTX. The post-routing 18-case controlled corpus measured **97.78%** overall: DOCX **96.40%**, PPTX **98.76%**, XLSX **98.17%**, with zero page-count/unmatched/geometry mismatches and editable native text in all 12 DOCX/PPTX cases.

### V1 release corpus and policy

`benchmarks/corpora/pdf_to_office_release_v1.json` is the versioned acceptance policy. It binds two existing, independently reproducible corpus manifests instead of copying their source definitions:

- `pdf_to_office_synthetic_v1.json`: 18 controlled layout cases, 6 per target;
- `pdf_to_office_real_diagnostic_v1.json`: 9 pinned public real-world cases / 50 pages with source provenance and SHA-256 verification.

Together the V1 release gate covers **27 cases / 68 source pages**. The public real slice includes ordinary documents, multi-column text, image-heavy documents, scanned handwritten/mixed/wide tables and three presentation styles. The controlled slice adds forms, typography, header/footer, financial/invoice/schedule/matrix tables, charts, cards and timelines.

The release policy is intentionally stricter than a smoke test but leaves a small renderer/runtime margin below the measured baselines:

| Scope | Target | Minimum average | Minimum case | Additional gate |
|---|---|---:|---:|---|
| Synthetic | DOCX | 94% | 92% | editable text 6/6 |
| Synthetic | PPTX | 96% | 94% | editable text 6/6 |
| Synthetic | XLSX | 96% | 94% | Bloom route, no page/geometry loss |
| Public real | DOCX | 95% | 93% | editable text 3/3 |
| Public real | PPTX | 93% | 90% | editable text 3/3 |
| Public real | XLSX | semantic/page gate | — | PP-StructureV3 fallback, 3 sheets/case, non-empty cells, 9/9 round-trip pages, orientation preserved, expected raster fallback only |

Both visual scopes require zero page-count, unmatched-page and geometry mismatches. The real XLSX gate intentionally uses structural/page-preservation criteria rather than a pixel threshold because its purpose is editable table extraction while preserving source pages that OCR cannot reliably recognize.

`benchmarks/validate_pdf_to_office_release.py` is the single validator for these thresholds. CI runs the synthetic and public-real release gates independently and retains reports/logs as artifacts.

## Release benchmark rule

Do not publish claims such as “same quality as Adobe/iLovePDF” from these measurements. Passing V1 means the pinned 27-case / 68-page release corpus meets SolYan's fixed fidelity, editability and page-preservation thresholds in the tested environment. It is a regression/release gate, not a claim of universal fidelity for every PDF.
