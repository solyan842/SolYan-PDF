# SolYan PDF v0.1.2

This patch release hardens the **experimental PDF -> DOCX/XLSX/PPTX** integration without changing its product-status label.

## Highlights

- Exact pinned Bloom upstream integration remains at `9ed16c43e356cffd4bd3b004b0dab19e582a59d5` with a visible SolYan-owned patch applied after checkout.
- Added a controlled 18-case synthetic round-trip corpus: 6 DOCX, 6 XLSX and 6 PPTX cases.
- Full synthetic gate now requires zero page-count mismatches, zero unmatched pages and zero geometry mismatches.
- Added conservative XLSX print-layout normalization based on the source PDF paper size/orientation.
- Fixed Bloom table fragmentation caused by tall/short cells sharing a logical row.
- Fixed sparse invoice title/metadata blocks being misclassified as a separate borderless table/worksheet.
- Preserved legitimate merged-cell table detection with dedicated regression coverage.
- Added XLSX worksheet diagnostics for future pagination failures.
- Geometry comparison now tolerates sub-percent renderer rounding noise while retaining hard failures for meaningful layout mismatch.

## Verification

The release candidate has passed:

- the pinned Bloom 3-case DOCX/XLSX/PPTX canary;
- Bloom TypeScript typecheck and relevant upstream tests;
- SolYan table-detection regressions;
- the full controlled 18-case PDF -> Office -> PDF synthetic compatibility gate.

## Important status note

PDF -> DOCX/XLSX/PPTX remains **Experimental**. Passing the synthetic compatibility gate does not establish representative real-world fidelity. Broad quality claims remain blocked until representative DOCX/XLSX/PPTX release corpora and target-specific acceptance thresholds are versioned and accepted.

The default six-service Compose stack, core PDF tools, OCR, Office -> PDF, signing, PDF/A and Vietnamese utilities remain unchanged from the supported V1 surface.
