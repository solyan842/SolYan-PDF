# Reader CI #40 geometry fix checkpoint — 2026-10-22

Branch: `feat/windows-reader-fast-window-print-links`.
Parent: `880361786a704b4483c987dbc7ddcaf5a232d315`.
Failed run: https://github.com/solyan842/SolYan-PDF/actions/runs/39715951422
Job: 119617973426. Raw job log read once; diagnostics artifact 12399227552 inspected.

## Evidence and cause

Fast gates, Rust tests, release compilation and NSIS packaging passed in #40.
Installed acceptance failed at the normal-window restart comparison:
requested/saved outer rectangle [0,0,1200,800], reopened [0,0,1040,729].
The old test requested a fixed rectangle without checking the runner monitor.
The startup adapter clamped client width/height to work-area width/height while
positioning an outer rectangle, leaving native frame pixels outside the limit.
The configured minimum client size could also override restored sizes on small
or scaled displays, including maximized startup.

## Focused correction

Continue using the existing official window-state plugin; no new persistence.
Account for measured outer-minus-client frame extents in physical pixels.
Set the monitor-safe minimum before fitting; avoid redundant resize/move.
Allow the plugin to restore below the default minimum during construction, then
establish the real monitor-safe minimum, including maximized startup.
No Reader stable/main/sTool changes.

Native acceptance now records physical work area, outer/client size and DPI.
It first requests an oversized placement, restarts, and requires the entire
outer rectangle inside the real work area. It then selects a monitor-fitting
normal rectangle and retains exact restart equality, maximized restart, F11
close/restart equality and fullscreen-state checks. No tolerance or removed
acceptance gates. The native helper compiles against Win32 APIs and explicitly
uses physical coordinates to avoid probe DPI virtualization.

## Local verification on the final source

- Reader feature only, locked Cargo dependencies and Reader TAURI_CONFIG:
  15/15 native Rust unit tests PASS (including five geometry regressions).
- JavaScript syntax check: PASS.
- Windows probe C# compilation: PASS.
- Geometry regressions: frame on small desktop, valid rectangle unchanged,
  removed/negative-coordinate monitors, scaled frame/work-area offset,
  repeated fitting is idempotent.
- Local initial Cargo invocation omitted TAURI_CONFIG and stopped because
  sTool resource directories were absent. Corrected to the Reader config;
  no product/test gate was weakened.

## Next exact-head gate

One Reader-only push/CI after this coherent fix. Its installed Windows acceptance
must PASS before claiming the runtime issue resolved. Physical printer-driver
validation remains outside this checkpoint. Save the run URL/status after
dispatch, then stop polling in accordance with AGENTS.md section 13.
