# NEXT CODEX WORK — sReader after independent CI #1 PASS
Date: 2026-10-19, Asia/Ho_Chi_Minh
Status: ACTIVE NEXT TASKS / CODEX TAKEOVER / Windows sReader ONLY

## Read & reconcile before any action
Canonical repo: https://github.com/solyan842/SolYan-PDF
Read `AGENTS.md`, `docs/CODEX-SREADER-RUNE-UI-TABS-READER-ONLY-2026-10-19.md` (the comprehensive Rune UX + feature/parity spec, including its reviewed ten official Rune screenshots), `docs/WINDOWS-READER-ISOLATED-CI.md`, `docs/WINDOWS-DESKTOP-READER-R2.md`, `docs/WINDOWS-DESKTOP-UX-LOCK.md`, `docs/WINDOWS-DESKTOP-ICON-LOCK.md`.
Inspect current GitHub repo-wide latest Actions (NO branch filter), exact active branch HEAD, current git status, open PRs and already implemented changes. GitHub HEAD always supersedes dated snapshots here.

Verified completed checkpoint before writing this handoff:
- Active development branch: `feat/windows-reader-fast-ci` at `df272a211325a24811d7017d7ed83cf55a5788fa`.
- Latest repository-wide workflow: **Windows Reader CI #1**, run https://github.com/solyan842/SolYan-PDF/actions/runs/39201915735, SUCCESS on the same SHA. All 6 Node tests, all 11 Playwright scenarios PASS, standalone Tauri Reader Windows NSIS build PASS, installed startup/zero Toolbox sidecars/uninstall/no-orphans PASS. Reader installer artifact `SolYan-PDF-Reader-Windows-x64` (~6.96 MB). This supersedes the earlier full Windows Desktop #140 FAIL on parent `d32014c`: the zoom DOM lifecycle test was fixed on fast-ci branch. The older company branch `feat/windows-reader-r2-company-continuation` and PR #137 are not yet integrated.
- `.github/workflows/windows-reader-ci.yml` already exists and works. DO NOT recreate fast CI or cherry-pick the abandoned alternative test commit `9a15d64`; Codex's fix is already PASS.
- No code changes are included in this handoff. Future tasks below are **NOT DONE** until verified on an actual commit/CI, even if spec exists.

## PRODUCT POLICY (LOCKED)
1. Complete sReader PDF as a **standalone Windows 10/11 application first**. Keep sTool PDF/Toolbox unchanged and separate. Small Reader changes must not stage Python/LibreOffice/OCR/pyHanko/archive or build the ~889 MB Toolbox installer.
2. Keep existing Tauri2 + PDF.js 6.4.299 + pdf-lib 1.17.1, sReader approved icon and pinned Phosphor SVGs. Preserve Quick Sign (8 handles, multi-page, source immutability, PDF text retained), native annotations, saved signatures, per-file bookmarks/resume, native Save As, correct 100/125% DPI geometry and current tests. Neither replace PDF engines nor copy GPL Rune code/assets (only study and adapt UX behavior).
3. Owner's definitive Windows interaction: clicking/double-clicking a PDF in Explorer while sReader is ALREADY open opens a NEW TAB in the SAME existing sReader window, not a separate top-level window/process. Opening already open PDF focuses its existing tab; different paths with same basename remain distinct. The behavior must work via .pdf association / Open With.
4. Owner rejected bulky 4–5 stacked toolbar rows. Make the real Reader interface visually **close to Rune**, two thin rows total: (a) compact window/titlebar with PDF tabs, (b) one compact icon toolbar; document-first, ~230–270px thumbnails/chapters/bookmarks sidebar, floating zoom control bottom-right, contextual popovers and short overflow hamburger menu.
5. F5 **presentation mode** is mandatory: fit ONE PDF page fully on black fullscreen stage, no tabs/sidebar/toolbar, previous/next keys, ESC restore precisely. Current generic fullscreen command does NOT count.
6. Owner wants a **real screenshot of a running UI demo before final visual approval**, not a fictional mockup and not a claim screenshots equal production UX.
7. Never report `released`/`finished` without installed Windows real QA, CI evidence, user visual approval and explicit release authorization; main/stable untouched.

## NEXT WORK — EXECUTE IN THIS ORDER, AUTOMATICALLY
### P1: Native single-instance + Explorer -> existing window NEW TAB (FIRST)
- Explore `desktop/src-tauri/src/main.rs` (`reader_initial_file` currently only reads startup argv once); `desktop/ui/reader.js` (`openFile` currently adds tabs only within same WebView). There is NO verified interprocess activation yet.
- Adopt maintained official Tauri2 single-instance mechanism for `reader-only` feature, wired EARLY enough to handle argv and OS activation safely. Scope single-instance to the Reader profile ONLY; Toolbox remains independent.
- Queue new file-open requests until the first WebView is ready, forward subsequent Windows launches into same Reader, foreground/restore without creating a second persistent Reader window.
- Canonicalize paths by Windows filesystem rules; avoid basename-only dedupe and uncontrolled web filesystem access. Preserve Unicode/Vietnamese paths, spaces, parentheses, and UNC where supported. Multiple filenames on CLI => multiple unique tabs.
- Do not lose dirty document changes, current scroll/page/zoom, signatures, annotation state when a second file is opened. Duplicate same path -> focus existing tab; different location same name -> another tab.
- Test Windows EXE startup A.pdf followed by launching B.pdf through installed EXE and Explorer file association; assert one main window and exactly two document tabs, B focused. Repeat duplicate A, mixed-case paths, Vietnamese filenames, A dirty, minimized window, launching before WebView ready, malformed PDFs, cancel prompts, close/relaunch. Browser bridge mocks alone are insufficient. Prefer independent Windows smoke in Reader-only CI.
- Ensure Reader-only installer (no Toolbox engine) continues installing/uninstalling without orphans. Keep runtime RPC narrow and safe.

### P2: REAL compact Rune-like interface
- Read all upstream screenshots first: https://github.com/DanialJaved/rune/tree/main/docs/store-screenshots (01 reading light, 02 night, 03 chapters, 04 annotations, 05 forms, 06 presentation, 07 signature, 08 page editing, 09 shortcuts, 10 signature resize), also Rune `src/Rune.App/MainWindow.xaml`, `Controls/DocumentView.xaml`, `Controls/PresentationView.xaml.cs`, `ShortcutCatalog.cs` as behavior/layout REFERENCE ONLY.
- Remove Reader UI ribbon categories `Trang chủ/Chú thích/Điền & ký/Xem` and oversized buttons/empty header spacing. Do NOT hide functionality without providing menu/palette/inline icon paths.
- Recompose `desktop/ui/reader.html`, `reader.css`, `reader-r2.js`, `reader.js` into two thin bands TOTAL, left page/navigation tools, center compact markup/text/image/sign icons, right find/night/menu. Compact file tabs in upper band with selected/dirty/close semantics. Maintain genuine Windows caption/drag/resize controls.
- Sidebar ~230–270px (resizeable/collapsible): large thumbnails; chapters and bookmarks switching in a 3-icon strip at its bottom. Floating zoom pill on PDF canvas bottom-right; readable document has maximum area. Keep PDF text selectable and view state unaffected.
- Implement concise hamburger menu reflecting real supported functions: Open, Undo/Redo, Save As (source-safe), Print when ready, Rotate, Pen preferences, Presentation F5, Document Properties when implemented, F1 shortcuts, Settings. No clickless decorative entries. Tool-specific small popovers.
- Separate true page night inversion from shell dark theme as practical without mutating PDF; correct image signature contrast. Tooltips in Vietnamese, keyboard focus & 125% display scaling must work.
- Capture **screenshots from actual running Reader UI** at 1440x900 and 1708x928, plus dark UI and actual menu opened; compare visible heights/sidebar to Rune and the user's bulky Reader before screenshot. Provide screenshot links/evidence; visual acceptance by owner BEFORE marking UI final.
- Compatibility tests should cover tabs, search, zoom, bookmarks, signature overlays/position, PDF saved output, PDFs with mixed rotation/crop and 100/125% DPI; update DOM-based tests appropriately, never weaken their semantics.

### P3: Real presentation with F5
- Implement F5 as a separate fullscreen PDF presentation mode, NOT a generic viewport fullscreen; black full-screen background, one page fit proportionally (including very large square PDFs), no app chrome. Use current active page as start. Next/previous Right/Left PgDown/PgUp Space/Backspace; optional mouse input. ESC exits and restores original Reader view, toolbar/sidebar/theme, zoom/page/scroll/dirty state. Correct mixed page sizes, rotation, scanned documents, high DPI.
- Wire `Trình chiếu (F5)` in compact overflow menu; no phantom enable state when file isn't loaded. Run browser + native Windows acceptance tests. Compare with Rune `06-presentation.png`.

### P4: Remaining Rune functional audit / Reader finish
- Reliable ALL/range Print native Windows print preview, real AcroForm edit/save, genuine selectable UTF-8/Unicode PDF text editing (do not mislabel existing image text stamp as native text), document properties, recent documents/session restore, real edit saved annotations, thumbnail page actions/copy-paste across tabs, command palette Ctrl+K and F1 shortcuts, preferred Settings, eventual Reader->sTool current-document handoff. Prioritize explicit owner-visible functional needs over breadth. For each feature, classify DONE/PARTIAL/MISSING against full Rune handoff, and keep single Reader experience and strict source/PDF fidelity.
- Keep trademark/licensing boundaries; no GPL code copied; don't invent capabilities where PDF.js/pdf-lib lacks them. Choose maintained OSS/adapters first.

## DELIVERY / RESOURCE RULES
- One active writer per branch. Preferred implementation: continue from `feat/windows-reader-fast-ci` current HEAD, or create a focused `feat/windows-reader-...` feature branch with Reader-only workflow trigger. Avoid opening PR against `feat/windows-reader-r2-company-continuation` until a deliberate FULL integration checkpoint, because existing Windows Desktop CI triggers on desktop changes in PRs.
- Working `windows-reader-ci.yml` currently triggers on push `feat/windows-reader-fast-*` for relevant code/workflow paths. If working on another branch pattern, validate triggers before relying on CI; DO NOT create extra workflows or run redundant builds.
- For each P milestone: (a) design/source audit; (b) fast LOCAL Node + Playwright + native targeted tests; (c) coherent push ONCE to Reader-only workflow; (d) check exact-head CI after completion; (e) preserve artifacts and screenshots; (f) checkpoint and proceed automatically unless actual blocker or owner visual approval needed.
- When CI is running, STOP consuming Codex turns in tight polling. Wait, then inspect repo-wide latest run, job log ONCE if failed and diagnostics artifact fallback. Never rerun blindly. Preserve Toolbox signing/OCR/Office/D6 gates untouched; full Windows Desktop CI only at deliberate integration before release. No simultaneous PC branch writes or local file overwrites.
- User saying "ok"/"tiếp"/"tiếp tục" means continue. Ask only for actual product decision, missing rights/credentials, nonreversible action or hard tool/quota blockers; avoid needless conversation loops.
- If usage limit approaches, commit coherent safe checkpoint, report exact branch/HEAD, actual PASS and next task; stop and resume when available. Keeping company PC ON 24/7 does not make idle Codex an autonomous continuous agent.

## INSTRUCTIONS TO EXECUTE NOW (NOT JUST PLAN)
Read all required files; verify latest GitHub state; then **implement P1 NOW** in source and real Windows acceptance tests. Follow immediately with P2 actual UI implementation and screenshot review, P3 F5 and P4 audit/feature completion. Stay on Reader-only CI until release integration. Do not stop after creating another planning document. Each milestone must produce verifiable commit + tests + single standalone Reader artifact where relevant. Do not wait for another "OK" for routine progress.
