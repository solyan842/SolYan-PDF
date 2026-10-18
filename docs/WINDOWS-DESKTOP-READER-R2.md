# Reader R2 — implemented subset and release evidence

This milestone builds on R1 `624f2f2240d442c8ed0189cf3ec465752b7adc41` (Desktop #133 PASS). `AGENTS.md` remains authoritative. It uses the request's section 14 permission to deliver a coherent subset; this is **not completion of the full R2 release checklist**.

## Implemented

- Existing Tauri 2, pinned PDF.js 6.4.299 and pdf-lib 1.17.1 retained. Tools services and processing routes remain intact.
- Compact categorized toolbar, text selection/copy, pan, existing search/page/zoom, continuous/single/two-page layouts, view rotation, fullscreen and persistent light/dark preference.
- Highlight/underline/strike (selected text or dragged region), Unicode sticky notes, ink, rectangle, ellipse, line and arrow. Pending marks can be moved/resized/deleted, erased, undone/redone per document (30 history snapshots).
- PDF-native annotations with vector appearance streams, Unicode note contents and preserved original text. Reopening shows saved annotations through PDF.js; editing an already-saved annotation is deferred.
- R1 image signature placement, eight handles, physical-size page replication, flattening only signature images, source-preserving Save As and native atomic replacement retained. Placement survives zoom/view rotation.
- **Reusable signature library**: mouse/image/typed artwork is automatically saved locally on creation; preview, use in another PDF, rename and delete. Persistence uses the application's WebView profile (`localStorage`, key `sreader.signatures.v1`, 3 MB bound, deduplication). It survives application restarts while that profile is retained. Reader and Tools have separate profiles; there is no cross-profile sync, server upload or encryption claim. Removing a library entry cannot remove signatures already written into PDFs. Quota errors keep the placed signature and report the failed library save.
- Signed-PDF modification warning when an existing populated signature field is detected. This does not validate certificates; encrypted PDFs unsupported by pdf-lib fail saving explicitly.
- Thumbnail canvases released outside the sidebar's visible margin; PDF.js retains its bounded page buffer. Document close destroys PDF tasks and aborts document event handlers.
- Approved sReader/sTool raster artwork integrated unchanged into window/EXE/bundle/shortcut config and UI, with distinct existing identifiers/binary names. Tools prefers installed standalone Reader; bundled Reader remains available when it is absent. Reader can launch new or legacy installed Tools. Current document transfer is deferred.

## Validation and measurements

Local Windows: 6 Node tests (geometry, all page rotations/cropped origins, native annotations, source text, asset hashes/identities) and 6 Playwright scenarios PASS; original 5 Phosphor Tools tests PASS. Actionlint and edited PowerShell parsing PASS. Browser native-dialog mocks test the bridge contract, **not native OS Save As or installation**. No Rust/Cargo is installed locally; the existing full Windows Desktop workflow remains the native build/install gate, including all Tools/D6 checks and standalone Reader without engines.

Synthetic 100-page text fixture, Chromium 145.0.7632.6, Windows 10.0.26300, Intel i5-1135G7, 25,381,203,968 bytes RAM: first page 521 ms, jump to page 100 134 ms, 4 page canvases at measurement. These include browser/test overhead and are a single observation, not a performance guarantee. The scenario writes `reader-performance.json` into retained browser diagnostics on CI. Native peak RAM and real 1/100/500-page mixed, scanned and complex corpus benchmarks remain unmeasured. Generated text pages must not be represented as a real corpus.

## OSS decision

- [Rune](https://github.com/DanialJaved/rune): reference for compact/contextual tools and restrained document UI. Its WinUI/PDFium implementation is not imported.
- [SumatraPDF](https://github.com/sumatrapdfreader/sumatrapdf): reference for bounded rendering and fast navigation; no code/assets imported.
- GPL reference applications provide UX ideas only. Existing permissive PDF.js/pdf-lib handle parsing/rendering/writing; no new PDF parser, framework replacement or copied GPL code.
- Additional MIT Phosphor originals are separately pinned in `desktop/ui/reader-icons/SOURCE.json`; the original 86 Tools SVG contract is unchanged.

## Deferred release work

Print; Unicode free-text/text boxes and Fill & Sign symbols/dates; interactive form editing with lossless save/history; editing pre-existing native annotations; bookmarks/recents with safe native reopen; document handoff to a specific Tools operation; persisted page-rotation editing (view rotation is supported); full real-corpus speed/peak-memory measurements; native dark/light taskbar and upgrade/default-association QA. Existing PDF associations are retained; installation is not a claim that Windows default-app choice was changed. Bundled Reader inside Tools uses the Tools process identity/profile; install standalone Reader for independent identity/profile.

No placeholder buttons were added for deferred functions. No gate was removed or relaxed. No merge/release or `main` modification is authorized here.

## CI handoff

One consolidated R2 push triggers existing Windows Desktop CI. GitHub owns building, waiting, the reusable result summary, diagnostic artifacts and issue #135 notifications. Installer artifacts retain established names `SolYan-PDF-Windows-x64` (sTool) and `SolYan-PDF-Reader-Windows-x64` (sReader); filenames display new product names. A pending run is not PASS. There is no configured GitHub-to-Codex wakeup; return with the generated brief for any necessary fix.
