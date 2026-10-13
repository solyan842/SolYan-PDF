# Changelog

All notable changes to SolYan PDF are documented here.

## [Unreleased]

### PDF -> Office V1 release gate
- Added evidence-based `auto` routing: PDF -> DOCX/PPTX uses LibreOffice PDF import first with pinned Bloom as best-effort fallback; PDF -> XLSX keeps Bloom primary with PP-StructureV3 fallback only when Bloom reports no logical tables.
- Added native OOXML editability diagnostics so DOCX/PPTX routing is judged on editable text as well as rendered round-trip similarity.
- A/B tested Bloom vs LibreOffice on the same pinned 6-case / 41-page public DOCX/PPTX corpus: LibreOffice averaged 96.44% visual similarity vs Bloom 84.56%, with editable native text in all 6 cases.
- Re-ran the controlled 18-case synthetic corpus through final `auto` routing: 97.78% overall, DOCX 96.40%, PPTX 98.76%, XLSX 98.17%, with zero page-count, unmatched-page and geometry mismatches and editable DOCX/PPTX text in 12/12 cases.
- Added permanent versioned `pdf-to-office-release-v1` policy combining 18 synthetic cases with 9 pinned public real-world cases: 27 cases / 68 source pages total.
- Locked target-specific minimum average/case fidelity thresholds, exact routing engines, zero page/geometry loss requirements and DOCX/PPTX editability requirements.
- Promoted the public real-world DOCX/PPTX and scanned-XLSX workflows from diagnostics to hard V1 release gates; all gates pass on the accepted baseline.

### Scanned table to Excel
- Added PP-StructureV3 scanned-table export to `.xlsx`, including multi-page/multi-table workbook merging with worksheet-level style, merge, dimension, hyperlink and comment preservation.
- Added a backend binary proxy for `/ocr/xlsx` with bounded uploads and forwarded download/diagnostic headers.
- Added the OCR web/PWA mode **Bảng scan → Excel (.xlsx)** with direct browser download and page/table metadata.
- Exposed OCR download headers through CORS so the browser can retain the service filename and result metadata.
- Group PP-Structure table workbooks by source page, stack multiple detected tables into the same worksheet and preserve source-derived print orientation/aspect with one-page fit scaling.
- Added a permanent regression covering same-page table grouping, styles, merged cells and print-layout metadata.
- Added a Bloom PDF → XLSX fallback that invokes PP-StructureV3 only when Bloom returns its exact `No logical tables detected in document.` placeholder; normal/digital XLSX conversions remain on Bloom.
- Preserve Bloom's successful placeholder if the OCR fallback is unavailable or cannot export a table, expose the selected XLSX engine in response headers and allow a configurable CPU-friendly OCR fallback timeout.
- Validated the scanned-table path on three pinned public real PDFs (9 source pages): PP-Structure recovered useful workbook content in all three cases and now preserves 9/9 round-trip pages. Pages with no usable recognized cells are retained as raster worksheets rather than being dropped.
- Added regression coverage for cross-workbook OpenPyXL style copying and for the backend XLSX binary proxy.
- Removed completed one-shot PP-Structure/Bloom fallback diagnostic workflows after their artifacts were reviewed.

### Real-world PDF -> Office diagnostics
- Added a pinned public real-world corpus covering 9 PDFs / 50 pages across DOCX, XLSX and PPTX targets, with deterministic source verification and provenance.
- Fixed hard interoperability defects exposed by the corpus, including DOCX XML 1.0 control-character sanitation, PDF metadata BOM decoding and inherited PDF page geometry for PPTX exports.
- Final accepted DOCX/PPTX routing baseline: DOCX 7/7 round-trip pages at 97.46% average visual similarity; PPTX 34/34 pages at 95.42%; zero page-count, unmatched-page and geometry mismatches; editable native text in all 6 public cases.
- The same corpus is now part of the permanent V1 release policy rather than a diagnostic-only benchmark.

### Vietnamese OCR regression coverage
- Expanded the reproducible real-scan Vietnamese OCR corpus from 9 to 59 samples without using synthetic scans.
- Added 25 proofread scan pages from *Nam Hải dị nhân liệt truyện* and 25 from *Việt Nam phong tục*, with exact Wikisource revision pins and SHA-256-pinned Public Domain Commons source PDFs.
- Added runtime attribution for CC BY-SA 4.0 proofread transcriptions; generated benchmark transcriptions/images are not vendored into the Apache-2.0 source tree.
- Established the expanded Tesseract fallback baseline at average CER 9.41% / WER 22.18%.
- Added a source-level regression gate over all 59 real samples with measured drift budgets rather than a synthetic quality threshold.

## [0.1.2] - 2026-10-12

Patch release focused on hardening the experimental PDF -> Office path and making its compatibility gates reproducible and explicit.

### PDF -> Office experimental integration
- Added an exact pinned Bloom canary for DOCX, XLSX and PPTX round trips.
- Added a controlled 18-case synthetic corpus: 6 DOCX, 6 XLSX and 6 PPTX cases.
- Added full end-to-end synthetic validation requiring zero page-count mismatches, zero unmatched pages and zero geometry mismatches across all 18 controlled cases.
- Added conservative XLSX print-layout normalization that derives known paper size/orientation from the source PDF and preserves existing worksheet page setup.
- Added geometry comparison tolerance for sub-percent renderer rounding drift while retaining hard failures for meaningful paper-size/orientation mismatch.
- Added XLSX worksheet diagnostics to expose sheet count, dimensions, row/column geometry and cell previews during benchmark failures.
- Patched the pinned Bloom table candidate detector to avoid false vertical fragmentation when an earlier tall cell extends below the last short cell in a row.
- Rejected sparse borderless heading/metadata groups being misclassified as standalone worksheets while preserving legitimate merged-cell tables.
- Added focused regression tests for both table-fragmentation and sparse-heading false-positive cases.

### Verification status
- Bloom 3-case canary passes on the pinned upstream commit plus SolYan-owned patch.
- Bloom relevant upstream tests, SolYan regressions and TypeScript typecheck pass under Node 22.
- The 18-case controlled synthetic PDF -> Office -> PDF benchmark passes its compatibility gate for DOCX/XLSX/PPTX.

### Known limitations
- PDF -> DOCX/XLSX/PPTX remains labelled **Experimental**. Synthetic compatibility success is not a substitute for representative real-world release corpora or agreed target-specific fidelity thresholds.
- The Vietnamese OCR real-scan corpus is still only 9 documents; broader quality claims remain blocked until 50–100+ diverse verified pages are available.
- PaddlePaddle is source/version locked on its dedicated CPU index but not yet architecture-wide hash-pinned.
- Cloud connectors, multi-party remote signing, AI summarization and PDF translation still require separate product/provider decisions.

## [0.1.1] - 2026-10-12

Patch release focused on reproducibility, dependency integrity, OCR release validation and deployment verification. No user-facing PDF workflow was intentionally changed.

### Security and reproducibility
- Pinned Node/Python multi-architecture base-image digests.
- Locked the complete frontend npm dependency graph with `package-lock.json` and `npm ci`.
- Locked Python transitive dependency graphs for backend, Office, signing, PDF/A and OCR services.
- Added SHA-256 artifact verification for backend, Office, signing, PDF/A and the ordinary PyPI portion of the OCR graph.
- Kept PaddlePaddle isolated on its official CPU package index with an explicit source/version lock.
- Pinned all Python-image Debian package sources to snapshot `20261012T000000Z`.
- Added resolved OS/Python/npm package inventory artifacts for all six runtime images.
- Enforced non-root runtime users and writable runtime homes in image verification.

### OCR verification
- Established a reproducible 9-document public-domain Vietnamese real-scan baseline.
- Recorded Tesseract fallback baseline CER 13.47% / WER 22.88%.
- Added reproducible OCR dependency-graph validation and production image build verification.

### Deployment
- Added runtime healthchecks for all six default services.
- Backend startup now waits for OCR, Office, signing and PDF/A services to become healthy; frontend waits for backend health.
- Deployment CI now validates Compose, builds the full six-image stack, starts it with health waiting, smoke-tests public frontend/backend endpoints and tears down cleanly.

### Known limitations
- PDF -> DOCX/XLSX/PPTX remains experimental until representative release corpora and fidelity thresholds are accepted.
- The Vietnamese OCR real-scan corpus is still only 9 documents; broader quality claims remain blocked until 50–100+ diverse verified pages are available.
- PaddlePaddle is source/version locked on its dedicated CPU index but not yet architecture-wide hash-pinned.
- Cloud connectors, multi-party remote signing, AI summarization and PDF translation still require separate product/provider decisions.

## [0.1.0] - 2026-10-12

Initial public V1 release candidate.

### Added
- Core PDF utilities: merge, split, extract, reorder/remove, rotate, watermark, page numbers, metadata, protect/unlock, repair and compression.
- Browser PDF viewer/editor, AcroForm support and drag-and-drop organizer.
- PaddleOCR/PP-StructureV3 OCR and document intelligence with automatic Vietnamese Tesseract fallback.
- Office -> PDF through LibreOffice, images -> PDF and PDF -> image ZIP.
- Experimental PDF -> DOCX/XLSX/PPTX adapter with fidelity benchmark tooling.
- Text and visual PDF compare.
- PKCS#12 digital signing and PDF/A conversion.
- Local multi-step workflow builder.
- 13 Vietnamese utilities covering text, calculations and Internet/website tools.
- Installable PWA, Docker Compose deployment, security headers and CI smoke tests.
- Vietnamese OCR CER/WER benchmark harness and PDF -> Office visual-fidelity benchmark harness.

### Security
- Production npm dependency audit gate.
- PostCSS security override pinned to 8.5.29.
- Private/loopback network ping blocked by default.
- Proxy-header trust disabled by default.
- Upload limits on heavy service proxies.

### License
- SolYan PDF project source licensed under Apache-2.0.

### Known limitations
- PDF -> DOCX/XLSX/PPTX remains experimental until representative corpus benchmarks are accepted.
- Representative Vietnamese OCR release baseline has not yet been established.
- Cloud connectors, multi-party remote signing, AI summarization and PDF translation require separate provider/product decisions.
