# Reader startup, zoom and print integration — 2026-10-27

Branch: `feat/windows-reader-fast-startup-zoom-print-20261027`, based on `7ef07ed1fd310c229126909c44875f9e7774807f`.

## Changes

- Reader Home reaches its interactive state without loading PDF.js or pdf-lib. The existing pinned PDF.js runtime loads on the first PDF open; source bytes are retained lazily so startup and idle memory use avoid duplicate work.
- Zoom controls and Ctrl+wheel preserve the PDF-space point at the center of the document viewport, correcting scroll position after PDF.js finishes rendering.
- Ctrl+P and the standard Print command use the existing PDF.js-backed print preparation and then WebView2 `window.print()`, so Windows supplies printer selection and driver options. Range, N-up, booklet and tile controls remain under the explicit advanced layout command.
- No alternate viewer/print stack was introduced. Existing PDF.js and the Windows/WebView2 print UI remain the rendering and printer-dialog components.

## Verification

Local Reader unit suite: 19/19 PASS. Local Playwright Reader suite: 46/46 PASS, including Home lazy loading, first PDF open, centered zoom, Ctrl+P standard print flow, advanced print sheets, Save As, forms, sessions, presentation and long-document scenarios.

The headless print test verifies the application reaches `window.print()`; it does not claim an installed Windows printer/driver acceptance. Native printer and driver behavior remains subject to Windows acceptance.

## Native Windows open-path follow-up — 2026-10-27

The Reader-only Tauri path previously returned a `Vec<u8>`, which Tauri encoded as a JSON number array. The browser then rebuilt a `Uint8Array` and wrapped it in a `File`, after which the common open path read another `ArrayBuffer`. For large PDFs this added JSON parsing and repeated full-file allocations before PDF.js could start.

The native command now returns Tauri's raw `tauri::ipc::Response` bytes. The frontend accepts the resulting `ArrayBuffer` directly, keeps one untouched source copy for Save/Print, and gives PDF.js a separate transferable copy for its worker. Native file reading overlaps PDF.js runtime initialization; browser File reads also overlap runtime initialization. This reuses the pinned PDF.js/Tauri components and does not add a viewer or parser.

Local evidence on this Windows workstation: unit suite **19/19 PASS**; targeted session restoration **1/1 PASS**; full Reader E2E **46/47 PASS**. The remaining offline-network assertion observed Kaspersky's injected `gc.kis.v2.scr.kaspersky-labs.com` scripts on the local machine, including with Chrome extensions disabled. The test gate was kept unchanged. No local Rust/Cargo compiler was available, so native compilation and installed Windows behavior require the exact-head Reader CI.

The local synthetic 100-page scenario is not a real-PDF timing measurement. The earlier mocked-buffer timing is not a native IPC benchmark. No measured Windows native PDF-open latency improvement is claimed until the standalone Reader runs on Windows with representative PDFs.


## Reader CI #44 — installed WebView IPC CSP failure and fix

Run [#44](https://github.com/solyan842/SolYan-PDF/actions/runs/40440444446), commit `57d365c2c0efcefbdd973a317916d0b1679ca58f`, completed with failure in the installed-app acceptance step. The durable `windows-reader-diagnostics` artifact showed WebView2 rejecting both `http://ipc.localhost/reader_window_control` and Tauri's event-listen endpoint because the effective Reader CSP omitted Tauri's IPC origins. The native Rust tests passed 15/15 and the standalone NSIS build completed; the installed app could not finish bootstrap or open the fixture PDF.

The Reader-only config now explicitly allows `ipc:` and `http://ipc.localhost` in `connect-src`, while retaining the existing self/blob/loopback sources. The Toolbox config is unchanged. A Node regression assertion protects this Reader CSP contract. This matches the [official Tauri CSP guidance](https://tauri.app/security/csp/) for IPC.

Local unit suite after the fix: **19/19 PASS**. The next exact-head Reader CI must verify the merged CSP and installed PDF open before this milestone can be considered passed.


## Foxit Reader 11 print and Quick Sign reference

- Foxit Reader 11.1's print manual is used as a layout reference: preview/navigation, page range, print handling and output settings. The screen in the request is not available as reusable open-source UI in Foxit's GitHub SDK demos; those demos require the proprietary/licensed SDK. We do not copy Foxit code or assets.
- Reuse the existing pinned PDF.js print renderer/layout in this app. Its page range, parity, reverse order, paper, orientation, fit/scale, N-up, booklet, tile, margins, color and annotation controls remain wired to the existing print preparation path.
- The Windows Reader print workspace enumerates installed printers from the spooler, marks the default, opens the selected driver's Properties, and sends the chosen printer and copy count through WebView2's direct Print API. Driver-specific options such as duplex stay in the Windows driver Properties UI.
- Quick Sign follows the simpler Foxit Reader 11 visual-signature flow: Type, Draw or select an image, then place it. It remains a local visual image signature; no certificates, online service, image background-removal or payment-based SDK is introduced. Typed signatures get a small curated font selector; the existing local signature library and PDF placement stay unchanged.
- Reference: [Foxit Reader 11.1 manual](https://cdn01.foxitsoftware.com/pub/foxit/manual/reader/en_us/FoxitReader11.1_Manual.pdf); [Foxit Reader 11.0 Quick Guide](https://cdn01.foxitsoftware.com/pub/foxit/manual/reader/en_us/FoxitReaderQuickGuide_11.0.pdf).
- Platform boundary: printer selection and copies are visible in the Reader print workspace. The app opens the selected Windows driver Properties for device-specific settings. Browser-only fallback uses `window.print()`; real vendor-driver behavior still needs owner-machine acceptance.


## Reader CI #52 — installed fullscreen shutdown test race

The Windows build, browser tests, native tests and NSIS installer passed. Installed-app acceptance failed only when Playwright awaited the IPC response from `reader_window_control({action:'close'})`: closing the native WebView can destroy the page before that JavaScript evaluation receives its response. The acceptance now fires that close request without awaiting the page promise and still requires the process to exit cleanly with code 0 before restarting and checking fullscreen cleanup. This changes only the test synchronization; no acceptance gate is skipped or relaxed.


## Reader printer selection and properties — user correction

The prior Foxit-inspired screen described choosing a printer in a later Windows dialog, but did not show those controls in the app. The Reader print workspace now lists printers from the Windows spooler, marks the default, opens the selected driver's Properties, and sends the selected printer and copy count directly to WebView2 Print. Windows driver Properties remain the platform UI; the app does not fake driver-specific controls. Browser-only fallback continues using `window.print()`. The regression checks exercise printer selection, Properties dispatch and copy-count routing; exact installed drivers still require owner-machine acceptance.


## Reader print preview page budget and printer alignment — 2026-10-28

The previous 80-million-pixel raster ceiling stopped an A4, 216 dpi preview at about 17 sheets. Reader now computes a safe raster density for the full print plan, retains the requested 216 dpi for short jobs, and shows an explicit resolution notice when a longer job requires a lower density. The regression covers 30 A4 sheets and verifies the total/per-sheet pixel budgets. Windows Reader CI #58 passed this change.

The printer row uses one-column field labels and fixed-height controls so printer, Properties and copies align in the same grid. E2E measures their top edges and horizontal separation. The first alignment assertion caught inherited two-column label CSS; that rule was corrected. Windows Reader CI #60 passed at code commit `a12863928b29dcd025b973c1ae4696de6bbac4c1`, including the standalone Windows x64 Reader build.

Stable promotion preserves the existing Reader branch history by fast-forward from `7ef07ed1fd310c229126909c44875f9e7774807f`; no Toolbox or main changes are included.
