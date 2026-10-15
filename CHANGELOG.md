# Changelog

All notable changes to SolYan PDF are documented here.

## [Unreleased]

## [0.1.7] - 2026-10-15

Patch release completing the **V1.4 OSS-first self-contained security, scan-simulation and vector-export pass**.

### V1.4 self-contained tools
- Added Auto Redact Text with literal PDF.js text-layer matching and security-first raster replacement only on pages containing matches.
- Added deterministic Scanner Effect with bounded DPI presets, grayscale/color output, brightness/contrast, seeded noise, blur, paper yellowing, border and skew simulation.
- Added PDF -> PostScript / EPS through the already-shipped Poppler `pdftops` engine: multi-page PS, single-page EPS, Level 2/3, page ranges and password support.

### Verification and architecture
- Added dedicated exact-head regressions for Auto Redact Text, Scanner Effect and PDF -> PostScript / EPS; all pull-request-triggered regressions on the final feature heads passed before merge.
- Auto Redact security coverage requires the secret to disappear from both `pdftotext` output and expanded QDF reachable content while text on untouched pages remains extractable.
- Reused PDF.js, Canvas, pdf-lib and Poppler already present in the stack; V1.4 adds no new application runtime or provider dependency.
- Closed the accepted scope in `docs/V1.4-PARITY-AUDIT.md` and `docs/V1.4-CLOSEOUT.md` rather than extending parity merely to increase tool count.

### Important boundaries
- Auto Redact operates on the existing PDF text layer; image-only scans must be OCRed first. Affected pages are rasterized and lose original interactive/vector structures.
- Scanner Effect is a visual simulation only, not OCR and not evidence of physical-scanner provenance; output is intentionally rasterized.
- PostScript is an executable page-description language for an interpreter. SolYan only generates PS/EPS and does not accept/execute uploaded PostScript in this feature.
- PDF -> EPUB/AZW3, PCL/XPS, CBR/RAR tooling and inline content-stream image removal remain deliberate dependency/parser expansion decisions.
- Multi-party remote signing, cloud connectors, AI summarization and PDF translation remain separate provider/product/credential decisions.


## [0.1.6] - 2026-10-15

Patch release completing the current **V1.3 OSS-first self-contained parity and converter expansion**.

### V1.3 self-contained tools
- Added structural removal of digital signatures while preserving ordinary AcroForm fields, plus a bounded PDF Inspector and read-only form-field unlock path.
- Added scanner-bed photo splitting with the existing PDFium/OpenCV OCR-service stack.
- Added bounded PDF conversions to HTML, plain text, CBZ, Markdown, XML, RTF and CSV by reusing Poppler, PP-StructureV3 and LibreOffice already present in the stack.
- Added UTF-8 TXT -> PDF through the existing LibreOffice Office service with an explicit UTF-8 input filter and non-UTF-8 rejection.

### Verification and architecture
- Added permanent real regressions for each accepted V1.3 capability; the existing PDF-to-Office V1 synthetic/real-world release gates remain unchanged and passed on the TXT -> PDF feature head.
- Recorded detailed engine choices, evidence and deferred dependency-expansion items in `docs/V1.3-PARITY-AUDIT.md` and `docs/V1.3-CLOSEOUT.md`.
- Reused qpdf, Poppler, LibreOffice, PP-StructureV3, PDFium/OpenCV and existing service adapters; no new application runtime dependency was added by the accepted V1.3 scope.

### Important boundaries
- PDF -> EPUB/AZW3 remains a deliberate Calibre/runtime-expansion decision; PDF -> CBR remains lower priority because RAR creation adds tooling/licensing/deployment complexity while CBZ is already supported.
- PDF conversion outputs inherit their documented format-specific fidelity/interaction boundaries and do not imply byte-perfect reconstruction.
- Multi-party remote signing, cloud connectors, AI summarization and PDF translation remain separate product/provider/credential decisions.

## [0.1.5] - 2026-10-14

Patch release completing the **V1.2 self-contained parity expansion and security hardening** roadmap.

### V1.2 self-contained parity expansion
- Added browser-local PDF overlay, one-long-page composition, Poster PDF tiling, split-sections, advanced split-by-count/target-size, bookmark/outline editing and split-by-bookmark/chapter export.
- Added bounded qpdf attachment management, AES-256 permission controls, structural sanitization, form-safe comment/annotation removal, active-content inspection, reachable Image XObject removal and structural decompression.
- Added OCR-guided Auto Rotate using Tesseract OSD + PDFium analysis with conservative confidence gating and qpdf relative page rotation.
- Added QR-divider Auto Split for scanned batches using the existing PDFium/OpenCV OCR-service stack with qpdf page selection and optional duplex reverse-side skipping.
- Added browser-local Auto Rename from PDF.js title geometry and upgraded Watermark into a page-range text/image Stamp with deterministic page/file/date variables.
- Added explicit rasterized Color Transform modes for invert, grayscale, high-contrast and custom two-color output.
- Hardened Editor redaction from visual-only masking to security-first selected-page raster replacement so the original redacted-page content stream is not copied into the output.

### Verification and architecture
- Added permanent real-PDF gates for the new V1.2 surfaces, including Auto Rotate, Auto Split QR, Decompress, Auto Rename, Stamp, Color Transform and Secure Redaction.
- Secure Redaction regression requires qpdf validity, retained text on an untouched page, and absence of the redacted secret from both `pdftotext` and expanded QDF output.
- Recorded the maintained-OSS parity audit and engine decisions in `docs/V1.2-PARITY-AUDIT.md` to prevent repeated research or duplicate tools.
- Reused existing qpdf, Poppler, pdf-lib, PDF.js, Tesseract, PDFium/pypdfium2 and OpenCV engines; no Java/PDFBox application runtime was added for the parity pass.

### Important boundaries
- Color Transform intentionally rasterizes every output page; original selectable text, vector content, forms and annotations are not preserved as interactive source content.
- Security-first manual redaction rasterizes the selected page at 150 DPI and rebuilds the PDF without that page's original content stream. The redacted page loses interactive/vector text, and document-level catalog structures such as bookmarks, attachments, AcroForm and metadata are not guaranteed in this security-first path.
- Auto Rename is deterministic text-layer geometry, not AI; scanned PDFs without a text layer retain the original filename until OCR is run explicitly.
- Auto Split/Auto Rotate use temporary analysis rasters only; their PDF output paths use qpdf page selection/rotation rather than raster reconstruction.
- Cloud connectors, multi-party remote signing, AI summarization and PDF translation remain separate provider/product decisions.

## [0.1.4] - 2026-10-13

Patch release completing the current **V1.1 self-hosted utility parity and hardening** roadmap with new qpdf/Poppler utilities and browser-local printing/page-geometry tools.

### PDF utility parity
- Added qpdf web optimization/linearization, annotation/form flattening with generated appearances, and an explicit lossy-capable image recompression route separate from structural compression.
- Added bounded embedded-image extraction through Poppler `pdfimages`, preserving native encoded image formats where supported and returning a streamed ZIP archive.
- Added conservative blank-page removal: pages with a real text layer are always retained; only text-free pages are raster-classified at bounded resolution before qpdf page selection.
- Added browser-local N-up layout with A4 portrait/landscape output, custom grids, row/column ordering, LTR/RTL, margins, borders and CropBox-/rotation-aware fitting.
- Added browser-local saddle-stitch booklet imposition with automatic blank padding, left/right spine, gutter, front/back manual passes and short-edge auto-duplex support.
- Added browser-local crop with page-range selection and deterministic MediaBox/CropBox/BleedBox/TrimBox/ArtBox updates.
- Added browser-local resize/scale to A0-A6, Letter, Legal and custom sizes with portrait/landscape orientation, 10–200% scale and rotation-aware centering.

### Verification and architecture
- Added permanent real-PDF CI gates for image extraction, blank-page removal, N-up, booklet and crop/resize geometry.
- New layout gates validate qpdf structure, page count, target geometry, rotated source pages and retained text rather than relying only on TypeScript/build success.
- Kept N-up, booklet, crop and resize on the existing `pdf-lib` browser engine; no new application runtime package or layout service was added.
- Added Poppler utilities to the backend release dependency manifest for `pdfimages`, `pdftotext` and `pdftoppm` CLI integration.
- Continued the research-before-custom-code rule, using maintained open-source projects such as Stirling-PDF as behavior/parity references without copying their implementation.

### Important boundaries
- Crop changes visible page boxes and is **not secure redaction**; clipped content can remain in PDF content streams.
- N-up, booklet and resize embed visible page content into new pages, so interactive form/annotation controls are not preserved as interactive controls.
- Browser-local N-up/booklet/crop/resize are bounded to 100 MB / 500 source pages; blank-page removal has separate 100 MB / 300-page / aggregate-raster bounds.
- Cloud connectors, multi-party remote signing, AI summarization and PDF translation remain separate provider/product decisions.

## [0.1.3] - 2026-10-13

Patch release promoting the evidence-backed multi-engine PDF -> Office path to the versioned V1 release-gated surface and expanding the real-world OCR/XLSX regression baseline.

### PDF -> Office V1 release gate
- Added evidence-based `auto` routing: PDF -> DOCX/PPTX uses LibreOffice PDF import first with pinned Bloom as best-effort fallback; PDF -> XLSX keeps Bloom primary with PP-StructureV3 fallback only when Bloom reports no logical tables.
- Added native OOXML editability diagnostics so DOCX/PPTX routing is judged on editable text as well as rendered visual similarity.
- A/B tested Bloom vs LibreOffice on the same pinned 6-case / 41-page public DOCX/PPTX corpus: LibreOffice averaged 96.44% visual similarity vs Bloom 84.56%, with editable native text in all 6 cases.
- Re-ran the controlled 18-case synthetic corpus through final `auto` routing: 97.78% overall, DOCX 96.40%, PPTX 98.76%, XLSX 98.17%, with zero page-count, unmatched-page and geometry mismatches and editable DOCX/PPTX text in 12/12 cases.
- Added permanent versioned `pdf-to-office-release-v1` policy combining 18 synthetic cases with 9 pinned public real-world cases: 27 cases / 68 source pages total.
- Locked target-specific minimum average/case fidelity thresholds, exact routing engines, zero page/geometry loss requirements and DOCX/PPTX editability requirements.
- Promoted the public real-world DOCX/PPTX and scanned-XLSX workflows from diagnostics to hard V1 release gates.

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

### Real-world PDF -> Office validation
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
- Locked the complete frontend npm dependency graph with `package-lock.json` + `npm ci`.
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