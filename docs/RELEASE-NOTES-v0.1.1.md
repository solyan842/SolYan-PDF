# SolYan PDF v0.1.1

This patch release hardens the v0.1.0 codebase without intentionally changing user-facing PDF workflows.

## Highlights

- Reproducible dependency inputs: pinned multi-arch base images, fixed Debian snapshot, complete npm lock and Python transitive locks.
- SHA-256 verification for standard Python services and the ordinary PyPI portion of the OCR graph.
- OCR production image dependency validation fixed and verified; PaddlePaddle remains explicitly isolated on its official CPU index.
- Reproducible Vietnamese OCR real-scan baseline: 9 public-domain documents, Tesseract fallback CER 13.47% / WER 22.88%.
- Runtime images verified as non-root with writable HOME and resolved package inventory artifacts.
- Full-stack deployment gate: builds all six default images, starts the Compose stack, waits for health, smoke-tests frontend/backend endpoints and tears down cleanly.

## Known limitations

- PDF -> DOCX/XLSX/PPTX remains experimental pending representative release corpora and agreed fidelity thresholds.
- The real Vietnamese OCR corpus is still only 9 documents; broad quality claims remain blocked until 50–100+ diverse verified pages are available.
- PaddlePaddle is source/version locked on its dedicated CPU index, not architecture-wide hash-pinned.
- Cloud connectors, remote multi-party signing, AI summarization and PDF translation still require product/provider decisions.

See `CHANGELOG.md`, `docs/RELEASE-MANIFEST.md` and `docs/REPRODUCIBILITY.md` for details.
