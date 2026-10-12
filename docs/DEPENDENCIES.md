# SolYan PDF — Dependency & License Register

This document tracks third-party components considered for SolYan PDF. No dependency is approved for production merely by appearing here; exact versions, transitive dependencies, notices, and deployment model must be re-checked before release.

## Approved candidates for the core architecture

| Component | Intended role | License | Integration direction | Status |
|---|---|---|---|---|
| qpdf | Low-level PDF structure operations: merge, split, encryption, linearization, repair-oriented transformations | Apache-2.0 | Separate CLI/service adapter or native wrapper | Candidate approved |
| Apache PDFBox | Higher-level PDF manipulation, metadata, forms, text/content operations, rendering support | Apache-2.0 | Java service/adapter | Candidate approved |
| pdfcpu | Validation, optimize, watermark/stamp, page operations and complementary PDF utilities | Apache-2.0 | Go service/CLI adapter | Candidate approved |
| pdf-lib | Lightweight browser-side PDF creation/modification | MIT | Frontend/browser adapter | Candidate approved |
| PaddleOCR | Primary OCR and document-layout/document-intelligence pipeline | Apache-2.0 | Separate Python service | Candidate approved |
| Tesseract OCR | Lightweight/fallback OCR path | Apache-2.0 | Separate OCR adapter | Candidate approved |
| LibreOffice | DOCX/XLSX/PPTX → PDF conversion | MPL-2.0 for LibreOffice product; contains separately licensed third-party code | Isolated headless conversion service/container | Candidate approved with release-time legal/dependency review |

## Current architectural rules

1. Keep third-party engines behind adapters or isolated services where practical.
2. Do not couple SolYan PDF business logic directly to one PDF engine.
3. Prefer permissive dependencies for the main application code.
4. Re-check the exact license of every dependency at the exact pinned version before production release.
5. Preserve all required copyright, license, NOTICE and attribution files.
6. Audit transitive dependencies separately; the top-level project license is not sufficient evidence for every bundled component.
7. Do not add AGPL/proprietary/open-core source directly into the SolYan PDF core without a deliberate license review.

## Components not approved for the initial core

| Component | Reason |
|---|---|
| Ghostscript | AGPL/commercial licensing requires a deliberate deployment and distribution review. Not needed in the initial core. |
| MuPDF | AGPL/commercial licensing; keep out of the initial core unless a later feature clearly justifies it. |
| Stirling PDF proprietary/open-core areas | Mixed licensing. Use only as architectural/reference research unless a specific source path is verified as compatible. |
| Documenso / Docuseal source | Useful e-sign references but AGPL-based; do not copy directly into the core without an explicit licensing decision. |

## Difficult-feature policy

For PDF → DOCX/XLSX/PPTX, advanced editor, compare, e-signature workflow, forms and AI-assisted document functions:

- search maintained open-source implementations first;
- verify exact license before importing code;
- benchmark quality against the SolYan PDF requirement;
- prefer adapter/service integration over hard forks;
- write custom code only when existing projects are unsuitable.

## Release gate

Before any public production release, create a pinned dependency manifest containing:

- component name and exact version/commit;
- upstream repository/homepage;
- exact license identifier;
- license/NOTICE file path;
- transitive dependency audit result;
- whether code is linked, bundled, invoked as a process, or deployed as a separate service;
- required attribution and source-distribution obligations, if any.
