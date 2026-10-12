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
- [ ] Establish release baseline on a representative Vietnamese corpus
- [x] Layout recognition
- [x] Table recognition
- [x] Reading order
- [x] Structured Markdown/JSON export
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
- [ ] Run representative PDF → DOCX release corpus
- [ ] Run representative PDF → XLSX release corpus
- [ ] Run representative PDF → PPTX release corpus

PDF-to-Office stays labelled **Experimental** until representative corpus results meet an agreed threshold.

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
- [x] Private-network Ping blocked by default
- [x] Untrusted proxy IP headers ignored by default
- [x] Signing/PDF-A proxy upload bounds
- [x] OCR service CI wiring
- [x] Real Vietnamese Tesseract fallback smoke test
- [x] Real LibreOffice DOCX → PDF smoke test
- [x] Real PKCS#12 signing smoke test
- [x] Real PDF/A smoke test
- [x] Compose validation + frontend/backend container build CI

## Release decisions / external inputs still required

- [ ] Select the repository-level open-source license
- [ ] Provide/version a representative Vietnamese OCR release corpus
- [ ] Provide/version representative PDF → Office benchmark corpora and define acceptable fidelity threshold
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
