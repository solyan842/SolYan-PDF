# SolYan PDF v0.1.3

This patch release promotes the evidence-backed multi-engine **PDF → Office** path to the versioned V1 release-gated surface and strengthens Vietnamese OCR / scanned-table regression coverage.

## Highlights

- PDF → DOCX/PPTX now uses LibreOffice PDF import first, with the pinned Bloom service as a best-effort fallback.
- PDF → XLSX keeps pinned Bloom as the primary route and uses PP-StructureV3 only when Bloom reports no logical tables.
- Added native OOXML editability diagnostics so DOCX/PPTX output is evaluated for editable text as well as rendered visual similarity.
- Locked a permanent `pdf-to-office-release-v1` policy covering **27 cases / 68 source pages** across controlled synthetic and pinned public real-world documents.
- Expanded the reproducible Vietnamese OCR corpus to **59 real scanned samples**, with average Tesseract fallback baseline CER **9.41%** / WER **22.18%**.
- Scanned PDF → XLSX preservation now retains **9/9 source pages** across the pinned public scan corpus, including a raster worksheet fallback when a page contains no usable recognized cells.

## PDF → Office verification

Accepted V1 baselines include:

- controlled 18-case synthetic auto-routing corpus: **97.78%** overall similarity;
- synthetic DOCX: **96.40%**;
- synthetic PPTX: **98.76%**;
- synthetic XLSX: **98.17%**;
- public 6-case / 41-page DOCX/PPTX corpus: **96.44%** overall;
- public DOCX: **97.46%** across 7/7 pages;
- public PPTX: **95.42%** across 34/34 pages;
- editable native DOCX/PPTX text present in all 6 public cases;
- zero accepted page-count, unmatched-page or geometry mismatches;
- scanned-XLSX corpus: **9/9 source pages** preserved.

These measurements are reproducible release baselines for the pinned corpus, not a claim that every arbitrary PDF will convert with the same fidelity.

## Routing and deployment note

The default self-hosted stack can handle PDF → DOCX/PPTX through the bundled LibreOffice service. Bloom remains an optional external engine for DOCX/PPTX fallback and is still the primary route for PDF → XLSX; PP-StructureV3 provides the bounded scanned/no-logical-table XLSX fallback.

## Remaining optional product decisions

Cloud-storage connectors, multi-party remote signing, AI summarization and PDF translation remain outside the self-contained V1 stack because they require separate provider, credential or product decisions.
