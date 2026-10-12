# Experimental PDF -> Office integration

SolYan PDF keeps PDF -> DOCX/XLSX/PPTX behind an optional external adapter. It is not part of the default production Compose stack and remains labelled **Experimental**.

## Upstream canary pin

The integration canary currently tests against:

- repository: `stemlen/bloom-pdf-editor`
- commit: `9ed16c43e356cffd4bd3b004b0dab19e582a59d5`
- upstream license at that commit: Apache-2.0
- standalone server port: `8787`

The canary pin is deliberately exact. Updating it requires a PR, a license re-check and a fresh end-to-end canary run.

## Container storage requirement

At the pinned commit, Bloom defaults `storage.root` to `./.bloom-storage`, while its standalone Docker image runs as the non-root `bloom` user. A relative storage root under `/app` is therefore not writable in that image.

Bloom exposes the supported `BLOOM_STORAGE_ROOT` configuration variable, so the SolYan canary sets:

```text
BLOOM_STORAGE_ROOT=/tmp/bloom-storage
```

This keeps the upstream image and non-root runtime unchanged while placing temporary canary storage in a writable location. A production operator using the optional Bloom service should provide an appropriate writable/persistent storage root for the deployment model.

## XLSX print-layout normalization

The pinned Bloom XLSX exporter writes worksheet cells, row heights and column widths but does not emit print-page setup metadata. In controlled round-trip benchmarks this can make a one-page PDF become multiple PDF pages after XLSX -> LibreOffice -> PDF even when the reproduced content itself is visually close.

SolYan does **not** assume A4 for every document. Before requesting Bloom conversion for XLSX, the backend uses its already-required qpdf engine to inspect the original PDF:

1. `qpdf --show-npages` records the source page count.
2. `qpdf --show-pages` identifies the first page object.
3. qpdf JSON object inspection reads `/MediaBox` and inherited `/Rotate`, following `/Parent` where necessary.
4. The effective page dimensions are matched, with a small producer-rounding tolerance, to a known standard paper size.
5. Current recognized print sizes are Letter, Tabloid, Legal, A3, A4 and A5.
6. Unknown/custom page sizes are left untouched; SolYan returns Bloom's XLSX without adding print setup.

When a known page size is detected, SolYan applies a conservative OpenXML post-process to Bloom XLSX results:

- if a worksheet already contains `<pageSetup>`, SolYan leaves it unchanged;
- otherwise SolYan enables `fitToPage`, preserves the source portrait/landscape orientation and writes the matching OOXML `paperSize`;
- horizontal pagination is normalized with `fitToWidth=1`;
- vertical fitting is forced with `fitToHeight=1` **only** when the original PDF has exactly one page and Bloom produced exactly one worksheet;
- multi-page PDFs or XLSX files containing multiple worksheets retain unlimited vertical pagination with `fitToHeight=0`, avoiding an unsafe attempt to squeeze arbitrary documents into one printed page;
- cell values, formulas, styles, row/column geometry and existing page setup are not modified;
- malformed/non-ZIP output is returned unchanged rather than rewritten.

The Bloom canary requires the controlled XLSX case to preserve page count after the Office -> PDF round-trip. The full 18-case synthetic benchmark also runs whenever the XLSX/Bloom conversion adapter changes, so regressions across the six controlled XLSX layouts are visible before merge. The visual-similarity benchmark separately penalizes missing/extra pages, so pagination errors cannot be hidden by a high first-page score.

## What the canary proves

`.github/workflows/bloom-canary-ci.yml` builds the pinned Bloom standalone server plus the SolYan Office and backend images, then runs one controlled synthetic case for each target:

- DOCX: mixed narrative/table layout
- XLSX: financial table layout
- PPTX: chart-like slide layout

For each case the workflow exercises the whole path:

`PDF -> SolYan backend adapter -> pinned Bloom -> Office file -> SolYan Office service -> PDF -> visual similarity report`

The workflow requires successful conversion, non-empty output and a valid PDF round-trip. It records similarity scores but does **not** enforce broad product fidelity thresholds. The XLSX canary additionally requires page-count preservation for its controlled one-page source.

## Full controlled synthetic benchmark

`.github/workflows/bloom-full-benchmark-ci.yml` runs all 18 controlled synthetic cases (6 DOCX, 6 XLSX, 6 PPTX) against the same pinned Bloom commit. It runs on relevant conversion/benchmark changes, can be dispatched manually and also runs weekly. Its JSON artifact records per-case similarity, timings and page-count drift.

This full synthetic benchmark is a regression and diagnosis tool, not a substitute for real-world release acceptance data.

## What the canary and synthetic corpus do not prove

Neither the three-case canary nor the 18-case synthetic corpus is a release-quality real-world benchmark. They do not replace:

- representative real-world PDF -> Office corpora;
- target-specific acceptance thresholds;
- manual inspection of difficult tables, typography, charts and slide layouts.

Broad quality claims remain blocked until the representative release-corpus items in `docs/ROADMAP.md` are completed.
