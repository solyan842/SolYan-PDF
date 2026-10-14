# SolYan PDF v0.1.5

**V1.2 self-contained parity expansion and security hardening**

This patch release closes the current V1.2 self-contained PDF-engine roadmap. The work was benchmarked against maintained open-source behavior and deliberately reuses the engines already present in SolYan PDF instead of adding a new Java/PDFBox application runtime.

## New and expanded PDF tools

- **Overlay PDFs** and **PDF → One Long Page** — browser-local composition with explicit geometry bounds.
- **Advanced Split** — exact pages-per-part and best-effort target-size ZIP modes.
- **Attachments** — bounded qpdf list/add/extract/remove embedded-file management.
- **PDF Permissions** — AES-256 print/modify/extract controls with distinct owner-password semantics.
- **Sanitization / Annotation cleanup** — qpdf JSON removal of regression-tested active structures and form-safe comment cleanup.
- **Bookmarks / Split by Chapters** — browser-local Unicode outline editing and chapter ZIP export.
- **Poster PDF / Split Sections** — browser-local printable tiling and page-grid extraction.
- **Active Content Inspector** — reachable JavaScript/action/trigger and attachment-reference inspection without executing document JavaScript.
- **Remove Images** — qpdf JSON removal of reachable Image XObjects from page and nested Form resources.
- **Auto Rotate** — Tesseract OSD + PDFium analysis with conservative confidence gating, followed by relative qpdf page rotation.
- **Auto Split QR** — PDFium/OpenCV divider detection with optional duplex handling and qpdf page selection.
- **Decompress PDF** — qpdf structural stream/object decompression for inspection and debugging.
- **Auto Rename** — deterministic PDF.js title-geometry naming without rewriting source PDF bytes.
- **Stamp** — text/image stamping with page ranges, position, opacity, rotation and deterministic page/file/date variables.
- **Color Transform** — explicit rasterized invert, grayscale, high-contrast and custom two-color modes.

## Security-first redaction hardening

The Editor's former `redact` action only painted an opaque rectangle over recoverable underlying PDF content. v0.1.5 replaces that behavior with a security-first path:

- burn the requested region into a temporary render-only page;
- render the selected page at 150 DPI with PDF.js;
- rebuild the PDF without copying the original selected-page content stream;
- copy non-redacted pages from the source PDF.

The permanent Secure Redaction gate proves qpdf validity, retained text on an untouched page, and absence of the redacted secret from both `pdftotext` output and expanded qpdf QDF objects.

## Verification

V1.2 adds permanent deterministic gates for Auto Rotate, Auto Split QR, Decompress, Auto Rename, Stamp, Color Transform and Secure Redaction, in addition to the existing sanitization, active-content, annotation, image-removal, bookmark, split, poster, geometry, OCR, PDF-to-Office and deployment gates.

The existing PDF-to-Office V1 release claims remain scoped to their pinned representative corpus: 27 cases / 68 source pages with fixed fidelity, geometry, editability and scanned-XLSX acceptance thresholds.

## Architecture

The V1.2 parity pass reuses:

- qpdf and Poppler as isolated backend CLI engines;
- pdf-lib and PDF.js for bounded browser-local operations;
- Tesseract OSD plus PDFium/pypdfium2 for orientation analysis;
- OpenCV 4.10 for exact QR-divider detection.

No Java/PDFBox application runtime was added. The maintained-OSS research and no-duplicate decisions are recorded in `docs/V1.2-PARITY-AUDIT.md`.

## Important boundaries

- **Color Transform rasterizes every output page.** Selectable source text, vector structures, forms and annotations are not preserved as interactive source content.
- **Secure manual redaction rasterizes the selected page.** That page loses selectable/vector text and interactive form/annotation structures. Document-level catalog structures such as bookmarks, attachments, AcroForm and metadata are not guaranteed in this security-first rebuild path.
- **Auto Rename is not AI.** Image-only PDFs without a usable text layer retain their original filename until OCR is run explicitly.
- **Auto Rotate and Auto Split use temporary analysis rasters only.** Their PDF output paths use qpdf rotation/page selection rather than raster reconstruction.
- Rewriting PDF content can invalidate existing digital signatures.

## Remaining external decisions

Multi-party remote signing, cloud-storage connectors, AI summarization and PDF translation remain intentionally outside this release because they require separate product/provider/credential decisions.