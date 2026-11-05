# sReader Explorer multi-file Print

## Decision and reuse

The official [Foxit Software GitHub organization](https://github.com/foxitsoftware) publishes PDF SDK and web viewer/plugin samples, but the public repositories reviewed do not expose the Windows Reader Explorer shell integration shown in the request. The commercial Foxit Reader's shell implementation is not treated as reusable source.

Use Windows' documented shell verb selection model with `MultiSelectModel=Player` so Explorer passes a selected set in a single invocation. Use the existing sReader PDF.js print layout and its existing WebView2 `ICoreWebView2_16::Print` adapter; no new PDF renderer or printer UI is added. Windows WebView2 print calls already accept an explicit printer, copies and duplex, so batch mode chooses the OS default printer, one copy and the driver's default duplex setting.

References:
- [Windows verb selection model](https://learn.microsoft.com/windows/win32/shell/how-to-employ-the-verb-selection-model)
- [WebView2 printing](https://learn.microsoft.com/microsoft-edge/webview2/how-to/print)

## Behavior

- The current-user installer registers a PDF-only Explorer **Print** verb. It does not change Windows' default PDF application.
- Explorer starts sReader with `--print` and the selected PDF paths. The native queue canonicalizes and validates each path and uses the existing 200 MB/file and 32-request bounds. The WebView receives bytes through one-use native tickets; JavaScript never supplies an arbitrary filesystem path to a native read command.
- PDFs are printed in selection order to the default Windows printer. Each document is divided into chunks of at most 50 pages to reuse the current bounded print-layout gate. No print settings dialog is shown; printer defaults are used.
- A cold print launch stays hidden and exits after the queue completes. If sReader is already running, its window is hidden during printing and restored only if it was visible before the batch. The temporary PDF tab is removed and the prior active tab is restored.
- A missing default printer or a failed print reveals sReader with the error status. The selected source PDFs are read only.
- Uninstall removes only this sReader shell verb and preserves the user's default PDF association.

## Verification

Reader CI adds command-line parsing unit tests, installer registry checks and uninstall cleanup assertions. The Windows workflow still builds and installs the standalone Reader installer. These gates verify registration and routing; they do not claim a physical printer was attached to the hosted runner or that a real paper job was produced.
