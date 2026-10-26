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
