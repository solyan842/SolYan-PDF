# Changelog

All notable changes to SolYan PDF are documented here.

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
