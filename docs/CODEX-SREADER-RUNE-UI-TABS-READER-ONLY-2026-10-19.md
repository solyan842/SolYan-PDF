# sReader PDF — RUNE REFERENCE / SINGLE-WINDOW / READER-ONLY CI — CODEX DELIVERY SPEC
Date: 2026-10-19 (Asia/Ho_Chi_Minh)
Owner's new instructions: study ALL features and the real store screenshots of Rune, not generic mockups; drastically slim the sReader interface; Windows Explorer double-click on a new PDF adds a tab to the existing sReader window, not a new application window; get sReader finished on its own without building the heavy sTool PDF every time. Present designs to the owner for visual acceptance where new UI layout is materially changed.

## 0. AUTHORITY, BRANCH, CURRENT PASS
Source of truth is always live GitHub, current ref, \`AGENTS.md\`, product locks and actual Actions/logs; any dated SHA below becomes informational when HEAD moves.
- Canonical: https://github.com/solyan842/SolYan-PDF
- CURRENT ACTIVE CODEx BRANCH AT AUTHORING: \`feat/windows-reader-r2-company-continuation\`, HEAD \`897a0e20d495a0c602d5ab1dee4ee01639e222f1\`. This branch supersedes stale #138 references for implementation.
- Repository-wide latest run: **Windows Desktop CI #139**: https://github.com/solyan842/SolYan-PDF/actions/runs/39193777271 ; run id \`39193777271\`; success at \`897a0e20\`, build-windows-x64 + ci-result/summarize success. CI notification job skipped; do not call it passed. Artifacts: both Reader/Toolbox Windows installers, Reader/Toolbox diagnostics and checksums.
- Previous Reader R2 baseline #138 PASS on \`bb56189\`; base branch \`feat/windows-reader-r2\` at \`04a8f07\` (documentation-only follow-up).
- Company Codex #139 FIXED bookmark lifecycle in \`desktop/ui/reader.js\`: \`r2.flushBookmark(doc)\` is now invoked before tab teardown and in beforeunload; new immediate-close/reopen browser regressions PASS. Do NOT repeat that fix. See \`docs/CODEX-COMPANY-PC-CHECKPOINT-2026-10-19.md\`.
- Windows Reader R2 has no authorized public release/merge to main; main is separate web/PWA v0.2.0 line.
- This DOCS-ONLY spec does not mean the UI, single-instance, isolated CI, presentation, Print or form work is implemented. They require their own changes, tests and exact-head CI.
- Before writing: \`AGENTS.md\`, \`README.md\`, \`docs/WINDOWS-DESKTOP-UX-LOCK.md\`, \`docs/WINDOWS-DESKTOP-ICON-LOCK.md\`, \`docs/WINDOWS-DESKTOP-READER-R1.md\`, \`docs/WINDOWS-DESKTOP-READER-R2.md\`, company checkpoint, \`desktop/src-tauri/\`, \`desktop/ui/reader*\`, \`desktop/reader-tests/\`, and actual workflow state.

## 1. VERIFIED RUNE REFERENCES — READ THEM, DO NOT GUESS
Upstream: https://github.com/DanialJaved/rune
Exact screenshot set: https://github.com/DanialJaved/rune/tree/main/docs/store-screenshots
There are 10 reviewed reference screenshots:
1. \`01-reading-light.png\`: true chrome-style titlebar tabs + ONE short command strip, document canvas dominant, sizeable left thumbnails, zoom pill lower right.
2. \`02-night-mode.png\`: page colours inverted as well as surrounding dark reader; this is NOT merely CSS dark shell.
3. \`03-chapters.png\`: clean sidebar with chapter outline, not a permanently visible multilevel tab/ribbon.
4. \`04-annotation-toolbar.png\`: middle header group contains pen/highlighter/note/sign/eraser; selected tool pops a small palette for colour, style and opacity BELOW the icon.
5. \`05-form-filling.png\`: native/interactive PDF AcroForm field editing, not a picture pasted on top of the form.
6. \`06-presentation.png\`: full black backdrop and SINGLE fitted page, no sidebar, no tab/title/menu chrome.
7. \`07-signature.png\`: small, clean drawn/typed/image signature dialogue; local paper background removal is an optional reference enhancement.
8. \`08-page-editing.png\`: selected page thumbnails + page reordering/copy/cut/paste/export.
9. \`09-shortcuts.png\`: readable keyboard shortcut reference F1; shortcut functions must be real.
10. \`10-signature-resize.png\`: selected object with compact resize handles; keep SolYan's previously approved 8-handle geometry and placement behavior.
Additional user-provided Rune screenshot: compact dark hamburger menu, showing Open, Undo, Redo, Save, Save as, Print, Rotate, Pen colour and width submenu, Presentation (F5), Document properties (Ctrl+D), Keyboard shortcuts (F1), Check for updates, Settings. The Rune source itself has more context options (Share, Flatten annotations, Bookmark, command palette, Signature details, Report a problem); do not overfit to one screenshot/version.
Key Rune files worth inspecting only for FUNCTIONAL UNDERSTANDING:
- \`src/Rune.App/MainWindow.xaml\` (titlebar tabs, 1 row toolbar, menu, floating zoom)
- \`src/Rune.App/MainWindow.xaml.cs\` (tab lifecycle and interactions)
- \`src/Rune.App/MainWindow.Tools.cs\` (popover tool settings / signature)
- \`src/Rune.App/Controls/DocumentView.xaml\` (sidebar/thumb/outline/bookmarks)
- \`src/Rune.App/Controls/PresentationView.xaml[.cs]\` (F5 display behavior)
- \`src/Rune.App/Services/PrintService.cs\` (print UX, not reusable implementation)
- \`src/Rune.App/ShortcutCatalog.cs\` (shortcuts)
- \`src/Rune.Engine/AppState.cs\` (recents/settings/session)
- \`README.md\`, \`PROJECT.md\` (full published feature inventory).
**LICENSE FIREWALL:** Rune is GPL-3.0; use its UX, screenshots and functionality as REFERENCES ONLY. Do NOT copy C#/XAML/asset code into SolYan's Apache/MIT project unless a fully reviewed compatible license strategy is explicitly approved. Do not switch Tauri/PDF.js/pdf-lib to WinUI/PDFium just to look like Rune.

## 2. LOCKED INTERACTION — WINDOWS EXPLORER DOUBLE-CLICK => NEW TAB, SAME WINDOW
This is a user-visible MUST, not an optional preference.
- A.pdf is open in sReader. User double-clicks B.pdf in Windows Explorer (or Open With -> sReader): **reuse the existing sReader process/window**, append B.pdf as a tab, switch focus to B tab and restore/unminimize sReader.
- User opens A.pdf again: activate existing A tab instead of creating duplicate. Identify same source by canonicalized native filesystem identity/path, not only basename; files with same filename in DIFFERENT folders are distinct; support Unicode (Vietnamese) paths, spaces, parentheses, long/UNC paths as supported by Windows APIs.
- With NO running sReader, launch first window and open PDF in one tab. Multiple PDFs passed by shell/CLI: one tab each (unique source).
- Separate tabs have their own page, zoom, search, bookmarks, annotations, pending signature/form changes, scroll and dirty state. Switching tabs NEVER silently saves/discards edits. Closing an unsaved tab prompts; Ctrl+W closes the ACTIVE TAB not the whole app.
- If one file is corrupt/password-protected/too large, show an actionable error without losing other tabs. Existing per-file 200 MB upper bound remains unless independently revisited with measured evidence.
- No second persistent WebView window, no new Reader sidecar and no document bytes passed insecurely through arbitrary web URLs. Do not silently steal Windows .pdf default association from user; explicit Open With is valid.
- Native design: inspect existing \`reader_initial_file\`, Tauri reader-only startup and \`reader.js::openFile()\`. Add single-instance mechanism ONLY for Reader (Tauri 2 maintained official \`tauri-plugin-single-instance\`, minimum version with Windows focus fix 2.4.5 if compatible with Rust/MSRV); register FIRST as docs specify, use native argv forwarding/queue to front window, then deliver validated file requests into Reader. Existing app manager focus and first-launch argv need robust lifecycle; if file launch precedes WebView JS event-listener readiness, keep bounded queue and drain upon ready. Avoid a startup focus race and lost events. Do NOT accidentally make Reader and Toolbox share a process identity/lock.
- A bridge can validate and read files natively under a narrowly scoped command; forbid web content from arbitrarily reading arbitrary paths without user/OS-request provenance. The app already has \`reader_initial_file\` and native \`reader_save_as\`; prefer adapting them, do not invent an unrestricted filesystem API. If a plugin is used, document pin/version/MSRV and why.
- OS integration TEST REQUIRED: install Reader; launch A.pdf from Explorer/file association; then invoke the installed EXE/open-with B.pdf while A is active. Assert one persistent sReader window/process, two tabs, B selected, correct A/B content. Repeat same file, alternate folder same basename, Unicode paths, foreground/minimized, splash/pre-ready race, close dirty tab, restart. Browser tests should test the JS forwarded-file event contract separately; simulated WebView bridge is NOT real Windows Explorer acceptance.

## 3. SREADER UX — EXACT RUNE SPIRIT, NOT A NEW RIBBON
Target Windows 10/11 native-feeling, compact and document-first. Final app visually akin to Rune's screenshots; retain approved SolYan icon, theme and original functional contracts. Demo/mockup is a reference ONLY until user accepts.
- Two visually thin horizontal bands MAXIMUM: (1) titlebar + document TABS, (2) 40–46 px single command bar. Remove the large separate \`header\` + \`#tabs\` + \`ribbon-tabs\` + \`ribbon-panels\` + \`.toolbar\` STACK. Do not merely hide features or leave big empty padding. Avoid OS/mac-style fake traffic lights; preserve Windows controls/drag regions/focus.
- Titlebar (about 36–42px): approved sReader icon/name + file tabs (close/add, dirty dot, ellipsis, keyboard, drag regions). Tab row is visually part of titlebar; if true native overlay is difficult under Tauri WebView2, emulate proportion accurately without insecure/fragile window dragging or breaking caption buttons. Do not require custom OS chrome if it regresses native behavior.
- Command bar (about 40–46px): LEFT sidebar toggle, current page/page count, fit-width/fit-page, rotate/view history; CENTER pen/highlighter/note/text/image/sign/eraser contextual icons with accessible tooltip; RIGHT find, night mode, 3-line hamburger menu. Group icons by logical space; avoid giant permanent text labels, broad buttons, stacked category tabs and permanent oversized search.
- Sidebar at ~230–270 px on desktop, hide/resizeable and remember choice. Large thumbnails with page number; thumbs / chapters / bookmarks SWITCH using three compact icons in a strip at bottom, as Rune. Chapter tree correct; current selected page obvious. No a fourth always-visible ribbon for bookmarks.
- Floating zoom pill bottom-right (+, percentage, -, preset fit) overlays canvas without stealing vertical space. Fit-page and fit-width commands remain accessible. On opening an enormous physical page (e.g. user's 1000×1000mm sample), DO NOT make page appear arbitrarily cropped because "fit width" is too large; apply sensible initial fit-page/fit-width per user/default, keep actual-size navigation reachable. Native content text/selectability retained; do not redraw document image.
- Contextual tool popovers below icon: highlighter colors/opacity/style (highlight/underline/strikeout), pen color/width, shape settings, signature choice; active tool is clearly visible; keep popovers inside window and keyboard accessible.
- Night mode is SEPARATE from shell dark theme: Rune inverts page (and thumbnail) colours for night readability; implement only with tested suitable visual transforms so PDF contents and signatures remain sensible, never mutate/save PDF bytes.
- Main menu: \`Mở… (Ctrl+O), Hoàn tác (Ctrl+Z), Làm lại (Ctrl+Y), Lưu (Ctrl+S), Lưu thành… (Ctrl+Shift+S), In… (Ctrl+P), Xoay (Ctrl+R), Màu/nét bút >, Trình chiếu (F5), Thuộc tính tài liệu (Ctrl+D), Phím tắt (F1), Cài đặt\`. Add supported entries for Flatten, Bookmark, Palette, Share/Updates only if implemented or clearly differentiated. No fake enabled menu entries. Save must not silently overwrite the source (retain existing Save As/unsaved safety contract unless user specifically approves changing it). Menus disable unavailable actions honestly; show accelerator text.
- Include a keyboard-first \`Ctrl+K\` command palette/quick action, F1 shortcut list and context menus as appropriate; large full-screen modal galleries not acceptable. Focus, tab traversal, 125% DPI and high contrast must work.
- Avoid a fixed right properties panel while reading; show contextual panel only when editing/selection warrants it.
- Must use existing app's approved icon pair unmodified in \`desktop/branding\` and pinned local Phosphor Duotone SVG system, with readable Vietnamese tooltips. Do not replace with Rune's glyphs/logo/assets or external CDN. Maintain sTool visuals and existing icon tests.
- User's captured sReader screenshot at 1708×928 is the BEFORE example with ~five bulky stacked rows; treat its layout as a regression to eliminate.
- Pixel/proportion acceptance: compare finished 1440×900 and 1708×928 screenshots against Rune \`01\`, \`03\`, \`04\`, \`08\` and user's sReader BEFORE. Major toolbar height reduction should leave visibly MORE vertical space for PDF, not larger tool icons. Build dark-mode screenshot too.
- Show preview screenshot to the user BEFORE claiming final visual approval. Automated tests cannot approve aesthetics.

## 4. F5 PRESENTATION — SEPARATE VIEW MODE (NOT generic browser fullscreen)
- Menu "Trình chiếu" with shortcut F5 (not merely current \`fullscreen\` button). Enter from CURRENT page, hide ALL app title/tabs/sidebar/toolbars/status, black full-monitor backdrop, one PDF page FITTED inside available screen maintaining aspect ratio (not full-width crop).
- Next/previous by Right/Left, PageDown/PageUp, Space/Backspace and optionally mouse click/wheel with intentional, documented mapping; Home/End go first/last. ESC quits; F5 toggles according to platform expectations. Restore former page, zoom, scroll, sidebar and edit state on exit. No accidental annotation edits during presentation.
- Render on demand with bounded PDF.js/canvas memory, preserve actual PDF geometry; don't render all pages or convert whole document. Correct mixed page size, orientation, rotate/crop, blank and scanned pages; presentation under both light/dark shell (black surround).
- For files >1 page, test keyboard navigation, current-page start, ESC restore, document replacement, failure/cancel, zoom fit and screenshots. Fullscreen API/WebView2/native Tauri behavior must be verified on actual Windows CI/QA.

## 5. COMPLETE RUNE FEATURE AUDIT (capability parity, not a blind rewrite)
The following are Rune's documented capabilities. For each, inspect CURRENT SolYan implementation and classify DONE / PARTIAL / MISSING. Prefer existing PDF.js/pdf-lib capabilities; never blindly claim Rune parity.

### Read / navigate
- Multi-PDF titlebar tabs, lazy background tabs, Explorer single-instance activation — target contract §2; tabs inside JS already exist but OS reuse is MISSING.
- Virtualized progressive page rendering, capped canvas and thumbnail cache — existing bounded PDF.js lazy baseline; *tile-level Rune PDFium* is NOT in SolYan, do not rewrite for parity alone.
- Zoom around cursor / wheel, fit-width/page, real zoom, rotations and 1/2-page views — baseline includes most, cursor anchored zoom and persisted source rotation may be missing.
- Sidebar thumbs/chapters/bookmarks, internal PDF links + browser-safe external link policy, backward/forward navigation history — partial.
- Search/highlight all, text selection/copy, page navigation — baseline mostly done.
- True PDF-page night inversion, screenshot/page color semantics — existing dark UI alone is not equivalent.
- Presentation F5 — MISSING.
- Recents homepage with thumbnails, reopen safe native path, restored tabs AND scroll/zoom — only local last-page bookmarks currently exist; full native reopen missing.
- Robust damaged/password PDFs and efficient very large files — current 200 MB Reader bound: do NOT claim Rune 4 GB support.
- Document properties: page/paper dimensions, fonts, embedded/security, size, signatures, file path — MISSING/needs evidence.
- Command palette Ctrl+K, F1 shortcuts overlay, touch/pinch support, keyboard/Vim optional — MISSING/PARTIAL.

### Annotations / editing
- Highlighter/underline/strikeout, pen, sticky notes, erase, colors/width/opacity popup — R2 tools exist; Rune-like contextual settings need work.
- Native annotation roundtrip with undo/redo, reopen and edit saved annotations — new marks saved, preexisting-native edit is deferred.
- Free text box with caret, formatting, Unicode, color, real searchable PDF text, resize/reflow — CURRENT sReader Fill & Sign Unicode text is a *transparent raster image*, not real searchable/editable PDF text. Treat as PARTIAL, do not claim parity. Use Unicode font embedding and native PDF structures rather than converting entire PDF pages to images.
- Insert image PNG/JPEG/BMP/GIF/TIFF as placed resizable item, preserve alpha and proper export — only signature image can be imported into Quick Sign; other image placement must be implemented separately.
- Page editing via thumbnail multi-selection, rearrange, delete, copy/cut/paste across tabs, drag inserted PDF pages, extract pages — NOT in lightweight Reader yet; core sTool capabilities exist. Choose thin routing vs local Reader convenience deliberately; do not silently discard features already in sTool.
- Flatten annotations/forms explicitly, preserve original PDF unless user confirms new output — sTool has flatten; Reader integration TBD.
- Context menus selection/objects/pages/fields and shortcuts — partial.
- Undo/redo across text/page/annotation operations and dirty-state document tabs — currently placement undo/redo, broader history TBD.

### Sign / forms / print
- Draw/type/import signature, optional remove-white-paper background, locally saved/reusable artwork, transparent preview, direct click placement, proportional handles/position, multi-page placement — SolYan Quick Sign MUST remain intact; image signature is NOT PKCS#12. Rune's photographed paper removal and pre-placement ghost are optional improvements once no regression.
- Read-only digital signature details, no validity claim; certificate signing stays in sTool pyHanko, never claim Rune verifies.
- AcroForm text/dropdown/checkbox/radio edits, appearance/persistence; XFA accurately described as unsupported; no PDF JS execution — Reader native fill/save missing, existing sTool/web implementation may be reused.
- Print with dialog, page selection and mixed sizes: use PDF-aware pipeline and render only needed print pages when printing, not only lazy onscreen pages. Rune's printing rasterizes selected pages at printing DPI; do not misdescribe its implementation as vector-preserving. Preserve selectable/vector source in saved PDFs and test print size/rotation separately.
- OS Share, optional app updates/settings, no account/network requirement for ordinary reader use — later if needed.

### Accessibility, preferences and performance
- Touch/pen: finger pans, pinch zoom, press-hold annotation menu, comfortable hit targets; keyboard tab/focus; high-DPI scaling.
- Settings: theme, sidebar, behavior, recents, zoom, signature assets; no extraneous telemetry.
- No auto-updater or "Check for updates" menu unless real update source/flow exists; no phantom buttons.
- Rune uses WinUI3/PDFium; SolYan keeps Tauri2/WebView2/PDF.js/pdf-lib unless a separate user decision authorizes an engine/UI framework change.

## 6. CI/INSTALLER — DEDICATED READER-ONLY LANE FIRST, NO TOOLBOX PACKAGING PER UI CHANGE
Evidence: existing \`.github/workflows/windows-desktop-ci.yml\` runs full 5-sidecar Toolbox staging (core, Office, OCR, pyHanko, PDF/A) and NSIS installer **BEFORE** its final "Build independent lightweight Reader installer" and smoke. #139 Toolbox installer artifact ~889 MB, Reader ~7 MB. This is why tiny Reader changes incur a huge Actions runtime.
The standalone Reader already exists as \`reader-only\` Cargo feature with \`tauri.reader.conf.json\` (resources:null), distinct identifier \`vn.solyan.pdf.reader\`, executable \`solyan-pdf-reader.exe\`; reader-only startup already avoids starting Tools services. The missing element is **independent Reader-specific CI**, not a total project split/rewrite.

### REQUIRED new independent Reader workflow
- Create \`.github/workflows/windows-reader-ci.yml\`, Windows-latest, explicit Reader-only triggers on active Reader development branch and workflow_dispatch, precise path scopes; configure concurrency to cancel redundant runs of the SAME Reader branch, but don't stop a full Toolbox release gate.
- STAGE ONLY pinned \`desktop/reader-tests\` Node dependencies, offline PDF.js/pdf-lib/approved Reader icons; run Reader Node tests + browser Playwright tests, Reader-focused DOM/CSP/icon contracts. Avoid running unrelated Python, LibreOffice, PaddleOCR, Tesseract, archive/sign services or installing large models. Use Rust/Tauri only for the standalone Reader build and native integration acceptance.
- Build \`desktop/src-tauri\` with \`--config tauri.reader.conf.json --features reader-only --bundles nsis\`; fail if config accidentally includes \`core/office/ocr/sign/archive\` resources. Install into clean disposable Windows runner, run Reader-only startup smoke + test Windows process behavior for double-click two PDFs; uninstall and check no orphans, checksum and size. Reader expected to remain lightweight (measure actual artifact; don't assert magic byte limit without baseline).
- Keep artifacts e.g. \`SolYan-PDF-Reader-Windows-x64\`, \`windows-reader-diagnostics\`, Reader installer checksum, exact git SHA, per-test outputs; upload \`if: always()\` diagnostics preserving command exit status. Reuse existing scripts where safe.
- Establish a **fast local preview gate**: Node test/Playwright against reader.html, screenshot compare 1440×900 + 1708×928, optional \`cargo check --features reader-only\`; only push when coherent and locally tested.
- The existing \`windows-desktop-ci.yml\` and Toolbox D6 security, installer, PDF/A/sign, Office/OCR/OCR 27/68 release gates MUST STAY. Full Desktop CI is reserved for integration/release checkpoints, not every Reader CSS tweak. Prevent accidental duplicate workflows on the same push/PR; ensure Reader CI path filters and PR strategy avoid original full Desktop CI every time. The current full Windows Desktop workflow triggers on *all* PRs touching \`desktop/**\`; explain how branch/PR selection avoids it, rather than quietly removing gate coverage.
- If native Reader-only builder unexpectedly needs a bundled artifact, fix Reader package config/staging narrowly; do not import five Toolbox engines to satisfy Reader build. Do NOT build 889 MB Toolbox first for a ~7MB Reader GUI revision.
- Integrate staged Reader feature branch with active company development branch when local tests and Reader-only CI PASS, then run ONE exact-head full Desktop compatibility gate at meaningful merge/release boundary. Do not merge directly to main.

## 7. EXPLICIT PRIORITY / ACCEPTANCE CHECKPOINTS FOR CODEX
A. FIRST establish Reader-only CI and standalone build independence, with artifact and zero sidecar checks; one test workflow, NOT full Toolbox. Keep #139 baseline intact.
B. Add native single instance and Explorer/open-with-to-EXISTING-WINDOW TAB; reliable readiness queues, 2-PDF scenarios and process/window assertions. Fix same-file dedupe and stale-session prompts. This is release-blocking.
C. Implement Rune-compact Reader window: titlebar tabs + ONE slim toolbar, sidebar modes, bottom-right zoom pill, context popovers and proper menu/shortcuts. Show real screenshots from running UI at 1440×900, 1708×928, dark; compare images before declaring layout accepted.
D. Implement true F5 presentation: black fullscreen fit-page, keyboard navigation, ESC returns; never confuse with ordinary fullscreen.
E. Finish Print, AcroForm, genuine native Unicode text, document properties, recents/session and additional Rune parity as feasible; preserve existing functionality, no fake controls. Reader <-> sTool document handoff after Reader acceptance, separate from Reader-only fast gate.
F. Keep Quick Sign overlays/8 handles/zoom and 125%-DPI regression, source bytes, native Save As cancel behavior, signature library, local data privacy and all original Toolbox modules/tests. Run complete Windows integration gate at a deliberate milestone.
For each checkpoint: list exact changed files, tests + output, commit SHA, CI run id/status/artifacts, screenshots for UI, known limitations. Do not call the app "Rune-parity-complete", merged or released without evidence.

## 8. RESOURCE EFFICIENCY / WORK-CONTINUATION RULES
- GitHub remains the common source between home and company PC. Inspect HEAD + repository-wide latest run before every new session. Follow all \`AGENTS.md\` rules. One active writer per code branch; do not overwrite company Codex work.
- User's "ok", "tiếp" means keep implementing automatically; no routine confirmations. Pause only on genuine decision/credential/permanent blocker.
- ChatGPT can do OSS research, screen reviews, CI diagnosis and create handoffs. Codex should spend its quotas writing/testing actual code. Use Medium for straightforward changes; High only for complex Windows single-instance/CI races/PDF mutation.
- Work in coherent batches, run LOCAL fast tests first, trigger one small Reader-only CI when necessary, then STOP spending agent time while CI executes. No polling every few seconds and no full Toolbox re-packaging for UI-only commits.
- On failed job: read exact real raw log once, then diagnostic artifact fallback; no guessing or repeated inaccessible queries. Never weaken tests or enlarge benchmark tolerance to green CI.
- When Codex quota is near limit, save a verified checkpoint on GitHub (without committing secrets, private PDFs, local signature profiles) with branch HEAD, what passed, blockers and next exact task; then resume when quota available. PC stays on 24/7 only for availability, not automatic autonomous work.
- For UI changes user already selected Rune as visual reference; do not debate redesign. If exact native titlebar integration risks functionality, present minimal safe technical adaptation and running screenshots for acceptance, not a wholesale engine change.

## 9. ONE-SENTENCE START COMMAND
"Open \`AGENTS.md\` and this spec at current GitHub HEAD; confirm #139 or newer latest repo-wide run; keep Quick Sign, icons and Toolbox locked; establish fast Reader-only Windows CI; make Explorer double-click open PDFs as tabs in the existing sReader window; rebuild sReader UI to exactly two slim rows based on all Rune screenshots and real source; implement F5 presentation; test locally and with Reader-only installer; show actual GUI screenshots; continue rest of parity without expensive Toolbox CI until final integration gate."
