# SolYan PDF

SolYan PDF is a self-hostable, web-first PDF toolkit with a dedicated **Tiện ích Việt Nam** section. Lightweight operations run in the browser where practical; heavier features are isolated behind replaceable engine services.

## Current capabilities

### Core PDF
- Merge, split, extract, reorder/remove and rotate pages
- Watermark, page numbers and metadata editing
- AES-256 protect/unlock, repair and structural compression through qpdf
- Browser-side PDF viewer and basic editor
- AcroForm discovery/filling

### OCR & document intelligence
- PaddleOCR text OCR for images/scanned PDFs
- PP-StructureV3 structured output for layout/table/reading-order workflows
- JSON/Markdown/text exports

### Conversion
- Word/Excel/PowerPoint/OpenDocument/RTF -> PDF through LibreOffice headless
- Images -> PDF in the browser
- PDF -> PNG/JPEG ZIP in the browser
- Experimental PDF -> DOCX/XLSX/PPTX adapter for a separately deployed, pinned Bloom service

### Advanced
- Text-level PDF compare
- Real PKCS#12 cryptographic PDF signing with pyHanko
- PDF/A conversion through the Ghostscript-free OCRmyPDF internal backend
- Multi-step local workflow builder

### Tiện ích Việt Nam
13 utilities covering Vietnamese text, VAT/percentage/age/BMI/air-conditioner calculations, IP/ping, Google keyword position and website ranking.

## Architecture

```text
Browser / Next.js
      |
      v
FastAPI orchestration backend (qpdf + network utilities)
      |---------------- OCR service (PaddleOCR)
      |---------------- Office service (LibreOffice)
      |---------------- Signature service (pyHanko)
      |---------------- Archive service (OCRmyPDF internal PDF/A)
      `---------------- Bloom adapter (optional / experimental / external)
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

## Configuration

Important variables are documented in `.env.example`.

- `NEXT_PUBLIC_API_URL` is baked into the Next.js client at image build time.
- `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CX` are required only for Google keyword-position lookup.
- `BLOOM_SERVICE_URL` / `BLOOM_API_KEY` are required only for experimental PDF -> Office conversion. Bloom is not bundled into the default compose stack.

## Verification status

GitHub Actions currently verifies:
- Next.js production build
- FastAPI/qpdf backend and network routes
- PaddleOCR service API/lazy-load wiring
- Real LibreOffice DOCX -> PDF conversion
- Real PKCS#12 PDF signing
- Real PDF/A conversion using the internal non-Ghostscript backend

## Known boundaries

- PDF compare is currently text-level, not pixel/layout visual diff.
- PDF -> DOCX/XLSX/PPTX is **Experimental** until fidelity benchmarking is completed.
- OCR Vietnamese quality benchmarking and Tesseract fallback remain follow-up work.
- Cloud-storage connectors, AI summarization and PDF translation are not implemented yet.

See `docs/ROADMAP.md` for the exact implementation status and remaining work.
