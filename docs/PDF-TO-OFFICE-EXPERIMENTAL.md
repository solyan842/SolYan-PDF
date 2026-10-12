# Experimental PDF -> Office integration

SolYan PDF keeps PDF -> DOCX/XLSX/PPTX behind an optional external adapter. It is not part of the default production Compose stack and remains labelled **Experimental**.

## Upstream canary pin

The integration canary currently tests against:

- repository: `stemlen/bloom-pdf-editor`
- commit: `9ed16c43e356cffd4bd3b004b0dab19e582a59d5`
- upstream license at that commit: Apache-2.0
- standalone server port: `8787`

The canary pin is deliberately exact. Updating it requires a PR, a license re-check and a fresh end-to-end canary run.

## What the canary proves

`.github/workflows/bloom-canary-ci.yml` builds the pinned Bloom standalone server plus the SolYan Office and backend images, then runs one controlled synthetic case for each target:

- DOCX: mixed narrative/table layout
- XLSX: financial table layout
- PPTX: chart-like slide layout

For each case the workflow exercises the whole path:

`PDF -> SolYan backend adapter -> pinned Bloom -> Office file -> SolYan Office service -> PDF -> visual similarity report`

The workflow requires only successful conversion, non-empty output and a valid PDF round-trip. It records similarity scores but does **not** enforce product fidelity thresholds.

## What the canary does not prove

A three-case synthetic canary is an integration and compatibility gate, not a release-quality benchmark. It does not replace:

- the 18-case controlled synthetic corpus;
- representative real-world PDF -> Office corpora;
- target-specific acceptance thresholds;
- manual inspection of difficult tables, typography, charts and slide layouts.

Broad quality claims remain blocked until the representative release-corpus items in `docs/ROADMAP.md` are completed.
