# Reader: CCITT QR image omitted — decoder resource URL correction

Base: stable/sreader-20261021,
7ef07ed1fd310c229126909c44875f9e7774807f (Reader CI #42 PASS, owner tested OK).

## Reproduction and actual cause

The owner supplied a local one-page PDF where the background image rendered
but the QR image was omitted. It has no XFA and no form fields. The QR is an
ordinary 1-bit CCITTFaxDecode image. Both PDFium and Poppler render it.

Reader reproduced:
- /vendor/pdfjs/build/vendor/pdfjs/wasm/jbig2.wasm -> 404
- /vendor/pdfjs/build/vendor/pdfjs/wasm/jbig2_nowasm_fallback.js -> 404
- Unable to decode image / JBig2 failed to initialize.

Pinned PDF.js 6.4.299 uses the jbig2 decoder module for CCITT too. Reader passed
a relative wasmUrl; the worker resolved it below its own build directory.
The packaged decoder files already existed. This is an asset URL bug, not
missing QR recognition, XFA or a need for another PDF renderer/QR library.

## Narrow correction

Reuse the pinned PDF.js and existing packaged resources. A shared small module
resolves wasmUrl/cMapUrl/standardFontDataUrl with new URL(..., import.meta.url).
Reader display and every advanced-print loading path use those absolute URLs.
Do not upgrade the renderer, enable PDF scripting/XFA, relax CSP, alter PDF
bytes, add a network service or change approved UI.

The same owner-provided local PDF now renders its QR; decoder request is
/vendor/pdfjs/wasm/jbig2.wasm -> 200, without image-decoder warnings.
The original PDF's SHA256 was rechecked unchanged. Customer file, screenshots,
QR activation payload and personal identifiers are NOT committed or uploaded.

## Public regressions and local results

Synthetic CCITT Group 4 fixture is generated solely from public literal
SOLYAN QR REGRESSION using ReportLab QR encoder + Pillow. Its provenance and
matrix are tracked; no customer pixels/data are present.

Tests compare all 441 module centers in rendered document and print canvases
at 100% and 125% DPI, plus an intentionally unavailable WASM forcing the
packaged JS fallback. Missing images cannot pass these pixel checks.
The shared public fixture also extends installed native-activation acceptance
to require all 441 QR modules in the real Windows WebView2 canvas and unchanged
source bytes.

Local checks:
- 19/19 Node tests PASS.
- Complete browser suite 46/46 PASS on the render correction.
- Affected security/print/QR suite 5/5 PASS after sharing the native fixture.
- Package/assets/CSP contract and JS syntax PASS.
- Actual customer PDF visually compared against PDFium and Poppler locally.

## CI sequencing / resume

sTool Installer #5 at 92128be is still running:
https://github.com/solyan842/SolYan-PDF/actions/runs/39754231053
Respect the no-parallel-Windows-build/quota rule. Save this tested candidate
on checkpoint/windows-reader-qr-assets-20261022; that branch triggers no build.

After sTool #5 concludes, create feat/windows-reader-fast-qr-assets at this
candidate SHA, run ONE Reader-only CI (including the new native QR assertion).
Require exact-head PASS before offering a Windows installer or stable update.
Reader stable is unchanged; this checkpoint is NOT installed Windows PASS.

sTool output saving remains the next sTool product priority per the owner's
correction in checkpoint/windows-stool-installer5-20261022. Do not lose that
work when handling this isolated Reader display regression.
