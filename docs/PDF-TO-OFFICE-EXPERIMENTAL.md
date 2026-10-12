# Experimental PDF -> Office integration

SolYan PDF keeps PDF -> DOCX/XLSX/PPTX behind an optional external adapter. It is not part of the default production Compose stack and remains labelled **Experimental**.

## Upstream canary pin

The integration canary currently tests against:

- repository: `stemlen/bloom-pdf-editor`
- commit: `9ed16c43e356cffd4bd3b004b0dab19e582a59d5`
- upstream license at that commit: Apache-2.0
- standalone server port: `8787`

The canary pin is deliberately exact. Updating it requires a PR, a license re-check and fresh canary/full-benchmark runs.

SolYan applies a repository-owned patch after checking out that exact upstream commit. The patch is visible under `patches/bloom/`; the upstream pin is not silently moved or replaced by a fork.

## Container storage requirement

At the pinned commit, Bloom defaults `storage.root` to `./.bloom-storage`, while its standalone Docker image runs as the non-root `bloom` user. A relative storage root under `/app` is therefore not writable in that image.

Bloom exposes the supported `BLOOM_STORAGE_ROOT` configuration variable, so the SolYan canary sets:

```text
BLOOM_STORAGE_ROOT=/tmp/bloom-storage
```

This keeps the upstream image and non-root runtime unchanged while placing temporary canary storage in a writable location. A production operator using the optional Bloom service should provide an appropriate writable/persistent storage root for the deployment model.

## XLSX print-layout normalization

The pinned Bloom XLSX exporter writes worksheet cells, row heights and column widths but does not emit print-page setup metadata. In the controlled `xlsx-financial` canary this caused a one-page PDF source to round-trip through XLSX/LibreOffice as two PDF pages even though the first page itself was visually close.

SolYan does **not** assume A4 for every document. Before requesting Bloom conversion for XLSX, the backend uses its already-required qpdf engine to inspect page 1 of the original PDF:

1. `qpdf --show-pages` identifies the first page object.
2. qpdf JSON object inspection reads `/MediaBox` and inherited `/Rotate`, following `/Parent` where necessary.
3. The effective page dimensions are matched, with a small producer-rounding tolerance, to a known standard paper size.
4. Current recognized print sizes are Letter, Tabloid, Legal, A3, A4 and A5.
5. Unknown/custom page sizes are left untouched; SolYan returns Bloom's XLSX without adding print setup.

When a known page size is detected, SolYan applies a conservative OpenXML post-process to Bloom XLSX results:

- if a worksheet already contains `<pageSetup>`, SolYan leaves it unchanged;
- otherwise SolYan enables `fitToPage`, preserves the source portrait/landscape orientation, writes the matching OOXML `paperSize`, and sets `fitToWidth=1`, `fitToHeight=0`;
- cell values, formulas, styles, row/column geometry and existing page setup are not modified;
- malformed/non-ZIP output is returned unchanged rather than rewritten.

## Bloom table-candidate compatibility patch

The pinned Bloom table detector originally compared a new text node with only the last node appended to the current vertical cluster. A tall earlier cell can extend below a later short cell in the same logical row, so that comparison can create a false `>48pt` gap and fragment one logical source table into multiple `LogicalTable` objects and therefore multiple XLSX worksheets.

SolYan's patch tracks the bottom edge of the whole current cluster instead. A dedicated Vitest regression reproduces the tall-cell case and requires the detector to keep the logical lattice intact.

The 18-case benchmark then exposed a second issue in `xlsx-invoice`: sparse title/metadata text such as `Invoice table`, `INVOICE` and `INV-2026-1012` could be accepted as a separate borderless table. SolYan therefore adds a narrow borderless-table gate requiring repeated two-dimensional alignment support while preserving vector-bordered tables and legitimate two-row merged-cell layouts. A second regression test protects this behavior.

## Three-case canary

`.github/workflows/bloom-canary-ci.yml` builds the pinned Bloom standalone server plus the SolYan Office and backend images, then runs one controlled synthetic case for each target:

- DOCX: mixed narrative/table layout
- XLSX: financial table layout
- PPTX: chart-like slide layout

For each case the workflow exercises the whole path:

`PDF -> SolYan backend adapter -> pinned Bloom -> Office file -> SolYan Office service -> PDF -> visual similarity report`

The canary requires successful conversion, non-empty output and a valid PDF round-trip. It records similarity scores and checks controlled pagination/geometry behavior, but it does **not** claim broad real-world fidelity.

## 18-case controlled synthetic gate

`.github/workflows/bloom-full-benchmark-ci.yml` runs a controlled corpus of 18 cases: 6 DOCX, 6 XLSX and 6 PPTX. The full gate also runs Bloom TypeScript typecheck, the relevant upstream tests and SolYan-owned regressions before building the benchmark stack.

For the current pinned Bloom commit plus SolYan patch, the full controlled synthetic gate passes with:

- zero page-count mismatches;
- zero unmatched pages;
- zero geometry mismatches;
- successful round trips for all 18 cases.

The benchmark includes XLSX package diagnostics (worksheet count, worksheet dimensions, row/column geometry, page setup and cell previews) so future pagination failures can be localized without weakening the acceptance gate.

## What these gates do not prove

The three-case canary and 18-case synthetic corpus are compatibility/regression gates, not a representative product-quality benchmark. They do not replace:

- representative real-world PDF -> DOCX corpora;
- representative real-world PDF -> XLSX corpora;
- representative real-world PDF -> PPTX corpora;
- agreed target-specific acceptance thresholds;
- manual inspection of difficult typography, tables, charts and slide layouts.

PDF -> Office therefore remains labelled **Experimental** until the representative release-corpus items in `docs/ROADMAP.md` are completed and accepted.
