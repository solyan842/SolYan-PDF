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

## Print, zoom, and public-PDF performance follow-up (2026-10-27)

- The normal **In PDF / Ctrl+P** path prepares the document with the existing PDF.js print pipeline and calls `window.print()`; it does not open the custom advanced-layout dialog first. The advanced-layout dialog is a separate optional path for page range/order, paper/layout, N-up, booklet, and poster tiling. Printer selection, copies, driver Properties, and duplex stay with the Windows print UI/driver.
- `desktop/reader-tests/reader-security-print.spec.mjs` verifies that Ctrl+P uses the normal print path and bypasses the advanced-layout dialog. The browser test mocks `window.print()`; it does **not** prove the native Windows printer dialog or a physical/PDF printer job. A separate manual observation on the installed Windows Reader opened its WebView2/Chromium print preview from a local one-page PDF; the configured printer was listed and the preview showed one A4 portrait sheet with duplex settings. The preview was canceled without pressing Print. This installed binary's commit was not verified, and this does not confirm the separate Windows system dialog, driver Properties, or an actual print job. Native print acceptance remains open.
- `desktop/reader-tests/reader.spec.mjs` checks that the document point at the viewer center remains within 5 CSS pixels after zoom. Reader CI #45 passed on exact code SHA `8d36793da8d7e2a74b566523f8c3e7c63700ce8e`.
- A local PDF.js rendering diagnostic used three SHA-pinned public PDFs from `benchmarks/corpora/pdf_to_office_real_diagnostic_v1.json` plus one grayscale image-only control from py-pdf/sample-files commit `02b8203bf416db3dbdb03438bc8278dfcb0555f3` (CC BY-SA 4.0). The first three source bytes and page counts were verified by the repository's existing fetcher; the additional control was fetched from the same pinned commit and SHA-256 verified. On Windows `10.0.22621`, Edge `156.0.4314.50`, Intel Xeon E5-2680 v4, 64 GiB RAM, first visible canvas was observed at:

| Public manifest case | Pages | Source bytes | SHA-256 | First canvas |
| --- | ---: | ---: | --- | ---: |
| `docx-google-doc` | 1 | 80,100 | `69f6b7f493b1bc55d518942976cbeadc4ec0a36f6d8a6dc24feffc516d35b2c9` | 965 ms |
| `docx-multicolumn` | 3 | 78,657 | `bdb495e95b3e1afae95013099dc59b0cea047f1fa70f677ee9cb33f10faa1c6c` | 380 ms |
| `docx-libreoffice-images` | 3 | 78,772 | `16cb8e10bd59e30b4d350f11d0ed9c7d0bd7e7bb962a46022c89836e2aa44f63` | 331 ms |
| `grayscale-image` (image-only control) | 1 | 40,115 | `3adfd74b88cebcdd46c83f9b1d86b6995700233126b53e2f1fcacb40eab2dc84` | 975 ms (separate cold runtime) |

  These are single-run, automation-observed **Edge UI/PDF.js** timings: the three manifest cases ran in one session (first cold runtime, then warm); the grayscale control ran in a separate cold session. They do not measure the standalone Tauri shell, Explorer IPC, native peak memory, or a cold OS cache. They are diagnostic only; no release threshold is inferred.
- The pinned Wikimedia scanned-table sample did not finish downloading during this local run, so there is no scanned-PDF timing here. Real native measurements across scanned/complex 1/100/500-page PDFs and peak memory remain open. The earlier private user PDF was tested locally and is intentionally not identified or included in this public report.

## Deferred release work

Native Windows print-driver acceptance; Unicode free-text/text boxes and Fill & Sign symbols/dates; interactive form editing with lossless save/history; editing pre-existing native annotations; bookmarks/recents with safe native reopen; document handoff to a specific Tools operation; persisted page-rotation editing (view rotation is supported); full real-corpus speed/peak-memory measurements; native dark/light taskbar and upgrade/default-association QA. Existing PDF associations are retained; installation is not a claim that Windows default-app choice was changed. Bundled Reader inside Tools uses the Tools process identity/profile; install standalone Reader for independent identity/profile.

No placeholder buttons were added for deferred functions. No gate was removed or relaxed. No merge/release or `main` modification is authorized here.

## CI handoff

One consolidated R2 push triggers existing Windows Desktop CI. GitHub owns building, waiting, the reusable result summary, diagnostic artifacts and issue #135 notifications. Installer artifacts retain established names `SolYan-PDF-Windows-x64` (sTool) and `SolYan-PDF-Reader-Windows-x64` (sReader); filenames display new product names. A pending run is not PASS. There is no configured GitHub-to-Codex wakeup; return with the generated brief for any necessary fix.

## Desktop #134 zoom lifecycle regression

The real failed job `117742451877` in run `39150320680` at `bfb31ce` failed in the Reader browser scenario: `stamp.boundingBox()` returned null after changing zoom to 150%. The pinned PDF.js `PDFPageView.update()` calls `reset()`, removing custom page children including our signature layer. Placement data survives; previously the DOM overlay was restored only on asynchronous `pagerendered`, leaving a real visibility gap.

Reader now also restores overlays on `scalechanging`, after PDF.js updates page viewports and resets page children. The existing final-render restoration, signature coordinates/resize/apply/save behavior and Toolbox are unchanged. The regression deliberately holds PDF.js raster drawing pending, proving the original implementation loses the overlay and the fix restores it immediately. It checks the same signature ID, visible positive dimensions, actual 150% page dimensions, and unchanged page-relative position/size both during pending rendering and after actual raster completion. No assertion or CI gate was removed.

Local verification: the deterministic regression failed on the original product code; all 6 Reader browser scenarios and all 6 Node / 5 original Toolbox icon tests passed after the fix. The strengthened affected scenario also passed three consecutive local repetitions before push. Native Windows CI still requires its own exact-commit result; this note does not claim CI PASS.

## Desktop #135 fractional-DPI measurement correction

Actual failed job `117745435878`, run `39151336022`, commit `e7e90b5`: the overlay was present, but the normalized geometry assertion differed by `0.0006451454` (limit `0.0005`). Investigation of pinned PDF.js `setLayerDimensions` showed it rounds CSS page dimensions down to raster-alignment steps; its logical viewport remains unrounded.

Reproduced locally at device scale 1.25: logical width `600 * 0.795 = 477` CSS px, rendered page box `476` px. The old CSS-box normalization reported x `0.4118303571` before versus `0.4109635417` after zoom, incorrectly failing. In the PDF viewport those same measured positions are `0.4109669811` versus `0.4109635417`, within the unchanged `toBeCloseTo(..., 3)` limit. The correction measures both pending-render and completed-render geometry against the fixture's PDF viewport (`600 x 800` at the actual PDF.js scale), rather than a raster-rounded layout box. It does not change signature placement or increase tolerance.

The original lifecycle fix remains. The entire open/drag/eight-handle/zoom/apply/save/reopen scenario now runs at both 100% and 125% DPI. Signature identity, visibility during deliberately delayed raster rendering, positive/changing size, exact 150% viewport dimensions, and page-relative position/size checks before and after completion remain. Local result: all 7 Playwright scenarios PASS. CI must still be checked at the new exact commit.

## Incremental R2 Fill & Sign batch — CI pending

Adds offline text (Unicode, up to 200 characters / three lines), local Vietnamese date, checkmark and cross. Reuses Quick Sign placement and eight resize handles, Save As and page-content embedding; original PDF pages are not rasterized and source text remains searchable. Inserted typed text is a flattened image, **not selectable PDF text**. Fill-only output uses `-da-dien.pdf`; mixed signature documents retain `-da-ky.pdf`. Existing annotation and signing paths stay unchanged. Includes Playwright save/reopen test. Native FreeText, AcroForm and Print remain outstanding.

## Reader R2 bookmark / resume follow-up (isolated staging branch)

Introduces **local PDF bookmarks** and automatic last-page restoration keyed by the PDF.js document fingerprint, without storing document bytes, filenames or filesystem paths. Users can save a page in View, jump to it from the sidebar, remove it, reopen the same PDF and resume reading. Save pages are capped at 100 per document; storage errors do not block reading. A browser end-to-end regression checks persistence, page restoration, navigation and deletion. No actual PDF content or bookmark PDF catalog is modified; this is a viewer-local navigation feature. This follow-up remains on a **CI-isolated branch** until the prior Windows #137 build finishes and is verified.
