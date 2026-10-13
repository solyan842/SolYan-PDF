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
- [x] Fix real-world DOCX/PPTX interoperability defects exposed by the diagnostic corpus, including XML sanitation, PDF metadata BOM decoding and inherited PDF page geometry
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
- [x] Extract embedded PDF images as a downloadable archive
- [x] Detect and remove blank pages with a bounded, testable threshold
- [x] Add N-up / multi-page-per-sheet layout
- [x] Add booklet / imposition layout
- [x] Add crop / resize-page utilities with deterministic page geometry

V1.1 self-hosted utility parity is complete and released as v0.1.4.

## V1.2 — Self-contained parity expansion

- [x] Add browser-local PDF overlay with repeat-first/page-matched modes, opacity and CropBox/rotation-aware fitting
- [x] Add browser-local PDF → one long page with vector/text preservation and a bounded 14,400 pt compatibility ceiling
- [x] Extend PDF split with exact pages-per-part mode and clearly labeled best-effort target-size mode, returning parts in one ZIP
- [x] Add bounded qpdf embedded-file management: list, add, extract and remove attachments
- [x] Extend AES-256 protection with qpdf printing/modification/extraction permissions and generate a distinct random owner password when omitted
- [x] Add bounded qpdf JSON sanitization with independent regression-tested removal of JavaScript/actions/active annotations, link annotations, Info/XMP metadata and EmbeddedFiles/AF/FileAttachment structures; selective mode must preserve unselected categories and the product explicitly does not claim antivirus/universal exploit coverage
- [x] Add form-safe qpdf JSON comment/annotation removal: safe mode removes standard markup/comment subtypes while preserving Widget/AcroForm, Link and FileAttachment; optional all-non-widget mode removes every annotation except Widget
- [x] Add browser-local PDF bookmark/outline editor with Unicode titles, nested hierarchy, sibling reordering, page destinations, bounded extraction/writing and deterministic outline replacement/removal
- [x] Add browser-local split-by-bookmark/chapter ZIP export with selectable outline depth, physical-page ranges, duplicate-start handling and bounded real-PDF regression coverage
- [x] Add browser-local Poster PDF tiling with X×Y grids, A3/A4/A5/Letter/Legal/Tabloid sheets, RTL ordering and CropBox/rotation-aware visible-page normalization
- [x] Add browser-local split-sections with all/custom/except-first/except-last page selection, rows×columns grids, merged-PDF or per-part ZIP output, CropBox/rotation normalization and bounded regression coverage
- [ ] Continue maintained open-source parity audit for additional self-contained high-value tools before adding provider-dependent features

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
- [x] Real qpdf JSON sanitization gate covering catalog/page actions, OpenAction, JavaScript name trees/actions, URI links, XMP/Info metadata, EmbeddedFiles/AF/FileAttachment structures and selective-mode preservation
- [x] Real qpdf JSON annotation-removal gate covering comment/markup cleanup, optional all-non-widget cleanup and Widget/AcroForm preservation
- [x] Real Poppler embedded-image extraction gate with bounded Image XObject / ZIP validation
- [x] Real conservative blank-page removal gate across blank, vector-content and text-content pages
- [x] Real browser-local N-up gate with A4 geometry, ordering, RTL, source rotation and retained text checks
- [x] Real browser-local booklet gate with saddle-stitch order, blank padding, duplex/spine behavior, source rotation and retained text checks
- [x] Real browser-local Poster PDF gate covering RTL tile order, real LTR/RTL text placement, target-paper geometry, offset CropBox, 90° rotation and qpdf validity
- [x] Real browser-local split-sections gate covering page-selection semantics, column-major/top-to-bottom order, merged/individual outputs, offset CropBox, 90° rotation, retained text and qpdf validity
- [x] Real browser-local crop/resize geometry gate with selective page boxes, rotated sources, A4/custom target sizes, qpdf validation and retained text checks
- [x] Real browser-local overlay/single-page gate with qpdf validity, page geometry, rotation handling and retained-text checks
- [x] Real browser-local advanced-split gate with exact page grouping, bounded target-size estimation, qpdf validity and retained-text checks
- [x] Real browser-local bookmark/outline gate covering Unicode title round-trip, hierarchy, sibling links, page clamping, replacement/removal and qpdf object-graph validation
- [x] Real browser-local split-by-bookmarks gate covering bookmark depth, physical-page ordering, duplicate-page behavior, filename sanitation, expected chapter page counts and qpdf validity
- [x] Real qpdf 11.9 attachment round-trip gate covering add/list/extract/remove and binary payload equality
- [x] Real qpdf 11.9 AES-256 permission gate covering deny-all, permissive defaults, low-print/form-only rights, user-vs-owner identity and user-password decrypt compatibility
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
- [x] Publish V1.1 self-hosted utility-parity patch release `v0.1.4`
- [x] Remove completed `v0.1.4` one-shot publisher after successful publication

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
