# SolYan PDF v0.1.6

**V1.3 OSS-first self-contained parity and converter expansion**

This patch release completes the current V1.3 pass after v0.1.5. The focus is high-value self-hosted capabilities that can reuse engines already shipped by SolYan PDF, with real regression gates and explicit format/security boundaries rather than adding broad new runtime stacks.

## New V1.3 tools

- **Remove Digital Signatures** — structurally removes signature fields/widgets and signature-specific catalog state while preserving ordinary AcroForm fields.
- **PDF Inspector / Get ALL Info** — bounded qpdf + Poppler document, metadata, encryption, form/signature, font, image, attachment and active-content inspection.
- **Unlock PDF Forms** — clears read-only form-field state and referenced XFA read-only access without flattening fields.
- **Split Scanned Photos** — extracts and optionally deskews photographs from scanner-bed scans using the existing PDFium/OpenCV OCR-service stack.

## Expanded conversions

- **PDF → HTML** — self-contained Poppler HTML with embedded images and a restrictive downloaded-document security policy.
- **PDF → Text** — bounded Poppler text-layer extraction with page ranges, layout mode and password support.
- **PDF → CBZ** — deterministic raster page archive using Poppler rendering.
- **PDF → Markdown** — PP-StructureV3 semantic/layout extraction through the existing structured OCR pipeline.
- **PDF → XML** — Poppler `pdf2xml` export with positioned text/font/page geometry and entity hardening.
- **PDF → RTF** — LibreOffice `writer_pdf_import` followed by RTF export.
- **PDF → CSV** — PP-StructureV3/XLSX table extraction adapted to UTF-8 CSV with spreadsheet-formula injection neutralization.
- **UTF-8 TXT → PDF** — LibreOffice conversion through the existing Document/Office → PDF surface with explicit UTF-8 filtering and rejection of non-UTF-8 text.

## Verification

Every accepted V1.3 capability has dedicated regression coverage. The final TXT → PDF feature head also passed Frontend CI, Office Service CI, Bloom PDF-to-Office Canary CI, PDF-to-Office Synthetic V1 Release Gate, PDF-to-Office Real-World V1 Release Gate and the PDF-to-RTF compatibility gate before merge.

The existing PDF-to-Office V1 release policy remains unchanged: **27 cases / 68 source pages** with fixed target-specific fidelity, page/geometry, editability and scanned-XLSX thresholds.

Detailed engine decisions and evidence are recorded in `docs/V1.3-PARITY-AUDIT.md`; the final self-contained scope and release-readiness decision are recorded in `docs/V1.3-CLOSEOUT.md`.

## Architecture

V1.3 continues the reuse-before-rewrite policy. Accepted work reuses qpdf, Poppler, LibreOffice, PP-StructureV3, PDFium/OpenCV and existing SolYan service adapters. The accepted scope does not add a new application runtime dependency.

## Important boundaries

- Conversion outputs inherit their documented format-specific fidelity and interaction limits; none imply universal byte-perfect reconstruction.
- PDF → HTML is a downloaded display conversion, not preservation of PDF JavaScript/forms/interactive semantics.
- PDF → CBZ is rasterized and does not preserve selectable PDF text or interactive structures.
- PDF → Markdown/CSV depend on structured OCR/table semantics and are not universal reconstruction formats.
- Remove Digital Signatures intentionally creates a new unsigned PDF; it does not validate signer identity or certificate trust.
- PDF → EPUB/AZW3 remains a deliberate Calibre/runtime-expansion decision. PDF → CBR remains lower priority because RAR creation adds tooling/licensing/deployment complexity while CBZ is supported.
- Inline content-stream image removal (`BI … ID … EI`) remains outside the qpdf Image XObject removal path because robust support needs a content-stream parser/dependency expansion.

## Remaining external decisions

Multi-party remote signing, cloud-storage connectors, AI summarization and PDF translation remain intentionally outside this self-contained release because they require separate product/provider/credential decisions.
