# sTool Windows — Fast Home, on-demand engines and independent CI

Status: DEVELOPMENT / exact-head CI pending. Base source is sTool D6 at c986b6966b8a28c55cfbc219f7869fb8e675cdaf (full Windows Desktop CI #131 SUCCESS). This document is subordinate to current GitHub HEAD and unfiltered latest Actions.

## Hard product rule
- Opening sTool must display Home/search and the full tool catalog without starting any sidecar, Paddle models or LibreOffice.
- On first actual tool execution, start the loopback Core service once, off the UI thread. For an Office/OCR/signing/PDF-A tool, additionally start only Office/OCR/pyHanko/archive respectively. Reuse running processes for subsequent calls.
- Keep all engines local, with per-launch credentials and existing Windows Job Object ownership. Nothing is allowed to read arbitrary filesystem paths from renderer input.
- Startup failures are scoped to the invoked tool; a broken OCR model must not prevent Home and basic PDF tooling.
- Never eagerly load heavy models or ship a web CDN dependency just to accelerate startup.

## Two separated Windows products and build lanes
- Reader: existing feat/windows-reader-fast-* feature branches, own Windows Reader CI and Reader NSIS. Never trigger full sTool build for Reader work.
- sTool: dedicated feat/windows-stool-* feature branches, own Windows sTool Fast CI. Daily CI does only JS cold-start contract, sTool UI checks, and Rust cargo check. No Office/Paddle/Tesseract downloads, PyInstaller, NSIS, Reader or full Toolbox packaging.
- Existing Windows Desktop CI is the full sTool D6 release gate, to be started deliberately at appropriate integration checkpoints. Its installed-app smoke currently assumes eager sidecars and MUST be updated to explicitly exercise on-demand services before it can be considered valid for this feature. No weakening, skipping or false green release claims.
- Do not merge either product or share builds until independent exact-head CI and installed Windows field QA for sTool are green and the user explicitly agrees.

## Pinned UI/icons contract
- The finalized tool icons are Phosphor Duotone SVG mapped by stable tool ID in the Reader-derived desktop/ui/icons.js with offline SVG assets and MIT license. Do not pick a new icon kit, reassign tool IDs, or restore Unicode placeholder glyphs.
- Align sTool's buttons, selectors, slim sliders, spacing, status colors and contextual inspectors to already approved Reader visual tokens; do not wholesale overwrite the latest Reader UI from old D6 files.
- UI porting is a separate reviewed change, so neither Reader's unfinished Session Restore nor old Toolbox bootstrap behavior is silently reintroduced.

## On-demand release acceptance
1. Installed Home starts while Core, Office, OCR, sign and archive processes are absent. Record actual cold-start time on representative Windows hardware, not guessed metrics.
2. Basic PDF tool starts Core only; Office/Paddle/sign/archive remain absent.
3. Office conversion starts Office only, OCR starts OCR only, signing starts sign only, PDF/A starts archive only; repeated calls reuse their process.
4. Windows installer contains the real resources; all functional smokes for conversion, offline OCR, installed signing, PDF/A, D6 uninstall and orphan checks still pass.
5. Any port collision, missing service or invalid PDF displays an actionable tool-scoped error, never an artificial PASS.

Do not publish to main, create public release or call the feature complete based only on lightweight CI.
