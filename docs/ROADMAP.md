# SolYan PDF Roadmap

## Phase 0 — Bootstrap

- [x] Create repository structure
- [x] Record architecture principles
- [x] Record initial PDF engine candidates
- [x] Record Vietnamese Utilities scope
- [ ] Add license/dependency register
- [ ] Add coding and contribution conventions

## Phase 1 — Core PDF utilities

Target first because they are mature, testable and low-risk:

- [ ] Merge PDF
- [ ] Split PDF
- [ ] Reorder pages
- [ ] Remove pages
- [ ] Rotate pages
- [ ] Extract pages
- [ ] Encrypt / protect PDF
- [ ] Unlock/decrypt PDF where user supplies valid credentials
- [ ] Watermark / stamp
- [ ] Page numbers
- [ ] Metadata viewer/editor
- [ ] Basic repair / validation
- [ ] Basic compression/optimization

## Phase 2 — Viewer and editor

- [ ] PDF viewer
- [ ] Page thumbnails / drag-and-drop organize
- [ ] Add text
- [ ] Add image
- [ ] Draw / annotate
- [ ] Highlight
- [ ] Redact
- [ ] Basic form support
- [ ] Local/browser-side processing where practical

## Phase 3 — OCR and document intelligence

- [ ] Image OCR
- [ ] Scanned PDF OCR
- [ ] Vietnamese OCR benchmark
- [ ] Layout recognition
- [ ] Table recognition
- [ ] Reading order
- [ ] Structured Markdown/JSON export
- [ ] Tesseract fallback path

## Phase 4 — Office conversion

- [ ] Word → PDF
- [ ] Excel → PDF
- [ ] PowerPoint → PDF
- [ ] Images → PDF
- [ ] PDF → images
- [ ] Research/benchmark PDF → DOCX
- [ ] Research/benchmark PDF → XLSX
- [ ] Research/benchmark PDF → PPTX

PDF-to-Office fidelity must be benchmarked before choosing an implementation.

## Phase 5 — Advanced tools

- [ ] PDF compare
- [ ] Digital signing
- [ ] Signature workflow research
- [ ] PDF/A
- [ ] Forms
- [ ] Batch workflow builder
- [ ] Cloud-storage connectors
- [ ] AI document summarization (optional)
- [ ] PDF translation (optional)

## Tiện ích Việt Nam — V1

### Văn bản

- [ ] Đổi số tiền thành chữ
- [ ] Bỏ dấu tiếng Việt
- [ ] Chuyển chữ hoa / chữ thường
- [ ] Đếm từ và ký tự

### Tính toán

- [ ] Tính VAT xuôi / ngược
- [ ] Tính phần trăm
- [ ] Tính tuổi
- [ ] BMI / cân nặng
- [ ] Tính công suất điều hòa

### Internet / Website

- [ ] Kiểm tra vị trí từ khóa Google
- [ ] Kiểm tra thứ hạng website / chọn metric thay Alexa
- [ ] Xem địa chỉ IP Internet
- [ ] Ping IP / website

## Research rule for difficult features

Before implementing a difficult feature from scratch:

1. Search for maintained open-source repositories solving the same problem.
2. Check the exact license and whether commercial/self-hosted integration is allowed.
3. Benchmark quality against the SolYan PDF requirement.
4. Prefer integration through an adapter or separate service.
5. Write custom code only when existing options are unsuitable.
