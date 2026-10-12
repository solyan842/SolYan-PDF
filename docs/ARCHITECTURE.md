# SolYan PDF Architecture

## Principles

1. **Do not rewrite mature engines without a reason.** Prefer well-maintained open-source components with clear licenses.
2. **Keep engines replaceable.** Product code talks to adapters, not directly to every external binary/library.
3. **Prefer client-side processing** for lightweight operations where privacy and performance benefit.
4. **Use server-side workers** for OCR, Office conversion, large files and CPU-heavy jobs.
5. **Keep license boundaries explicit.** AGPL/commercial/open-core projects may be studied or isolated, but must not be copied into the core without a deliberate license decision.

## Proposed layers

```text
Browser
  │
  ├─ Frontend (React/Next.js)
  │    ├─ PDF viewer/editor UI
  │    ├─ lightweight client-side tools
  │    └─ Vietnamese Utilities UI
  │
  └─ Backend API
       ├─ upload/session layer
       ├─ job dispatcher
       ├─ storage abstraction
       └─ engine adapters
            ├─ qpdf
            ├─ PDFBox
            ├─ pdfcpu
            ├─ PaddleOCR
            ├─ Tesseract fallback
            └─ LibreOffice headless
```

## Engine responsibilities

### qpdf
Primary structural engine for:
- merge / split
- page selection
- encryption / decryption
- linearization
- structural inspection and repair workflows

### Apache PDFBox
Advanced PDF operations:
- metadata
- forms
- annotations
- rendering/content operations
- text/image extraction where suitable

### pdfcpu
Utility engine:
- watermark / stamp
- page layout
- validation
- extraction
- selected optimization operations

### Browser PDF layer
Candidates:
- PDF.js for rendering/viewer
- LibPDF-js and/or pdf-lib for browser-side manipulation

Use an adapter boundary so the browser manipulation library can be changed later.

### OCR / document intelligence
Primary: PaddleOCR / PP-Structure family.
Fallback/lightweight: Tesseract.

Target capabilities:
- text OCR
- document layout
- tables
- reading order
- structured export

### Office conversion
LibreOffice headless is the initial Office-to-PDF service.
PDF-to-Office remains a separate R&D track because layout fidelity is significantly harder.

## Advanced modules to research before implementing

- PDF editor: evaluate permissively licensed editor projects and reusable modules.
- PDF compare: combine text/layout/image comparison rather than simple text diff only.
- E-sign: implement core signing separately; evaluate self-hosted signing projects for architecture/workflow ideas while respecting licenses.
- PDF-to-DOCX/XLSX/PPTX: benchmark existing open-source document-intelligence/conversion projects before writing custom conversion code.

## Vietnamese Utilities

The Vietnamese Utilities section is logically separate from PDF engines and should consist of small independent modules.

### Client-side preferred
- number to Vietnamese text
- remove Vietnamese diacritics
- case conversion
- word/character count
- VAT calculations
- percentage calculations
- age calculation
- BMI
- air-conditioner capacity estimation

### Server/network dependent
- public IP lookup
- ping/website reachability
- keyword-position checking
- website-ranking/replacement metric

Network-dependent tools must use server-side APIs where browser security/CORS or search-provider restrictions prevent reliable direct execution.

## Non-goals for bootstrap

- No production engine integration yet.
- No authentication/account system yet.
- No SaaS billing.
- No assumption that a third-party project's full source can be embedded merely because the repository is public.
