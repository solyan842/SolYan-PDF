# sTool close-protocol checkpoint — 2026-10-21

User requested stopping while waiting for Actions to conserve quota. No background monitoring is configured.

## Current verified work
- Branch feat/windows-stool-installer-close-protocol
- Integration commit b6778f868253362e79483ac1405c4e3b43612b1c, parent b19620782422f46cafa4c3fbfec0b19bc3b3a896.
- Changed seven files re-fetched and byte-verified. main/stable/other active branches untouched.
- Local Node regression14/14 PASS. Actual PowerShell function tested with successful/refused CloseMainWindow owners. Empty/malformed/scalar JSON, wrong-owner acknowledgement, still-living application or child, nonzero exit, census errors all fail. Delayed normal child exit passes. PS parser, JS syntax and workflow-isolation checks PASS.
- Close helper returns explicit JSON only after CloseMainWindow succeeds. JavaScript independently requires exit code0 and all previously owned descendant PIDs gone. Failure-only force cleanup cannot manufacture PASS.
- Existing OCR tokenization, all functional engines, source integrity, signing/PDF-A and NSIS uninstall/orphan gates retained.

## GitHub Actions at stop
Fast CI #9 RUNNING, exact SHA b6778f8:
https://github.com/solyan842/SolYan-PDF/actions/runs/39573110940
Last observed job119131918128 had all fast gates successful and Cargo check running.
Installer #4 HAS NOT BEEN STARTED because Fast #9 is not yet confirmed PASS. Do not claim a demo acceptance PASS.

## Next step
Re-fetch full AGENTS and latest repository-wide Actions/branch HEAD. If Fast #9 on b6778f8 PASS, verify same feature HEAD then create exactly one build/windows-stool-demo-* milestone branch at that SHA to trigger Installer #4. Do not dispatch duplicates. On failure read exact current failed job log once, then diagnostics fallback; fix real cause.
Installer #3 raw job119111260893 already read before this task; do not reread. Durable artifact12331702749 was downloaded/examined here. Its report confirms all five functional engine cases reached close; failure is empty JSON at installed.mjs:108. Diagnostics local work/stool3-diagnostics.

## Reader request — pending, not implemented
Latest user explicitly reauthorized independent Reader work: window-state, complete printing and native URL confirmation. Verified base feat/windows-reader-fast-performance-load a309a7fca9625984f5549d858a0d2ab95d71a9b2, Reader CI #38 SUCCESS. Stable35c642ef untouched.
Read full Reader AGENTS, current Cargo/config, reader-actions.js, main.rs, reader.js and test scaffold. No Reader modifications, commits or CI launched.
Isolated source snapshot work/reader-next was extracted from git archive a309a7f (preserves unrelated untracked primary checkout); do not assume this directory is a Git worktree. Primary checkout remains work/stool-close-protocol with uncommitted exact P0 file copies already pushed via GitHub API; preserve all unrelated local files.
Research: official tauri-plugin-window-state latest2.5.0 supports SIZE|POSITION|MAXIMIZED flags; excluding FULLSCREEN alone may still persist fullscreen geometry (upstream update_state saves sizes when not maximized/minimized without checking fullscreen). Must address with tests, not blindly install and claim F11-safe. Plugin monitor intersection fallback does not fully clamp oversized/offscreen windows to work area. Native Tauri2.12.4 WebviewWindowBuilder supports on_navigation and on_new_window; use fail-closed native URL validation and confirmation on every direct IPC. Existing Reader only opens allowlisted About URLs, PDFLinkService externalLinkEnabled:false; no completed PDF URL guard exists. Window creation currently config-driven: install interception before creation; do not widen arbitrary renderer IPC open permission.
Print currently rasterizes a working-copy export with PDF.js,50-page/80Mpixel bounds, original sizes and annotation storage, then window.print. Existing release tests cover output and range bounds; preserve them. No advanced print options implemented in this turn.
Official sources checked: https://v2.tauri.app/plugin/window-state/ ; https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/window-state/src/lib.rs ; https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html .

## Local cleanup boundary preserved
Frozen Core PIDs37580/42348/44628 from prior task returned Access denied on exact-owned taskkill. No new native apps started here; no global kill or antivirus changes. Do not treat this as evidence of Tauri Job Object failure. See prior quota handoff58cff676 for full local environment and evidence. Use dedicated sTool/Reader caches, preserve local untracked files.
