# Reader CI #36 repair — 2026-10-21

Base: `6df3ae55be14cc839d4d5d859b18240020191a17` on
`feat/windows-reader-fast-stable-page-zoom`. Repository-wide latest run was
Reader #36 (`39543497976`), failed job `119036357295`; HEAD matched the run.
Raw job log read once, diagnostics artifact `12321151069` also inspected.

Build and fast gates passed. Installed Windows acceptance failed at
`native-activation.mjs:308`, before session shutdown/restart: selecting tab A,
jumping to page 3, then selecting 150% zoom returned page 1. Real native
Save As, content/source integrity and earlier native scenarios had passed.

Root cause reproduced locally by activating A, navigating to 3 and changing
zoom in one JS task, then allowing animation frames: the double-rAF callback
in session restoration reapplied A's OLD scroll position after newer input.
The added regression failed on unchanged base with expected 3, actual 1.

Fix: apply saved offsets synchronously in activation, after PDF.js's existing
synchronous page/scale layout updates. No stale frame callback remains to
override subsequent navigation. Keep session restore, scroll/zoom preservation
and all installed native acceptance assertions unchanged.

Validation: Node 16/16, package/CSP/no-engine contract and full browser suite
40/40 PASS locally. The deterministic new regression changed from FAIL on
the base to PASS with the fix. Exact native acceptance still
requires that CI. No Toolbox build, main/stable edit or release is authorized.
Original local Cargo.lock, generated Tauri files and icon.ico are preserved.

After dispatch: checkpoint and stop while CI runs; resume by refreshing
repository-wide Actions and exact branch HEAD before reading its outcome.
