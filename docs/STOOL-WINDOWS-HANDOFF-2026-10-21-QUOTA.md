# sTool Windows — quota handoff, 2026-10-21

## Scope and authoritative state
User requested a checkpoint and a pause for quota reset. sTool only, primary issue #145; verify #144 separately. Do not modify main, stable, any Reader branch, Reader stable or launch Reader CI. No Reader/sTool merge.
Read full AGENTS.md, issues #143/#144/#145 and current repo-wide Actions before resuming. Earlier preflight enumerated all 5,836 runs across 59 pages; subsequently tracked new repository-wide runs.
Verified development HEAD: feat/windows-stool-installer-acceptance, 005dbb7d8179d5b1f807d994d39c0dbe60e3223e, tree db7594790ae8df30a85920451212a1247d612229.

## CI evidence
- Fast #7 SUCCESS: https://github.com/solyan842/SolYan-PDF/actions/runs/39557347968 (005dbb7).
- Installer #2 RUNNING at checkpoint: https://github.com/solyan842/SolYan-PDF/actions/runs/39557692700
  Branch build/windows-stool-demo-20261021-cors, same SHA. Job 119081226914.
  NSIS build PASSED; step 22 "Install and exercise lazy engines, then preserve D6 release gates" running.
  Do not dispatch a duplicate build. Inspect this run first.
- Installer #1 failure: https://github.com/solyan842/SolYan-PDF/actions/runs/39552910841.
  NSIS built 884,519,342 bytes, installed Home zero engines passed, first compression failed "Failed to fetch".
  Job 119065930183 raw log ALREADY READ ONCE. Do not fetch it again.
  Diagnostics artifact 12326255431 extracted locally in work/stool1-diagnostics.

## Committed changes already tested — do not redo
5f9c430: dedicated milestone/manual sTool NSIS workflow, preserved original D6 gates, real installed UI driver and process-tree evidence, always-upload diagnostics. Heavy legacy D6 manual only.
258cb175: separate Core runtime correction: standard outer Starlette CORS around existing per-launch token validator. Browser preflight has no token secret; old outer authentication wrongly returned401. Actual API requests still require token; no origin wildcard or security disable.
005dbb7: Fast CI gates five actual runner/CORS tests; installed UI driver fails immediately on real tool error instead of waiting five minutes. Native driver uses real files and tool outputs, concurrency, crash recovery, auth, source hashes, shutdown; original frozen signing/PDF-A/checksum/uninstall gates retained.
No product UI/icon/main.rs modifications. Existing exact Phosphor mapping preserved.

## Additional Windows LOCAL work completed during CI wait
User explicitly asked to provision local tools and reduce dependence on CI.
Workspace: C:/Users/Admin/Documents/Codex/2026-10-19/ti-p-t-c-to-n/work
Repository: workspace/SolYan-PDF.
- Existing Rust 1.99.1 and cargo 1.99.1 were found in work/tooling/native-build/{cargo,rustup}; MSVC14.44.35207 and SDK10.0.26100.0 already installed. No reinstall needed.
- Dedicated sTool copy: work/stool-local-build; dedicated target work/tooling/native-build/stool-target. Original repo and Reader target untouched.
- cargo check --offline PASS (1m44s); cargo build --offline PASS (1m42s), two existing warnings. These are shell compilation checks with empty heavy-service resource dirs, NOT a full local installer acceptance.
- Official qpdf12.4.2 Windows asset downloaded using manifest URL and SHA256 db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d; expanded under work/stool-local-runtime/qpdf.
- PyInstaller6.22.3 plus pinned wheel dependencies installed only into work/stool-python-tests. All downloaded wheels checked against official PyPI SHA256. Normal pip HTTPS had prior PC reset errors; no TLS/antivirus changes.
- Built work/stool-local-runtime/frozen/solyan-core.exe and solyan-sign.exe successfully. Signing dependency closure23 distributions PASS; three signing contract tests PASS. Real cryptographic signing of the new local exe NOT yet run.
- 13 Python regression tests PASS (CORS5, sign proxy3, frozen cleanup3, Paddle hook2), plus sign runner3, Node contracts9, parsed workflow isolation and UI/CSP contracts PASS.
- Actual production Core SOURCE runner and native qpdf: compression, decompression, flatten, compress-images; all saved PDFs passed qpdf --check, retained all text/geometry on three pages; invalid input rejected then valid retry; eight concurrent real PDF operations; original source SHA256 unchanged. PASS.
- Same functional cases on newly built frozen Core exe PASSED, BUT cleanup FAILED (see blocker below): do not claim whole local acceptance PASS.
- Actual local TCP/uvicorn using production auth/CORS composition and synthetic route: approved preflight, wrong/missing tokens401, foreign-origin denial, plain OPTIONS401,32 concurrent requests and clean server close PASS.
- Local headless Edge against unchanged Home:96 tools, all nine categories, Vietnamese/English searches, empty state, Ctrl+K, Escape, separate name/description, every SVG asset loaded, zero script exceptions: functional PASS.
  Zero-external-requests check FAIL: Kaspersky injects me.kis.v2.scr.kaspersky-labs.com script/requests into local HTTP browser page. This is recorded, not suppressed or declared product network PASS.
  Browser observed Home12.386s includes local instrumentation/KIS and is NOT native cold-start performance.

## Immediate local cleanup blocker — DO NOT launch more native tests first
Our first local frozen-Core probe terminated only the PyInstaller parent, leaving server child alive. Corrected the local probe to reuse the existing stop_frozen_sidecar helper and to persist cleanup failures.
Both taskkill of exact owned child and helper taskkill /PID <owned root> /T /F returned "Access denied".
Last observed test-owned solyan-core PIDs:37580,42348,44628, all executable:
work/stool-local-runtime/frozen/solyan-core.exe
Do not kill arbitrary SolYan processes. Verify current PID+full executable path (PIDs may be reused), close these test-owned trees with appropriate Windows rights, then prove loopback ports closed and no descendants remain. May need the user/Windows security to permit this action. Do not disable Kaspersky or bypass security.
This is a local test cleanup/tooling failure; no evidence yet that the installed Tauri Windows Job Object lifecycle fails. CI tests actual app-owned trees independently.
The preserved frozen report is explicitly FUNCTIONAL_PASS; CLEANUP_FAIL and processTreeCleanupVerified=false.
Do not reuse the older "ownedCoreExited=true" field as proof that descendants exited.

## Local material and reproduction
The local-checkpoint/ folder adjacent to this file contains copies of work-only scripts, reports, and wheel checksum manifests for handoff.
These probes expect the layout above, with scripts copied to work/, alongside SolYan-PDF. They are not normal product/CI entrypoints.
Dot-source work/stool-local-env.ps1 to set only this shell's Rust/Python/qpdf paths. Bundled Python:
C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe (3.12.14).
CI uses3.13; local work is additional evidence, not a replacement for that gate.
Local logs: stool-local-cargo-check.log, stool-local-cargo-build.log, stool-local-core-build.log, stool-local-sign-build.log.
Local reports: stool-local-core-results/report.json, stool-local-frozen-core-results/report.json, stool-local-home.json, stool-local-http-check.json.
Screenshot work/stool-local-home.png.
Synthetic P12/key stays LOCAL, not committed or uploaded. No user PDF used. No runtime binary/vendor blob committed.

## Resume order
1. Read GitHub fresh, verify branch HEAD and repo-wide Actions. No two PCs writing same branch.
2. Inspect Installer #2 outcome first. On failure fetch the EXACT failed job raw log once, then diagnostics fallback. Fix actual cause, retain all test thresholds. On success download/inspect stool-native/report.json and all existing release gate evidence before claiming PASS.
3. Offer the actual sTool-PDF-Windows-x64 installer artifact only after all required gates PASS. Current checkpoint is not an accepted demo release.
4. Resolve local owned-process access/cleanup blocker before starting more frozen/UI probes. Reuse existing local tools/caches; no need reinstall Rust/MSVC/qpdf.
5. Validate local signed PDF with the now-built signing exe, then native shell+Core UI if local access allows; preserve source and verify all child exits.
6. #144 remaining unverified cases: living-but-unresponsive service recovery and hostile port collision. main.rs currently uses owned Child.try_wait before reuse; liveness is not health. ServicePlan reserves four unique numbers but releases sockets; Core allocates separately. Investigate with reproducible tests and separate runtime commit; do not claim fixed.
7. Retain approved UI, lazy Home and engine isolation. No full heavy build on each commit; batch fixes and Fast CI first.
8. Preserve unrelated untracked local content: desktop/backend/__pycache__, desktop/backend/tests/__pycache__, desktop/reader-tests, desktop/src-tauri/Cargo.lock, gen/, icons/icon.ico, desktop/ui/vendor. No blanket reset/clean.

## Status
#143 baseline already PASS. #145 installer built but integrated acceptance still running; local cleanup blocked, so NOT COMPLETE. #144 crash/concurrency acceptance is in CI; unresponsive/collision cases pending. User requested stopping for quota reset after saving this handoff.
