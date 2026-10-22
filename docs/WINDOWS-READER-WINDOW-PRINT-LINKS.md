# Reader window, printing and URL safety batch

Feature branch: `feat/windows-reader-fast-window-print-links`, based on verified Reader `a309a7fca9625984f5549d858a0d2ab95d71a9b2`. Stable `stable/sreader-20261021` remains at `35c642ef1468e3448ac6620da4a573763d371dc4` until acceptance. No sTool integration or main change.

## Reuse decisions

| Component evaluated | Decision and exact missing integration |
| --- | --- |
| Official Tauri window-state 2.5.0, Apache-2.0 OR MIT | Use the verified vendored crate, not a separate persistence store. Original SHA256 and minimal fullscreen patch are in `desktop/src-tauri/vendor/tauri-plugin-window-state-2.5.0/SOLYAN-PATCH.md`. Save normal/maximized state before presentation, skip fullscreen geometry, clamp restored normal windows to the monitor work area. Reader-only optional dependency; no renderer filesystem permissions. |
| Pinned PDF.js 6.4.299 print service, Apache-2.0 | Reuse PDF.js print-intent rendering and frozen annotation storage. The full upstream viewer service assumes equal page sizes and its own viewer overlay/global print lifecycle, so retain a small Reader adapter for named mixed-size sheets, cancellation and current edits. Source: https://github.com/mozilla/pdf.js/blob/v6.4.299/web/pdf_print_service.js. No PDF renderer or parser is reimplemented. |
| Existing repository `frontend/lib/n-up.ts`, `booklet.ts`, `poster.ts` | Reuse existing page-fitting, booklet ordering/padding and validated poster grid logic. Node 24 strips TypeScript during staging; generated browser modules stay under ignored `desktop/ui/vendor/reader-layout/`. A print adapter maps top-left coordinates, explicit physical scale and custom paper dimensions; it does not duplicate a PDF export engine. |
| Windows/WebView2 print UI | Keep actual printer, driver Properties, copies and duplex in the native platform dialog. Do not add fake printer lists/capability switches. Source: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/print. Physical printer behavior still needs native/device acceptance. |
| EmbedPDF print plugin | Maintained candidate, but requires its viewer/document-manager/engine stack and ultimately opens a browser print dialog. Not added beside the existing PDF.js stack solely for printing. https://www.embedpdf.com/docs/react/headless/plugins/plugin-print |
| Win32 MessageBoxW and existing ShellExecuteW bridge; maintained `url` crate | Reuse native warning/default browser rather than drawing another confirmation engine. The only new policy validates HTTP(S), rejects credentials/control characters/private/reserved destinations, checks DNS results, and prompts in native code on every IPC call. No renderer approval flag can bypass it. Domain permission persistence is optional and is not implemented. |

## Implemented behavior

- Native window persistence uses official plugin storage, retains normal/maximized geometry, omits fullscreen startup state. The feature is scoped to standalone Reader. Monitor work-area correction handles moved/removed displays without introducing an unrelated settings store.
- Print preparation supports current/all/visible/custom source pages, odd/even and reverse, mixed physical sizes, fit/reduce/actual/custom scale, fixed paper/orientation, auto rotation/centering, N-up, booklet and physical-scale tiling. Preview and output consume the same plan. Current form values, inserted signatures/content, PDF annotations and grayscale have explicit choices. Original PDF bytes are not modified. Temporary print rendering uses PDF.js, not screenshots of the viewer.
- Existing safeguards remain: at most 50 selected source pages, 100 output sheets, 12 million pixels per canvas and 80 million output pixels per batch. Large jobs must be split; do not call this unlimited all-document printing or lower safety gates to claim completion. Actual scale/tile may intentionally clip outside the chosen sheet's printable rectangle.
- PDF annotations and recognized text URLs enter the native confirmation path. Reader's own WebView can navigate only to its packaged Reader document; new windows are denied. Internal PDF destinations remain available. Unsupported schemes, credentials, literal local/reserved IPs and domains resolving to local/reserved addresses fail closed. Initial DNS validation is not a claim of controlling redirects or DNS rebinding inside the user's external browser.

## Verification and promotion boundary

Application commit: `7ef07ed1fd310c229126909c44875f9e7774807f`.
[Windows Reader CI #42](https://github.com/solyan842/SolYan-PDF/actions/runs/39737874735): **SUCCESS**, including installed Windows acceptance and uninstall.
Local final Rust tests: 15/15 PASS; complete browser suite on the prior source: 43/43 PASS. CI #42 reran the gates on the exact application commit and passed.

The native report confirms oversized placement [0,0,2500,1600] becomes a fully visible [0,0,1024,720] outer window on the runner's [0,0,1024,720] work area (96 DPI, client [1008,711]). Exact normal restart, maximized restart, and close during F11/restart all passed.
Native warning cancellation with forged renderer approval, unsafe URL rejection, WebView navigation and new-window refusal also passed. Browser Allow launch and device printer behavior are not claimed as tested.

Original installed acceptance also passed native activation, real Save As and PDF content/source preservation, session restoration, ten-tab/100-page loading, zero sidecars, clean close/orphans and NSIS uninstall.

[Reader installer artifact](https://github.com/solyan842/SolYan-PDF/actions/runs/39737874735/artifacts/12408632915):
`sReader PDF_0.1.0_x64-setup.exe`, 8,527,038 bytes.
Installer SHA256: `3f4db5e857b1f77ea99693949e38cb330e124f3f5a6f4aab02051b39a714455c`.
The downloaded installer was checked against the artifact checksum.
[Diagnostics](https://github.com/solyan842/SolYan-PDF/actions/runs/39737874735/artifacts/12408208183).

No stable promotion or sTool rebuild. Reader stable remains `35c642ef1468e3448ac6620da4a573763d371dc4`.
sTool Installer #4 independently passed at `b6778f868253362e79483ac1405c4e3b43612b1c`; its artifact remains separate.

## Outstanding acceptance

- Actual Windows printer/device Properties, copies and duplex/flip-edge behavior require a printer/driver test; preview/browser output is not evidence of paper output.
- The 50-source-page/100-sheet/pixel limits remain documented. Do not call this unlimited printing.
- External browser Allow launch and Block outcomes need dedicated native acceptance; the current native case proves Cancel and rejection cannot be bypassed.
- Advanced print controls need a follow-up English-language coverage check; the main Reader English UI has existing coverage.

This documentation-only checkpoint preserves the successful application SHA without rerunning Windows packaging. Future source changes must keep all acceptance gates.
