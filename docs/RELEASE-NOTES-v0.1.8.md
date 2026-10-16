# SolYan PDF v0.1.8

V1.5 completes the current OSS-first self-contained parity pass without adding a new application runtime, hosted provider or credential dependency.

## Highlights

- **PDF → SVG** with vector-first Poppler export and bounded fallback behavior.
- **Certified PDF signing / DocMDP** on the existing local PKCS#12 + pyHanko path, with explicit certification permissions.
- **PDF Portfolio / Collection** using standard embedded-file collection structures and the existing qpdf stack.
- **PDF Page Labels** for logical Arabic, Roman, alphabetic and prefix-based labels without drawing numbers into page content.
- **Safe Regex Auto Redact** with an intentionally bounded regex subset and practical presets.
- **Unicode Whole Word Auto Redact** with NFC normalization and Unicode-aware word boundaries suitable for Vietnamese text.
- **Full Page Flatten** as an explicit destructive raster mode, kept separate from forms/annotations flattening.
- **Advanced Page Numbers / Bates** with position, margins, templates, start number, zero-padding, font, size and color controls.
- **Advanced Metadata** editing with creation/modification dates, Trapped, bounded custom fields and an explicit delete-all path.
- **Advanced PDF → Images** with page ranges, real DPI, PNG/JPEG/WebP, color modes, annotation control and ZIP or single vertical-image output.
- **Advanced Images → PDF** with image-size or A4 Fit/Fill pages, auto-rotate and Color/Greyscale/B&W modes.

## Architecture and verification

V1.5 reuses qpdf, Poppler, pyHanko, PDF.js, Canvas, pdf-lib and JSZip already present in SolYan PDF. No new application runtime is introduced by the accepted V1.5 scope.

The established PDF → Office V1 release gate remains unchanged at **27 cases / 68 source pages**. Its routing, editability, page-count, geometry and fidelity requirements are not weakened by this release.

Detailed V1.5 research, decisions and scope are recorded in:

- `docs/V1.5-PARITY-AUDIT.md`
- `docs/V1.5-PARITY-STATUS.md`
- `docs/V1.5-CLOSEOUT.md`

## Important boundaries

- Security-first Auto Redact rebuilds affected pages from raster output so matched source content is not retained. Those affected pages lose original interactive/vector structures.
- Safe Regex is opt-in. Literal remains the default, and Whole Word remains a Unicode-aware literal mode rather than an implicit regex rewrite.
- Full Page Flatten is intentionally destructive rasterization; it is not the same operation as qpdf forms/annotations flattening.
- Certification signing is local PKCS#12 signing with DocMDP semantics. Remote/multi-party signing and hosted key custody are not included.
- Page Labels change logical PDF page labels, not visible page-number artwork.
- Metadata editing does not claim arbitrary XMP synchronization.
- Browser image export/import remains bounded by browser rendering/encoding capabilities; TIFF is not added without a justified codec/runtime expansion.
- PDF Portfolio presentation can vary by PDF viewer even though the collection/embedded-file structures are standards-based.

## Deliberately outside V1.5

Cloud-storage connectors, remote or multi-party signing/key custody, AI summarization, document translation and other provider-backed features remain separate product/provider/credential decisions.
