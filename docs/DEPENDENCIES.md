# SolYan PDF — Dependency & License Register

This document tracks third-party components used or evaluated by SolYan PDF. Exact versions, transitive dependencies, notices and deployment obligations must still be re-checked before a public production release.

## Implemented components

| Component | Current role | License / model | Integration |
|---|---|---|---|
| qpdf | Protect/unlock, repair and structural optimization | Apache-2.0 | Backend CLI inside isolated API container |
| pdf-lib | Browser-side merge/page operations/editing/workflows | MIT | Frontend dependency |
| PDF.js / pdfjs-dist | Viewer, text extraction and visual compare rendering | Apache-2.0 | Frontend dependency |
| JSZip | Package rendered PDF pages for download | MIT | Frontend dependency |
| PaddleOCR 3.7 | Primary OCR and PP-StructureV3 document intelligence | Apache-2.0 | Isolated Python service |
| PaddlePaddle 3.2 | PaddleOCR inference runtime | Apache-2.0 | OCR service runtime |
| Tesseract OCR | Automatic fallback OCR (`vie+eng`) | Apache-2.0 | Binary inside OCR service |
| pypdfium2 5.14 | Render PDF pages for Tesseract fallback and benchmark tooling | BSD-3-Clause / Apache-2.0 plus dependency licenses | OCR/benchmark dependency |
| LibreOffice | DOCX/XLSX/PPTX/OpenDocument/RTF → PDF | MPL-2.0 for LibreOffice product; includes separately licensed third-party code | Isolated headless conversion service |
| pyHanko 0.37 | PKCS#12 cryptographic PDF signing | MIT | Isolated signing service |
| OCRmyPDF 17.13 | PDF/A orchestration using internal non-Ghostscript backend | MPL-2.0 | Isolated archive service |
| Bloom PDF Editor server | Experimental PDF → DOCX/XLSX/PPTX candidate | Apache-2.0 upstream at pinned commit; re-check exact dependencies before deployment | External optional service behind adapter; not bundled by default |

## Approved architecture rules

1. Keep third-party engines behind adapters or isolated services where practical.
2. Do not couple SolYan PDF business logic directly to one PDF engine.
3. Prefer permissive dependencies for the main application code.
4. Re-check the exact license of every dependency at the exact pinned version before production release.
5. Preserve all required copyright, license, NOTICE and attribution files.
6. Audit transitive dependencies separately; a top-level project license is not sufficient evidence for every bundled component.
7. Do not add AGPL/proprietary/open-core source directly into the SolYan PDF core without a deliberate license review.

## Candidates not currently required by the running core

| Component | Possible role | Status |
|---|---|---|
| Apache PDFBox | Additional advanced PDF manipulation/forms/content operations | Approved candidate, not currently needed by implemented V1 routes |
| pdfcpu | Complementary validation/stamp/layout operations | Approved candidate, not currently needed by implemented V1 routes |
| LibPDF-js | More advanced browser-side PDF signing/manipulation | Research candidate |

## Components intentionally kept out of the initial core

| Component | Reason |
|---|---|
| Ghostscript | AGPL/commercial licensing requires a deliberate deployment and distribution review. SolYan PDF's current PDF/A path does not require it. |
| MuPDF | AGPL/commercial licensing; keep out unless a later feature clearly justifies it. |
| Stirling PDF proprietary/open-core areas | Mixed licensing. Use only as architectural/reference research unless a specific source path is verified as compatible. |
| Documenso / Docuseal source | Useful e-sign workflow references but AGPL-based; do not copy directly into the core without an explicit licensing decision. |

## Release gate

Before any public production release, create a pinned dependency manifest containing:

- component name and exact version/commit;
- upstream repository/homepage;
- exact license identifier;
- license/NOTICE file path;
- transitive dependency audit result;
- whether code is linked, bundled, invoked as a process, or deployed as a separate service;
- required attribution and source-distribution obligations, if any.
