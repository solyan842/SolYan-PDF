# SolYan PDF Roadmap

## Phase 0 — Bootstrap

- [x] Create repository structure
- [x] Record architecture principles
- [x] Record initial PDF engine candidates
- [x] Record Vietnamese Utilities scope
- [x] Add license/dependency register
- [x] Add coding and contribution conventions
- [x] Lock web-first / PWA-ready product direction

## Phase 1 — Core PDF utilities

- [x] Merge PDF
- [x] Split PDF
- [x] Reorder pages
- [x] Remove pages
- [x] Rotate pages
- [x] Extract pages
- [x] Encrypt / protect PDF
- [x] Unlock/decrypt PDF where user supplies valid credentials
- [x] Watermark / stamp
- [x] Page numbers
- [x] Metadata viewer/editor
- [x] Basic repair / validation
- [x] Basic compression/optimization

## Phase 2 — Viewer and editor

- [x] PDF viewer
- [x] Page thumbnails
- [x] Drag-and-drop page organizer UI
- [x] Add text
- [x] Add image
- [x] Draw / annotate
- [x] Highlight
- [x] Redact
- [x] Basic form support
- [x] Local/browser-side processing where practical

## Phase 3 — OCR and document intelligence

- [x] Image OCR
- [x] Scanned PDF OCR
- [x] Vietnamese OCR CER/WER benchmark harness
- [x] Establish reproducible initial real-scan baseline: 9 pinned public-domain scans, Tesseract fallback CER 13.47% / WER 22.88%
- [x] Expand real Vietnamese OCR regression corpus to 59 pages: 9 public-domain modern documents + 50 proofread scan pages from two public-domain Vietnamese works, with exact Wikisource revisions and source-PDF SHA256 pins
- [x] Establish expanded 59-sample Tesseract fallback baseline: CER 9.41% / WER 22.18%, with per-source regression checks
- [x] Layout recognition
- [x] Table recognition
- [x] Reading order
- [x] Structured Markdown/JSON export
- [x] Scanned table → Excel (`.xlsx`) export with multi-page/table workbook merge and browser download flow
- [x] Preserve source-page grouping, print orientation/aspect and one-page fit metadata for scanned-table XLSX exports
- [x] Automatic Tesseract `vie+eng` fallback for image/PDF text OCR

## Phase 4 — Office conversion

- [x] Word → PDF
- [x] Excel → PDF
- [x] PowerPoint → PDF
- [x] Images → PDF
- [x] PDF → images
- [x] Research PDF → DOCX engine/API candidate
- [x] Research PDF → XLSX engine/API candidate
- [x] Research PDF → PPTX engine/API candidate
- [x] Add experimental adapter to pinned Bloom upstream API
- [x] Add round-trip visual-fidelity benchmark harness
- [x] Add pinned 3-case DOCX/XLSX/PPTX end-to-end canary
- [x] Add controlled 18-case synthetic corpus (6 DOCX / 6 XLSX / 6 PPTX)
- [x] Pass the 18-case synthetic compatibility gate with zero page-count, unmatched-page and geometry mismatches
- [x] Add XLSX print-layout normalization and table-fragmentation regressions
- [x] Add pinned public 9-case / 50-page real-world diagnostic corpus across DOCX/XLSX/PPTX and record a non-release baseline
- [x] Fix real-world DOCX/PPTX interoperability defects exposed by the diagnostic corpus, including XML sanitation, PDF metadata BOM decoding and inherited page geometry
- [x] Add PP-StructureV3 fallback for scanned PDF → XLSX only when Bloom reports no logical tables, while preserving Bloom as the primary XLSX engine
- [x] Validate the scanned-XLSX fallback on 3 pinned public scans / 9 pages, improving useful round-trip pagination from 3/9 to 9/9 pages by preserving source pages with no recognized cells as raster worksheets, without weakening fidelity gates
- [x] Add native-OOXML editability diagnostics for DOCX/PPTX so routing decisions are not based on rendered similarity alone
- [x] A/B pinned Bloom vs LibreOffice PDF import on the same 6-case / 41-page public DOCX/PPTX corpus: LibreOffice 96.44% average similarity vs Bloom 84.56%, with editable native text in all 6 cases
- [x] Route PDF → DOCX/PPTX `auto` through LibreOffice first with Bloom best-effort fallback; keep PDF → XLSX on Bloom → PP-StructureV3 fallback
- [x] Re-run the 18-case synthetic corpus through final auto routing: 97.78% overall, DOCX 96.40%, PPTX 98.76%, XLSX 98.17%, with zero page-count/unmatched/geometry mismatches and editable DOCX/PPTX text in 12/12 cases
- [x] Run representative PDF → DOCX release corpus
- [x] Run representative PDF → XLSX release corpus
- [x] Run representative PDF → PPTX release corpus
- [x] Version and lock the permanent PDF-to-Office V1 release gate: 27 cases / 68 source pages with fixed target-specific fidelity, page/geometry, editability and scanned-XLSX acceptance thresholds

PDF-to-Office has passed the versioned **V1 release gate**. The permanent policy combines the controlled 18-case synthetic corpus with the pinned 9-case / 50-page public real-world corpus. Current measured baselines are 97.78% overall on synthetic auto routing, 96.44% on the 6-case / 41-page public DOCX/PPTX corpus, and 9/9 source pages preserved for the scanned-XLSX corpus. These are reproducible release baselines, not universal fidelity claims for every possible PDF.

## Phase 5 — Advanced tools

- [x] PDF compare — text-level
- [x] Pixel/layout visual compare
- [x] Digital signing with PKCS#12
- [ ] Multi-party / remote signature workflow product decision
- [x] PDF/A conversion
- [x] Forms
- [x] Local batch workflow builder
- [ ] Cloud-storage connectors — requires provider/credential decision
- [ ] AI document summarization — optional, requires model/provider decision
- [ ] PDF translation — optional, requires translation/model provider decision

## V1.1 — Self-hosted utility parity and hardening

- [x] Audit maintained open-source PDF platforms before adding difficult utilities; use Stirling-PDF as a feature-parity reference rather than reimplementing blindly
- [x] Add qpdf linearization / web optimization
- [x] Add qpdf annotation and form-field flattening with generated appearances
- [x] Add qpdf image recompression as an explicit lossy-capable mode separate from structural compression
- [ ] Extract embedded PDF images as a downloadable archive
- [ ] Detect and remove blank pages with a bounded, testable threshold
- [ ] Add N-up / multi-page-per-sheet layout
- [ ] Add booklet / imposition layout
- [ ] Add crop / resize-page utilities with deterministic page geometry

## Tiện ích Việt Nam — V1

### Văn bản

- [x] Đổi số tiền thành chữ
- [x] Bỏ dấu tiếng Việt
- [x] Chuyển chữ hoa / chữ thường
- [x] Đếm từ và ký tự

### Tính toán

- [x] Tính VAT xuôi / ngược
- [x] Tính phần trăm
- [x] Tính tuổi
- [x] BMI / cân nặng
- [x] Tính công suất điều hòa

### Internet / Website

- [x] Kiểm tra vị trí từ khóa Google via configurable Custom Search API
- [x] Kiểm tra thứ hạng website using a Tranco-compatible metric
- [x] Xem địa chỉ IP Internet
- [x] Ping IP / website

## Deployment, PWA & verification

- [x] Frontend Docker image
- [x] Backend Docker image
- [x] OCR service Docker image
- [x] Office service Docker image
- [x] Signature service Docker image
- [x] PDF/A archive service Docker image
- [x] Docker Compose stack
- [x] Environment template
- [x] Installable PWA manifest/icon/service worker
- [x] Baseline web security headers
- [x] Frontend production-build CI
- [x] Production npm high-severity audit gate
- [x] Patched PostCSS transitive dependency override
- [x] Backend/qpdf CI
- [x] Real qpdf smoke coverage for web optimization, flattening and image recompression routes
- [x] OCR XLSX binary proxy regression coverage
- [x] Private-network Ping blocked by default
- [x] Untrusted proxy IP headers ignored by default
- [x] Signing/PDF-A proxy upload bounds
- [x] OCR service CI wiring
- [x] Real Vietnamese Tesseract fallback smoke test
- [x] Real Vietnamese 9-scan CER/WER regression baseline
- [x] Expanded 59-sample real-scan Vietnamese OCR regression gate with exact source provenance
- [x] Real LibreOffice DOCX → PDF smoke test
- [x] Real PKCS#12 signing smoke test
- [x] Real PDF/A smoke test
- [x] Compose validation + frontend/backend container build CI
- [x] Run all six runtime images as non-root with writable HOME enforced by CI
- [x] PDF-to-Office synthetic V1 release gate
- [x] PDF-to-Office public real-world V1 release gate

## Release packaging

- [x] Select repository license: Apache-2.0
- [x] Add `LICENSE` and `NOTICE`
- [x] Add `CHANGELOG.md` for v0.1.0
- [x] Add direct dependency release manifest
- [x] Publish GitHub tag/release `v0.1.0`
- [x] Pin Node/Python multi-arch base-image digests
- [x] Lock full frontend npm graph with `package-lock.json` + `npm ci`
- [x] Lock all Python transitive graphs, with PaddlePaddle kept on its dedicated CPU index
- [x] Generate resolved OS/Python/npm package inventories for all six release images in CI artifacts
- [x] Add SHA-256 hash verification for backend / Office / signing / PDF-A and the PyPI portion of OCR
- [x] Preserve PaddlePaddle as a separate source/version-locked CPU-index dependency
- [x] Pin Debian package sources to snapshot `20261012T000000Z` for all Python images
- [x] Publish hardened patch release `v0.1.1`
- [x] Remove completed one-shot release publisher workflows after successful publication
- [x] Publish PDF-to-Office compatibility patch release `v0.1.2`
- [x] Remove completed `v0.1.2` one-shot publisher after successful publication
- [x] Publish PDF-to-Office V1-gated patch release `v0.1.3`
- [x] Remove completed `v0.1.3` one-shot publisher after successful publication

## Release decisions / external inputs still required

- [x] Version the representative PDF → Office V1 release corpus and lock its target-specific fidelity/editability thresholds against the measured auto-routing baselines
- [ ] Choose whether multi-party remote signing belongs in V1 or a later release
- [ ] Choose cloud-storage providers and provide credentials if connectors are wanted
- [ ] Choose model/provider if AI summarization is wanted
- [ ] Choose translation/model provider if PDF translation is wanted

## Research rule for difficult features

Before implementing a difficult feature from scratch:

1. Search for maintained open-source repositories solving the same problem.
2. Check the exact license and whether commercial/self-hosted integration is allowed.
3. Benchmark quality against the SolYan PDF requirement.
4. Prefer integration through an adapter or separate service.
5. Write custom code only when existing options are unsuitable.
