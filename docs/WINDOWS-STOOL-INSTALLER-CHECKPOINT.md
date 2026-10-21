# sTool independent installer — issue #145

Baseline verified 2026-10-21: `36ddb01d3e7ecd472f39f609f3d24e4a3c07cf56`,
`feat/windows-stool-fast-process-recovery`, Windows sTool Fast CI #5 SUCCESS.
All 5,836 repository-wide Actions were enumerated across 59 pages; four sTool
branches were compared by actual parent history and commit timestamps. P0 #143
and the pinned icon port already passed; do not redo them. Reader work is stopped
and its stable branch is untouched. No integration or release is authorized.

## Implemented acceptance (not an installed PASS claim)

- New `Windows sTool Installer` preserves D6's real Core/Office/Paddle/sign/
  archive packaging, payload trimming and essential-file gates. It produces
  only `sTool-PDF-Windows-x64`, diagnostics and D6 checksum artifacts.
- Heavy builds run manually or on an explicit `build/windows-stool-demo-*`
  milestone branch. Ordinary `feat/windows-stool-*` runs Fast CI only. Legacy
  full Desktop D6 is manual-only, so Reader changes and PRs cannot trigger it.
- Installed WebView2 acceptance uses supported test-only per-app CDP policy,
  with refusal to overwrite existing policy/install and verified rollback.
  It opens real Home/search with zero engines, then actual UI operations:
  qpdf compression, RTF-to-PDF, offline image OCR, PKCS12 signing with wrong-
  passphrase retry, and PDF/A. Saved outputs are checked with pypdf and original
  fixture hashes retained. Private test credentials remain in RUNNER_TEMP.
- Concurrent allowlisted IPC startup/reuse tests count service roots correctly
  for PyInstaller's parent/child model. Crash injection kills only an exact
  installed, application-owned engine tree, then real UI output must succeed
  after recovery. Application close must release owned descendants without
  taskkill being used to manufacture lifecycle success.
- Original installed signing cryptographic/auth tests, PDF/A frozen tests,
  no-smoke-orphans, checksum and silent uninstall/removal gates remain enabled.
- Home and first OCR record automation-observed elapsed time and sampled peak
  process-tree working/private bytes, CPU/OS/RAM/runtime context. These are CI
  samples with CDP overhead and uncontrolled OS caches, not field cold-start or
  exact peak guarantees. UI screenshots and report.json remain durable.

No main.rs, product UI, icon mapping or Reader file changes in this batch.
Living-but-unresponsive engine recovery and deliberate hostile port collision
remain explicit #144 follow-ups; do not claim that Fast CI proves them.

## Execution

Local: 9 sTool contract tests PASS; UI/CSP contract PASS; PowerShell and JS
syntax PASS; fixture Python AST PASS; parsed YAML isolation checks PASS.
Pinned test dependencies only, no Home runtime imports or OCR model downloads.

Push once on a dedicated feature branch and require exact-head sTool Fast CI
success. Then create a deliberate build/windows-stool-demo milestone pointing
to that same SHA, launching the heavyweight installer gate once. Inspect actual
failed job log once, then artifact fallback, before any repair. Preserve original
local untracked Cargo.lock, generated files and previous work. Actual installed
functional PASS and downloadable demo installer remain pending the full gate.

## Installer #1 outcome and repair

Fast CI #6 SUCCESS at `5f9c430`. Installer #1 (`39552910841`) built NSIS
884,519,342 bytes and passed installed zero-engine Home, then failed on first
PDF compression with `Failed to fetch`. Log read once and artifact `12326255431`
inspected. See WINDOWS-STOOL-CORE-CORS.md for the real CORS preflight regression
and separate runtime repair commit. Five production-composition ASGI tests
changed from two FAIL / three PASS to five PASS locally; API auth remains strict.

Follow-up test-only changes fail immediately on an actual UI error instead of
waiting five minutes for a download, measure usable Home before intentional
idle verification, and assert LibreOffice output text rather than just PDF
page count. New CORS tests run in Fast CI and before Core packaging. No PDF
output, signature, offline OCR, PDF/A, process recovery or uninstall gate removed.
Push the combined tested batch once, require Fast CI, then dispatch a new named
installer milestone; never rerun the unfixed #1 SHA.

## Current verified dispatch

Feature HEAD `005dbb7d8179d5b1f807d994d39c0dbe60e3223e`; separate runtime commit `258cb175d776c16223f7e471ae7c7467829b4cb3`.
[Fast CI #7](https://github.com/solyan842/SolYan-PDF/actions/runs/39557347968) SUCCESS, including the five real ASGI tests.
[Installer #2](https://github.com/solyan842/SolYan-PDF/actions/runs/39557692700) IN PROGRESS when saved, same SHA, branch `build/windows-stool-demo-20261021-cors`.
Do not rerun old installer #1; its log was consumed and its exact CORS regression repaired. Re-fetch live Actions before diagnosing #2. No installed demo PASS yet.
