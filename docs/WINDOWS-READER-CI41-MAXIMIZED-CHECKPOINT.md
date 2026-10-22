# Reader CI #41 attempt 2 — maximized restoration correction

Branch: feat/windows-reader-fast-window-print-links
Parent: 7fdd07eca8f59b403e91c7eed6f95b25f85e6ffd
Run: https://github.com/solyan842/SolYan-PDF/actions/runs/39719816028/attempts/2
Failed job: 119646935624; log fetched once.
Diagnostic artifact: 12403445789.

## Verified progress

All browser gates and Rust tests passed; release EXE and 8.13 MiB NSIS built.
Installed acceptance passed the new oversized correction and exact normal
restart checks. Artifact report proves:
- requested outer rectangle: [0,0,2500,1600]
- actual work area: [0,0,1024,720], 96 DPI
- corrected outer rectangle: [0,0,1024,720]
- corrected client area: [1008,711]
Failure moved to line 399: maximized restart expected true, received false.

## Actual remaining cause and focused fix

The post-restore adapter called Tauri set_min_size before checking maximized.
Inspection of the installed Tao 0.37.1 Windows implementation proves
set_min_inner_size calls set_inner_size, which explicitly clears
WindowFlags::MAXIMIZED. This was introduced in the previous geometry fix.

Register a thin window-ready adapter BEFORE the official window-state plugin.
Tauri PluginStore runs these hooks in registration order. Establish the
monitor-safe physical minimum while the new window is still normal, then let
the existing plugin restore normal/maximized placement. Post-restore fitting
skips maximized/fullscreen windows entirely and does not mutate minimums.
No new persistence, vendor patch, UI redesign, test tolerance or removed gate.

## Validation and outstanding work

Final changed Rust sources: cargo test --locked --no-default-features
--features reader-only, with Reader TAURI_CONFIG: 15/15 PASS.
The browser/UI files are unchanged; previous local run on parent: 43/43 PASS,
and the transient failed navigation case separately 3/3 PASS.
Native installed normal/maximized/F11 restart assertions remain unchanged.
One Reader-only CI after this commit must confirm maximized and subsequent
native link-policy checks. Do not claim full completion before exact-head PASS.
Main, stable and sTool remain untouched.
