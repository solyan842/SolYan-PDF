# SolYan PDF v0.1.7

**V1.4 OSS-first self-contained security, scan simulation and vector export**

This patch release closes the intentionally compact V1.4 pass after v0.1.6. The release adds three high-value capabilities while preserving the project rule that parity count alone does not justify a new runtime, provider or dependency family.

## New V1.4 tools

- **Auto Redact Text** — searches the existing PDF text layer for literal terms and securely replaces only affected pages with trusted rasters. Regression coverage requires redacted secrets to be absent from both extracted text and expanded reachable PDF content.
- **Scanner Effect** — deterministic browser-local scan simulation with High/Medium/Low DPI presets, grayscale/color modes, brightness/contrast, seeded noise, blur, optional yellowed paper, border and controlled skew.
- **PDF → PostScript / EPS** — Poppler `pdftops` export using the backend runtime already shipped by SolYan PDF: multi-page PS, single-page EPS, PostScript Level 2/3, page ranges and encrypted-PDF password support.

## Verification

Each accepted V1.4 capability has a dedicated exact-head regression gate. Before merge of the final PDF → PostScript / EPS feature, every pull-request-triggered workflow on that exact head completed successfully, including Backend CI, Frontend CI, Auto Redact Text CI, Scanner Effect CI, Color Transform CI and the remaining triggered regression suite.

Auto Redact's security gate verifies qpdf validity, retained extractable text on an untouched page, and absence of the secret from both `pdftotext` and expanded QDF reachable content. Scanner Effect gates deterministic pixel/preset semantics and explicit raster/provenance boundaries. PDF → PostScript CI converts a real two-page fixture to PS/EPS and validates page/range/level/error semantics.

The existing PDF-to-Office V1 release policy remains unchanged at **27 cases / 68 source pages** with its fixed target-specific fidelity, editability, page/geometry and scanned-XLSX thresholds.

## Architecture

V1.4 reuses PDF.js, Canvas, pdf-lib and Poppler already present in the SolYan stack. No new application runtime or provider dependency is added by the accepted scope.

Detailed decisions are recorded in `docs/V1.4-PARITY-AUDIT.md`; the final scope and release-readiness decision are recorded in `docs/V1.4-CLOSEOUT.md`.

## Important boundaries

- Auto Redact requires an existing text layer. Image-only scans must be OCRed first; affected pages are rasterized and lose original interactive/vector structures.
- Scanner Effect is a visual simulation, not OCR and not evidence of physical-scanner provenance. Its output is intentionally rasterized.
- PostScript is an executable page-description language for an interpreter. SolYan only generates PS/EPS; users should interpret them with trusted/sandboxed software.
- PDF → EPUB/AZW3 remains a Calibre/runtime expansion decision. PCL/XPS remain a Ghostscript/GhostPDL expansion decision. CBR/RAR and inline `BI … ID … EI` image removal remain tooling/parser expansion decisions.

## Remaining external decisions

Multi-party remote signing, cloud-storage connectors, AI summarization and PDF translation remain intentionally outside this self-contained release because they require separate product/provider/credential decisions.
