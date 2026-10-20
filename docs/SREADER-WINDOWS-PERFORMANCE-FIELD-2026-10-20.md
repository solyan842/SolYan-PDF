# sReader Windows — touchpad FIELD-PASS and installed performance baseline

Date: 2026-10-20 (GMT+7). This is a Reader-only engineering checkpoint, NOT a release, version tag or main merge.

## Accepted field evidence
- Owner explicitly confirmed on a physical laptop: **two-finger touchpad pinch PDF zoom WORKS**.
- Commit: `8b0c6d0773d5484557a5aab889f50eefe0c8dff0`.
- [Windows Reader CI #23](https://github.com/solyan842/SolYan-PDF/actions/runs/39431556810): **SUCCESS**, 34/34 Playwright, 5/5 Rust, installed Windows native smoke and NSIS packaging/uninstall passed.
- Reader `zoomHotkeysEnabled=true` scoped only to Reader WebView2. Capture-phase Ctrl+wheel zooms PDF.js document and preserves normal two-finger scrolling; do not revert without a reproduced regression.
- Exact Reader installer artifact: [SolYan-PDF-Reader-Windows-x64 from CI #23](https://github.com/solyan842/SolYan-PDF/actions/runs/39431556810/artifacts/12268093748).
- This is **field-pass for the touchpad gesture only**, not owner approval of final performance or every UI feature.

## Next: diagnose real installed startup + 10 tabs (this branch)
The existing `desktop/reader-tests/native-activation.mjs` functional smoke now records extra **diagnostic-only** values:
- Windows Reader spawned -> WebView document `data-ready`.
- Spawn -> first available PDF text (synthetic three-page PDF), recorded for the first startup and a later process restart. Includes CDP attach and polling overhead, so these are **upper-bound-style observations, not precise pixel first paint or real production startup claims**.
- Windows process-tree Working Set sum and Private Bytes sum, after 1 tab and after 10 tabs (2 native files, 8 one-page in-memory PDFs). Sum of working sets may double-count shared pages; only actual tracked descendants are included. No model/Toolbox processes may run.
- Native 10-tab switch must show correct content; 10-tab functionality is a gate but RAM/latency numbers **are not arbitrary pass/fail budgets**.
- Do not compare these synthetic GitHub runner figures as if they were a same-PC Rune head-to-head comparison.

**Human performance QA still pending:** same Windows laptop, same real PDF corpus and storage, cold vs warm launch with actual installed EXE, real first legible page, Windows Task Manager process + WebView2 private memory at 1 and 10 tabs, smoothness when scrolling scanned large documents, keyboard/pointer hit targets and no hangs. Record Windows version, CPU, RAM, SSD type, file sizes/page counts. Release only after owner review and repository release gates.

## Safety / scope
- Active implementation parent is CI #23 exact SHA, not stale company branches.
- Performance instrumentation does not run background agents, upload user PDF content, introduce telemetry or network dependencies, or change UI/PDF engine.
- Do not copy, distribute, or commit Microsoft font files.
- Reader-only CI. Toolbox and protected `main` unchanged; no release/tag without explicit authorization.
