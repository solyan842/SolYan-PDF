# SolYan PDF v0.1.4

**V1.1 self-hosted utility parity and hardening**

This patch release completes the current self-contained V1.1 roadmap. It expands SolYan PDF with high-value PDF utilities benchmarked against maintained open-source tooling while keeping the implementation small, replaceable and privacy-first.

## New PDF utilities

- **Web Optimize** — qpdf linearization for faster compatible reader startup.
- **Flatten PDF** — generate appearances and flatten annotations/form fields into page content.
- **Compress Images** — explicit lossy-capable qpdf image optimization, separate from structural compression.
- **Extract Images** — bounded Poppler `pdfimages` extraction to ZIP, preserving native encodings where supported.
- **Remove Blank Pages** — conservative text-first detection; text-free pages are checked with bounded 150-DPI grayscale analysis before qpdf page selection.
- **N-up layout** — browser-local A4 portrait/landscape grids with row/column ordering, LTR/RTL, margins, borders and rotation-aware page fitting.
- **Booklet imposition** — browser-local saddle-stitch 2-up ordering with automatic blank padding, left/right spine, gutter and duplex/manual-pass controls.
- **Crop PDF** — browser-local page-range crop with deterministic MediaBox/CropBox/BleedBox/TrimBox/ArtBox updates while retaining page rotation and vector/text content.
- **Resize / Scale Pages** — browser-local A0–A6, Letter, Legal or custom target sizes with portrait/landscape selection, 10–200% content scale and rotation-aware centering.

## Verification

New permanent CI gates exercise real PDFs rather than only type/build checks:

- qpdf linearization, flattening and image optimization smoke coverage.
- Poppler embedded-image extraction with ZIP and image validation.
- Blank/vector/text blank-page classification regression.
- N-up generation with A4 geometry, ordering, RTL, rotated source pages and retained text.
- Booklet saddle-stitch ordering, padding, duplex/spine behavior, rotated content and retained text.
- Crop/resize selective page boxes, rotated sources, A4/custom target geometry, qpdf validity and retained text.
- Existing Frontend, Backend, Deployment, image inventory and PDF-to-Office gates remain in place.

## Architecture

No new application runtime package was added for N-up, booklet, crop or resize; these use the existing browser-side `pdf-lib` engine. Backend image extraction and blank-page analysis use Poppler CLI tools in the existing orchestration container rather than adding a Java/PDFBox service.

## Important boundaries

- **Crop is not secure redaction.** It changes visible page boxes; clipped content can remain in PDF content streams and may still be recoverable/readable by specialized tools.
- N-up, booklet and resize embed visible page content into new pages. Interactive annotations/forms are not preserved as interactive controls.
- Browser-local N-up/booklet/crop/resize are bounded to 100 MB input and 500 source pages.
- Blank-page removal is bounded to 100 MB / 300 pages / 700 million analyzed raster pixels and refuses to emit a zero-page PDF.
- PDF → Office release-gate claims remain scoped to the pinned representative corpus; v0.1.4 does not broaden those fidelity claims.

## Remaining external decisions

The self-contained V1.1 PDF-engine roadmap is complete. Multi-party remote signing, cloud-storage connectors, AI summarization and PDF translation remain intentionally outside this release because they require product/provider/credential decisions.
