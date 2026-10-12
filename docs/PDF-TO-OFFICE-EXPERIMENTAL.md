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

The Bloom canary requires the controlled XLSX case to preserve page count after the Office -> PDF round-trip. The visual-similarity benchmark separately penalizes missing/extra pages, so pagination errors cannot be hidden by a high first-page score.

## What the canary proves

`.github/workflows/bloom-canary-ci.yml` builds the pinned Bloom standalone server plus the SolYan Office and backend images, then runs one controlled synthetic case for each target:

- DOCX: mixed narrative/table layout
- XLSX: financial table layout
- PPTX: chart-like slide layout

For each case the workflow exercises the whole path:

`PDF -> SolYan backend adapter -> pinned Bloom -> Office file -> SolYan Office service -> PDF -> visual similarity report`

The workflow requires successful conversion, non-empty output and a valid PDF round-trip. It records similarity scores but does **not** enforce broad product fidelity thresholds. The XLSX canary additionally requires page-count preservation for its controlled one-page source.

## What the canary does not prove

A three-case synthetic canary is an integration and compatibility gate, not a release-quality benchmark. It does not replace:

- the 18-case controlled synthetic corpus;
- representative real-world PDF -> Office corpora;
- target-specific acceptance thresholds;
- manual inspection of difficult tables, typography, charts and slide layouts.

Broad quality claims remain blocked until the representative release-corpus items in `docs/ROADMAP.md` are completed.
