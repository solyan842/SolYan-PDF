# Windows D5 PDF/A native proof (isolated probe)

Branch: `feat/windows-desktop-d5-pdfa-probe`. This is a bounded CI experiment,
not a product release or a merged service.

Reuses `engines/archive-service/app/main.py` unchanged and tests it on a real
`windows-latest` runner with OCRmyPDF 17.13.0 and pikepdf PDF/A.

Internal PDF/A backend is deliberately **no Ghostscript fallback**. OCRmyPDF
17.13.0 requires no veraPDF for its internal speculative PDF/A compliance
check; pikepdf checks the proposed PDF/A output. A clean one-page test can
prove feasibility only, **not** compliance for every PDF.

No converter UI or Windows installer is advertised until:
1. native Windows direct smoke PASS;
2. a frozen local archive sidecar is tested and token-protected;
3. NSIS includes it, proves start/stop without orphans;
4. PDF-to-Office and OCR release gates remain unchanged.

See official OCRmyPDF 17.13.0 docs, `installation` and `advanced`, for
limitations and conversion error semantics.
