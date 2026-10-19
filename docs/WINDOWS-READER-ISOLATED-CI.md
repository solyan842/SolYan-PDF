# Standalone Reader CI / company continuation — 2026-10-19

## Source and branch

Base: `d32014cfe90fe5f005d147f28a6b3e457607abb0` on `feat/windows-reader-r2-company-continuation`.
Staging/writer branch for this milestone: `feat/windows-reader-fast-ci`.
Follow `AGENTS.md` and `docs/CODEX-SREADER-RUNE-UI-TABS-READER-ONLY-2026-10-19.md`.
Keep the original company branch/PR #137 and main/stable untouched. Old local uncommitted bookmark changes were preserved in a named Git stash before fast-forwarding from GitHub; they were already uploaded in 897a0e2. Do not blindly apply that stash.

## Actual latest failure investigated

Repository-wide Windows Desktop #139, run 39193777271, SUCCESS at 897a0e20. New docs-only d32014c triggered #140, run 39198320027, FAILURE in build job 117885807762.
Read raw job log once successfully. First relevant error: 100%-DPI zoom test, reader.spec.mjs:55, `locator.evaluate: TypeError: Cannot read properties of null (reading 'getBoundingClientRect')`. Ten other browser scenarios passed. The trace points to the post-render measurement's detached signature element, not the strict geometry assertion. Product code is identical to #139; pagerendered intentionally rebuilds signature overlays.

Replace the element-handle-based measurement with an atomic browser task that queries the currently attached selected signature and reads its page geometry. Poll for that same signature ID and keep all position/size/DPI tolerances, pending-raster lifecycle assertions and roundtrip checks unchanged. No product renderer, Quick Sign or benchmark threshold was changed. Normalize the modified test file to LF after the earlier API checkpoint introduced CRLF blob content.

## Independent lane implemented

- `.github/workflows/windows-reader-ci.yml`: push only on `feat/windows-reader-fast-*`, precise Reader/shared-shell paths, plus manual dispatch. No PR trigger in this milestone.
- Pinned Node dependencies; offline PDF.js/pdf-lib/approved artwork staging; package/CSP/local-asset contract; all existing Reader Node and Playwright tests.
- Rust/Tauri 2.12.3 builds ONLY `--config tauri.reader.conf.json --features reader-only --bundles nsis`.
- No Python, Office, OCR, signing or archive runtime installation/staging, and no Toolbox installer build.
- Dedicated hosted-runner smoke installs Reader, rejects Tools engine resources/processes, records its own descendant process IDs, stops only that process tree, checks cleanup, silently uninstalls and verifies Reader executable removal. Guard prevents installing on a user's local PC.
- Artifacts retain established Reader installer/diagnostics names; installer metadata includes bytes, SHA-256 and commit. Always-upload diagnostics preserve real command failures.

The original `windows-desktop-ci.yml` is UNCHANGED. It still runs on any PR touching desktop paths. Therefore this staging branch is pushed WITHOUT opening another PR; it is absent from the full Desktop push branch list. This avoids two Windows builds on the same change. After Reader-only CI and later Reader milestones pass, integrate at a deliberate company-branch/PR checkpoint for one full Desktop compatibility gate. Never bypass the full release gates or merge to main here.

## Local verification

- All 11 Reader Playwright scenarios PASS (31.7 s).
- A further three repetitions at each of 100% and 125% DPI: all 6 affected scenarios PASS (39.3 s).
- All 6 Reader Node tests, 5 original Toolbox icon tests, UI/CSP contract PASS.
- Reader package/asset/CSP contract PASS; actionlint 1.7.7 PASS (downloaded official release, verified published SHA-256).
- All four workflow PowerShell run blocks and the new installer script parse successfully; local-install refusal guard PASS.
- No Rust/Cargo on this PC. Native build/install/uninstall is NOT yet validated: this commit must run Reader-only CI. Browser native bridge mocks are not Windows UI acceptance.

## Wait / next exact work

After push, refresh repository-wide Actions once, record exact staged HEAD/run, then stop agent work while CI runs. Next continuation must check fresh HEAD and repository-wide latest Actions; on failure read actual raw log once and use artifact fallback if needed. Do not rerun full Toolbox just to retry Reader.

This is milestone A infrastructure only, not complete Reader acceptance. Explorer single-instance/two-file activation tests belong to milestone B and are not claimed by the startup smoke. After this lane PASS: implement B native single-instance/queued file activation with real installed-EXE tests; C compact Rune UI with actual preview screenshots; D true F5 presentation; E Print, AcroForms/native Unicode text/properties/recents; then document handoff and full Windows integration/release QA. No merge or public release authorized.
