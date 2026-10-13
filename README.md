# SolYan PDF

SolYan PDF is a self-hostable, installable PWA for PDF tools and a dedicated **Tiện ích Việt Nam** section. Lightweight operations run in the browser where practical; heavier features are isolated behind replaceable engine services.

## Current capabilities

### Core PDF
- Merge, split, extract, reorder/remove and rotate pages
- Drag-and-drop page organizer
- Watermark, page numbers and metadata editing
- AES-256 protect/unlock, repair and structural compression through qpdf
- qpdf web optimization (linearization), annotation/form flattening, and optional image recompression
- Browser-side PDF viewer and basic editor
- AcroForm discovery/filling

### OCR & document intelligence
- PaddleOCR text OCR for images/scanned PDFs
- PP-StructureV3 structured output for layout/table/reading-order workflows
- Scanned table -> Excel (`.xlsx`) export through PP-StructureV3, with multi-page/table results merged into one workbook
- Automatic Tesseract `vie+eng` fallback for image/PDF text OCR
- JSON/Markdown/text exports
- CER/WER benchmark harness for Vietnamese OCR quality measurement
- Reproducible 59-sample real-scan Tesseract regression corpus: 9 public-domain modern documents plus 50 proofread historical scan pages from two public-domain works
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
FastAPI orchestration backend (qpdf + network utilities)
      |---------------- OCR service (PaddleOCR + Tesseract fallback)
      |---------------- Office service (LibreOffice + PDF import routing)
      |---------------- Signature service (pyHanko)
      |---------------- Archive service (OCRmyPDF internal PDF/A)
      `---------------- Bloom adapter (optional / external)
```

Browser-side features use `pdf-lib`, `PDF.js` and JSZip where appropriate. Server engines are intentionally isolated so they can be upgraded or replaced independently.

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
- qpdf image optimization can recompress eligible non-JPEG images as JPEG when that reduces file size; this mode is intentionally separate from the structural/lossless optimization route because JPEG recompression is lossy.
- Cloud-storage connectors, multi-party remote signing, AI summarization and PDF translation require product/provider decisions and are not part of the self-contained V1 stack yet.

## License

SolYan PDF source code is licensed under the **Apache License 2.0**. See `LICENSE`.

Third-party components retain their respective licenses and attribution requirements. See `docs/DEPENDENCIES.md` and `NOTICE`.

See `docs/ROADMAP.md` for the exact implementation status and remaining work.
