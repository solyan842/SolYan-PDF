# sTool — áp dụng bài học từ CIT-PDF

Status: adoption decision / implementation pending.

Source reviewed: [CIT-PDF 1.0.6](https://github.com/Cuongyd196/cit-pdf/releases/tag/1.0.6), its [desktop architecture](https://github.com/Cuongyd196/cit-pdf/blob/1.0.6/DESKTOP.md), and the upstream repository at review time.

## What to learn

CIT is an Electron desktop fork of BentoPDF. Its useful patterns for sTool are:

- Keep the desktop shell small and make optional processors independently installable.
- Pin a module manifest to exact versions and cryptographic hashes.
- Stage downloads or offline-folder installs, verify them, then activate atomically.
- Deduplicate concurrent requests for the same module, report progress, and leave the last good installation intact on failure.
- Make each tool explain which local engine it needs; do not launch engines from Home.

These are design patterns to implement against sTool's Tauri service boundary. Do not transplant CIT/BentoPDF source files or its Electron main process into sTool.

## License and product boundary

CIT-PDF 1.0.6 declares AGPL-3.0; this repository declares Apache-2.0. Keep SolYan's license and third-party notices unchanged. This change adopts independently implemented behavior, not CIT source code. Any proposal to combine source code or change licensing requires a separate explicit review.

sTool already has a lazy service shell, per-package installer SHA-256 manifest, and a full offline installer. Do not replace these with a remote-only runtime: issue #145 requires offline OCR and LibreOffice acceptance. Preserve the full offline installer as the release baseline.

## Proposed incremental adoption

1. **Keep current release path:** the existing installer continues to bundle all resources needed for offline acceptance.
2. **Add a separate optional engine-pack format:** only after the full offline installer acceptance passes. A pack has a schema version, engine ID, exact version, platform/architecture, file list, byte lengths, SHA-256 hashes, and source provenance. No unpinned "latest" downloads.
3. **Reuse the manifest for online and offline installs:** online download and user-selected local folders feed the same verifier. Reject path traversal, unexpected files, size/hash mismatch, unsupported platform, and incomplete packs.
4. **Install safely:** write to a private staging directory, verify every file, then atomically switch the active engine pointer. On failure retain the previous working version and remove only the incomplete staging directory.
5. **Keep startup lazy:** Home and search never inspect, download, or start engines. At a tool's first run, show the missing-engine action and progress; serialize same-engine installs and starts.
6. **Test before offering a light installer:** interrupted downloads, corrupt hashes, offline folder install, concurrent same-engine requests, rollback, engine start/reuse, source-PDF integrity, uninstall cleanup, and existing full-offline acceptance must pass.

## Current state and next gate

At the adoption baseline, sTool Home is already lightweight and services are started on demand. The current package manifest describes the installer itself; it is not an engine package manager. No optional engine downloader or offline engine-pack installer is implemented by this document.

Implement the pack format and verifier as a separate sTool feature, with focused tests, before adding controls to the locked Home UI. Only then build a separate light installer. Keep the existing full installer unchanged until the new mode passes the same functional acceptance, including OCR, Office, signing, PDF/A, PDF preservation, and process cleanup.

Reference implementation inspiration: CIT's module manager and module manifest. Integration target: the Tauri application and existing local-engine/service ownership model in this repository.
