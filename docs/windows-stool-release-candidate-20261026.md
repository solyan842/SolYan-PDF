# sTool Windows release candidate — 2026-10-26

## Candidate source

- Runtime source commit: `282af827ab16746a35af7acc9e011c06a060b331`
- Runtime branch: `feat/windows-stool-startup-cleanup`
- Packaging branch: `build/windows-stool-demo-20261026`
- This packaging commit contains no application source changes; it records the release input and triggers the configured Windows installer workflow.

## Evidence before packaging

- Windows sTool Fast CI #58 passed on runtime source commit `282af827ab16746a35af7acc9e011c06a060b331`.
- Existing installer #9 acceptance passed on product source commit `6bb5a26c3a8c6890cd051ff75175e9a9d6372e7f`. That package is from a different source revision and is not evidence for this candidate.
- Local OCR and PDF/A production-engine gates passed earlier; they do not constitute installed UI or installer acceptance for this source commit.

## Required packaging result

Run the existing `Windows sTool Installer` workflow for this packaging branch. It builds the standalone sTool Windows x64 NSIS installer and uploads the installer, SHA-256, and package manifest. Reader is not part of this workflow.

Do not report this candidate as accepted until its package identity and runtime checks are verified.
