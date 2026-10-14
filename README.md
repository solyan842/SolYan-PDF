# SolYan PDF

SolYan PDF is a self-hostable, installable PWA for PDF tools and a dedicated **Tiện ích Việt Nam** section. Lightweight operations run in the browser where practical; heavier features are isolated behind replaceable engine services.

## Current capabilities

### Core PDF
- Merge, split, extract, reorder/remove and rotate pages
- OCR-guided Auto Rotate for scanned PDFs: Tesseract OSD analyzes temporary PDFium rasters, then qpdf applies only confident relative page rotations without rasterizing source content
- QR-divider Auto Split for scanned batches using bounded PDFium/OpenCV analysis, qpdf page selection and optional duplex reverse-side skipping
- Advanced split by exact pages per part or best-effort target size, returned as ZIP
- Drag-and-drop page organizer
- Watermark / Stamp with browser-local text or PNG/JPG, page ranges, standard/custom positioning, opacity, rotation and deterministic page/file/date variables
- Page numbers and metadata editing
- Browser-local Auto Rename from PDF.js text geometry without rewriting source PDF bytes
- AES-256 protect/unlock, repair and structural compression through qpdf
- qpdf structural Decompress for inspectable uncompressed streams and disabled object streams
- qpdf web optimization (linearization), annotation/form flattening, and optional image recompression
- qpdf attachment management: list, add, extract and remove embedded files
- qpdf JSON sanitization for regression-tested JavaScript/actions, link annotations, document/XMP metadata and embedded-file structures
- qpdf JSON active-content inspection for reachable JavaScript/actions/triggers, active annotations and attachment references without executing document JavaScript
- Embedded raster-image extraction to ZIP through Poppler `pdfimages`, preserving native encoded formats where supported
- qpdf JSON Image XObject removal from reachable page/Form resources while preserving text, vector content and page content streams
- Conservative blank-page detection/removal: text pages are always kept; text-free pages use bounded Poppler grayscale analysis before qpdf page selection
- Browser-local overlay and PDF → one long page composition
- Browser-local N-up / multi-page-per-sheet layout with A4 portrait/landscape, custom grids, margins, borders and LTR/RTL ordering
- Browser-local saddle-stitch booklet imposition with automatic blank padding, left/right spine, gutter and duplex/manual-pass controls
- Browser-local Poster PDF tiling: split each source page into an X×Y grid of A3/A4/A5/Letter/Legal/Tabloid print sheets with LTR/RTL ordering
- Browser-local split-sections: divide selected PDF pages into a rows×columns grid and export one merged PDF or separate PDF parts in a ZIP
- Browser-local PDF crop with page-range selection and deterministic page-box updates
- Browser-local resize/scale to A0-A6, Letter, Legal or custom page sizes with rotation-aware fitting
- Browser-local bookmark/outline editor with Unicode titles, nested hierarchy, sibling reordering and page destinations
- Browser-local split by bookmark/chapter with selectable outline depth, duplicate-page handling and ZIP export
- Explicit rasterized Color Transform: invert, grayscale, high-contrast and custom two-color output
- Browser-side PDF viewer and editor with add text/image, highlight, rectangle and security-first manual redaction
- AcroForm discovery/filling

### OCR & document intelligence
- PaddleOCR text OCR for images/scanned PDFs
- PP-StructureV3 structured output for layout/table/reading-order workflows
- Scanned table -> Excel (`.xlsx`) export through PP-StructureV3, with multi-page/table results merged into one workbook
- Automatic Tesseract `vie+eng` fallback for image/PDF text OCR
- Tesseract OSD page-orientation analysis with a conservative 14.0 confidence default and optional unanimous-document inference for unresolved pages
- JSON/Markdown/text exports
- CER/WER benchmark harness for Vietnamese OCR quality measurement
- Reproducible 59-sample real-scan Tesseract regression corpus: 9 public-domain modern documents plus 50 proofread historical scan pages from two public-domain Vietnamese works
- Expanded real-scan baseline: average CER **9.41%**, average WER **22.18%** on the pinned corpus/environment

### Conversion
- Word/Excel/PowerPoint/OpenDocument/RTF -> PDF through LibreOffice headless
- Images -> PDF in the browser
- PDF -> PNG/JPEG ZIP in the browser
- PDF -> DOCX/PPTX auto routing through LibreOffice PDF import, with pinned Bloom as a best-effort fallback
- PDF -> XLSX through pinned Bloom, with PP-StructureV3 fallback only when Bloom reports no logical tables
- Round-trip visual-fidelity plus native-OOXML editability benchmark harness for PDF -> Office
- Permanent versioned PDF-to-Office V1 release gate: **27 cases / 68 source pages**, combining the controlled synthetic corpus with pinned public real-world cases and fixed target-specific thresholds
- Current release baselines: synthetic auto benchmark **97.78%** overall with zero page/geometry mismatches; public real-world DOCX/PPTX **96.44%** with editable native text in all 6 cases; scanned-XLSX **9/9 pages** preserved

### Advanced
- Text-level and pixel/layout PDF compare
- Real PKCS#12 cryptographic PDF signing with pyHanko
- PDF/A conversion through the Ghostscript-free OCRmyPDF internal backend
- Multi-step local workflow builder

### Tiện ích Việt Nam
13 utilities covering Vietnamese text, VAT/percentage/age/BMI/air-conditioner calculations, IP/ping, Google keyword position and website ranking.

## Architecture

```text
Browser / Next.js PWA
      |
      v
FastAPI orchestration backend (qpdf + Poppler utilities + network utilities)
      |---------------- OCR service (PaddleOCR + Tesseract fallback/OSD + PDFium/OpenCV analysis)
      |---------------- Office service (LibreOffice + PDF import routing)
      |---------------- Signature service (pyHanko)
      |---------------- Archive service (OCRmyPDF internal PDF/A)
      `---------------- Bloom adapter (optional / external)
```

Browser-side features use `pdf-lib`, `PDF.js` and JSZip where appropriate. Server engines are intentionally isolated so they can be upgraded or replaced independently. The current V1.2 maintained-OSS parity decisions are recorded in `docs/V1.2-PARITY-AUDIT.md`.

## Quick start with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Then open:
- Web UI: `http://localhost:3000`
- API: `http://localhost:8000`

The first OCR request can be slow because Paddle models may need to download inside the OCR container.

## PWA

The frontend includes a web app manifest, scalable icon and a network-first service worker. When served over HTTPS it can be installed from supported desktop/mobile browsers. The service worker only handles same-origin navigation fallback; PDF processing behavior remains unchanged.

## Configuration

Important variables are documented in `.env.example`.

- `NEXT_PUBLIC_API_URL` is baked into the Next.js client at image build time.
- `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CX` are required only for Google keyword-position lookup.
- The default self-hosted stack handles PDF -> DOCX/PPTX through the bundled Office service. `BLOOM_SERVICE_URL` / `BLOOM_API_KEY` enable the optional Bloom fallback and are still required for the PDF -> XLSX primary route. Bloom itself is not bundled into the default compose stack.
- `OCR_XLSX_FALLBACK_TIMEOUT_SECONDS` controls the best-effort PP-StructureV3 fallback used when Bloom finds no logical XLSX table; the default is 900 seconds because CPU-only multi-page scans can take several minutes.
- Private/loopback Ping targets are blocked by default. `ALLOW_PRIVATE_NETWORK_UTILITIES=1` is intended only for trusted self-hosted/LAN deployments.
- `X-Forwarded-For` is ignored unless `TRUST_PROXY_HEADERS=1` is explicitly enabled behind a trusted reverse proxy.

## Security & verification status

GitHub Actions currently verifies:
- production dependency audit with a patched PostCSS override
- Next.js production build
- FastAPI/qpdf backend and hardened network routes
- Real qpdf smoke coverage for linearization, annotation/form flattening and image optimization routes
- Real Tesseract OSD Auto Rotate coverage for 0/90/180/270 page orientation, low-confidence/no-op policy, optional unanimous inference, qpdf relative-rotation composition, qpdf validity and exact byte preservation when no page is changed
- Real QR Auto Split coverage for divider decode, PDFium/OpenCV detection, duplex planning, qpdf validity, no-empty-part behavior and byte-identical no-divider fallback
- Real qpdf structural Decompress coverage for route wiring, retained text, qpdf validity and inspectable uncompressed content
- Real browser-local Auto Rename coverage for PDF.js title geometry, filename sanitation, bounded analysis and unchanged source bytes
- Real browser-local Stamp coverage for selected-page text/image stamping and deterministic variables
- Exact rasterized Color Transform pixel semantics, alpha preservation, bounded pipeline and explicit loss-of-interactivity boundary
- Secure Redaction coverage requiring qpdf validity, retained text on untouched pages and absence of the redacted secret from both `pdftotext` and expanded QDF output
- Real qpdf JSON active-content sanitization across catalog/page additional actions, OpenAction, JavaScript name trees/actions, URI links, XMP/Info metadata, EmbeddedFiles/AF/FileAttachment structures, plus selective-mode preservation of unselected categories
- Real qpdf JSON active-content inspection covering reachable direct/stream JavaScript, URI/Launch actions, OpenAction/AA/A/XFA triggers, Screen/FileAttachment annotations, embedded-file references, encrypted input and dead-object exclusion
- Real Poppler `pdfimages` extraction on a PDF containing an embedded Image XObject, including ZIP validation and no-image/error cases
- Real qpdf JSON image-removal gate covering reachable page-tree resources, inherited page resources, direct and nested Form Image XObjects, dead-page exclusion, preservation of non-image Form resources and text/content streams, zero remaining `pdfimages`, qpdf validity, Poppler renderability and idempotence
- Real conservative blank-page removal on controlled blank/vector/text pages, requiring only the truly blank page to be removed
- Real browser-local N-up generation with A4 geometry, ordering, RTL, source rotation and retained-text checks
- Real browser-local booklet imposition with saddle-stitch order, blank padding, duplex/spine behavior, source rotation and retained-text checks
- Real browser-local Poster PDF gate covering RTL tile order, real LTR/RTL text placement, target paper geometry, offset CropBox, 90° rotation and qpdf validity
- Real browser-local split-sections gate covering page-selection semantics, column-major/top-to-bottom section order, merged and per-part output, offset CropBox + 90° rotation, retained text and qpdf validity
- Real browser-local crop/resize geometry with selective page boxes, rotated source pages, A4/custom target sizes, qpdf validation and retained-text checks
- Real browser-local bookmark/outline round-trip with Unicode titles, nested hierarchy, sibling links, page clamping, replacement/removal and qpdf object-graph validation
- Real browser-local split-by-bookmarks gate covering outline depth, physical-page ordering, duplicate-start behavior, safe filenames, real page extraction and qpdf validation
- OCR binary proxy behavior for scanned-table XLSX downloads
- PaddleOCR service API/lazy-load wiring
- Real Vietnamese Tesseract fallback smoke test
- 59-sample Vietnamese real-scan Tesseract regression gate with source-level CER/WER checks
- Real LibreOffice DOCX -> PDF conversion
- PDF -> DOCX/PPTX LibreOffice import compatibility and auto-routing benchmark coverage
- Pinned Bloom PDF -> Office canary/synthetic compatibility coverage
- Permanent PDF-to-Office synthetic V1 release gate
- Permanent PDF-to-Office public real-world V1 release gate, including scanned-XLSX preservation
- Real PKCS#12 PDF signing
- Real PDF/A conversion using the internal non-Ghostscript backend
- Docker Compose model and frontend/backend image builds

The frontend also sends baseline `nosniff`, frame-denial, referrer and permissions-policy headers.

## Benchmarking

See `docs/BENCHMARKING.md` for:
- Vietnamese OCR CER/WER measurement and pinned real-scan provenance
- PDF -> Office round-trip visual-fidelity and OOXML-editability testing
- the versioned PDF-to-Office V1 release policy and target-specific acceptance thresholds

## Known boundaries

- The 59-sample OCR corpus is a regression baseline, not a claim of universal Vietnamese OCR accuracy across every scan style or document class.
- Passing the PDF-to-Office V1 release gate establishes a reproducible supported baseline for the pinned representative corpus; it is not a claim that every arbitrary PDF will convert with the same fidelity.
- PDF -> XLSX still depends on the optional external Bloom service for its primary route; PP-StructureV3 is a bounded fallback for scanned/no-logical-table cases rather than a universal spreadsheet reconstruction engine.
- Auto Rotate is bounded to 50 MB / 300 PDF pages for OCR analysis. The default OSD confidence threshold is 14.0; unresolved, blank or lower-confidence pages remain unchanged unless optional inference is enabled and every confident page agrees on one correction. Only temporary analysis rasters are created; the output PDF is changed through relative qpdf page rotation. If no page needs rotation, the original PDF bytes are returned unchanged. Any actual rotation rewrite can invalidate existing digital signatures.
- Auto Split QR is bounded to the documented scan/page pixel limits and recognizes the exact SolYan divider marker. Divider pages are removed; duplex mode may also skip the reverse side. Detection uses temporary PDFium rasters while output parts use qpdf page selection.
- Structural Decompress is for inspection/debugging, not smaller files. It rewrites stream/object representation and can invalidate existing digital signatures.
- Auto Rename is a deterministic PDF.js text-layer heuristic, not AI. Scanned/image-only PDFs without usable text retain the original filename until OCR is explicitly performed; the PDF bytes themselves are not rewritten by Auto Rename.
- Color Transform intentionally rasterizes the full output. Selectable text, vector content, forms and annotations from the source are not retained as interactive source structures.
- Security-first Editor redaction rasterizes only the selected page at 150 DPI after burning the redaction box, then rebuilds the PDF without copying that page's original content stream. The redacted page loses selectable text/vector/form/annotation interactivity and its displayed rotation is normalized. Document-level catalog structures such as bookmarks, attachments, AcroForm and metadata are not guaranteed to be preserved in this security-first path.
- qpdf image optimization can recompress eligible non-JPEG images as JPEG when that reduces file size; this mode is intentionally separate from the structural/lossless optimization route because JPEG recompression is lossy.
- PDF sanitization is a bounded removal of regression-tested standard PDF active-content structures, **not antivirus or universal exploit detection**. It does not claim to detect every malicious PDF technique. Rewriting/removing content changes the document and therefore invalidates existing digital signatures.
- Active-content inspection is structural-only and bounded to 100 MB input, 500 findings, 64 KiB per displayed script and 256 KiB aggregate displayed script text. It walks only the object graph reachable from the trailer/root, never executes document JavaScript, and **does not claim antivirus coverage or prove that a PDF is safe**.
- Embedded-image extraction is bounded to 100 MB input, 2,000 listed images, 100 megapixels per image, 1 gigapixel aggregate and 512 MB extracted/archive payload to limit decompression/resource abuse.
- Image removal is bounded to 100 MB input, 2,000 reachable pages, 10,000 page-tree nodes and 20,000 resource dictionaries. It removes reachable `/Subtype /Image` XObject entries from page resources and nested Form XObject resources while leaving page/Form content streams intact; unreachable/dead page objects are not used to plan removals. Inline images encoded directly in content streams with `BI … ID … EI` are not removed in this V1.2 scope. Rewriting the PDF invalidates existing digital signatures.
- Blank-page removal is bounded to 100 MB / 300 pages / 700 million raster-analysis pixels. The default 10 / 99.9% threshold is configurable, and the service refuses to emit a zero-page PDF when every page is classified blank.
- N-up, booklet, crop and page-resize operations are browser-local and bounded to 100 MB / 500 source pages. N-up/booklet/resize embed visible page content into new pages, so interactive form/annotation controls are not preserved as interactive controls.
- Poster PDF is browser-local and bounded to 100 MB, 100 source pages and 1,000 output sheets. It normalizes visible CropBox/rotation and creates new printable pages; interactive form/annotation controls are not preserved as interactive controls.
- Split-sections is browser-local and bounded to 100 MB, 300 source pages, an 8×8 grid and 1,000 output pieces. It rebuilds pages from visible content after CropBox/rotation normalization; interactive form/annotation controls are not preserved as interactive controls and existing digital signatures are invalidated by the rewrite.
- The bookmark editor writes standards-based direct page destinations. It reads direct `/Dest` and `/A /GoTo` outline destinations; named or unusual destination forms that cannot be resolved are shown as page 1 instead of being guessed. Writing a new outline changes the PDF and invalidates existing digital signatures.
- Split-by-bookmarks is bounded to 100 MB / 500 pages / 500 chapters. Child PDFs are page copies; interactive form/annotation controls and the original outline are not guaranteed to survive in each child. Named or unusual outline destinations inherit the bookmark parser boundary and may resolve to page 1.
- Crop changes page boxes rather than securely deleting clipped content. It must not be used as a substitute for secure redaction; data outside the visible crop can remain in the PDF content streams.
- Cloud-storage connectors, multi-party remote signing, AI summarization and PDF translation require product/provider decisions and are not part of the self-contained V1 stack yet.

## License

SolYan PDF source code is licensed under the **Apache License 2.0**. See `LICENSE`.

Third-party components retain their respective licenses and attribution requirements. See `docs/DEPENDENCIES.md` and `NOTICE`.

See `docs/ROADMAP.md` for the exact implementation status and remaining work.
