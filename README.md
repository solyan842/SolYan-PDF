# SolYan PDF

SolYan PDF is a self-hostable PDF and Vietnamese utilities platform.

## Project goals

- Provide common PDF tools with a clean web UI.
- Prefer permissively licensed open-source engines instead of reimplementing mature components.
- Keep client-side processing where practical for privacy and lower server load.
- Separate frontend, API, and document engines so individual engines can be replaced without rewriting the product.
- Add a dedicated **Vietnamese Utilities** group for tools useful to Vietnamese users.

## Planned PDF stack

- **qpdf** — structural PDF operations, merge/split, encryption, repair/linearization.
- **Apache PDFBox** — advanced PDF manipulation, forms, metadata, rendering/content operations.
- **pdfcpu** — watermark, stamp, page layout, validation and extraction utilities.
- **LibPDF / pdf-lib / PDF.js** — browser-side PDF operations and viewing/editing where appropriate.
- **PaddleOCR** — primary OCR/document-layout engine.
- **Tesseract** — lightweight OCR fallback.
- **LibreOffice headless** — Office to PDF conversion.

> Engines and dependencies will be reviewed individually for license compatibility before integration.

## Repository layout

```text
SolYan-PDF/
├─ frontend/          # Web UI
├─ backend/           # API, orchestration and job handling
├─ engines/           # PDF/OCR/conversion adapters
└─ docs/              # Architecture, roadmap and project decisions
```

## Vietnamese Utilities

The first version plans a **Tiện ích Việt Nam** section with 13 tools:

### Văn bản
- Đổi số tiền thành chữ
- Bỏ dấu tiếng Việt
- Chuyển chữ hoa / chữ thường
- Đếm từ và ký tự

### Tính toán
- Tính VAT xuôi / ngược
- Tính phần trăm
- Tính tuổi
- BMI / cân nặng
- Tính công suất điều hòa

### Internet / Website
- Kiểm tra vị trí từ khóa Google
- Kiểm tra thứ hạng website (legacy/replacement metric to be decided)
- Xem địa chỉ IP Internet
- Ping IP / website

## Status

Repository bootstrap only. No production PDF engine has been implemented yet.
