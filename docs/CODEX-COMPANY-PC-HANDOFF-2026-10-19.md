# SOLYAN PDF — CODEX HANDOFF / COMPANY PC
Date: 2026-10-19 (Asia/Ho_Chi_Minh). Language for user communication: Vietnamese.
This document is a GitHub-verified handoff of work done from the home PC / previous Codex sessions. It is NOT a statement that the company PC has been installed, configured, or tested.

## A. ABSOLUTE SOURCE OF TRUTH
- Canonical repository: https://github.com/solyan842/SolYan-PDF
- Read root AGENTS.md FIRST on the ACTIVE branch. Then README.md, docs/WINDOWS-DESKTOP-READER-R1.md, docs/WINDOWS-DESKTOP-READER-R2.md, docs/WINDOWS-DESKTOP-UX-LOCK.md, docs/WINDOWS-DESKTOP-ICON-LOCK.md, relevant source/workflow and tests.
- Live GitHub repo + active-branch HEAD + latest repository-WIDE Actions run + actual logs/artifacts are authoritative. Memory, PC-specific worktrees, old handoff notes and old docs cannot override GitHub.
- Before every task: fetch/prune; inspect current branch and working tree; get exact GitHub HEAD and repository-wide latest CI; determine whether requested fix is already present.
- Do not blindly reset, force push, stash-overwrite, delete, or discard uncommitted edits on either machine. Never change main/stable directly without authorization.
- This handoff itself is a DOCS-only follow-up to the last CI-green code commit; it does not claim another Windows CI run passed.

## B. VERIFIED GITHUB SNAPSHOT (before this docs-only handoff commit)
Repo: solyan842/SolYan-PDF
Active Windows development branch: feat/windows-reader-r2
Windows development code HEAD: bb56189f47f50525527a4d1de7bd3d6c8659546f
Staging bookmark branch at snapshot: feat/windows-reader-r2-bookmarks -> same bb56189.
main snapshot: 5a5095ed65106359c11c84d8cdcce9948adcaf85 (separate released web/PWA line).
Latest repository-wide Windows Desktop run at snapshot: #138 (run id 39159517523), completed SUCCESS at bb56189, https://github.com/solyan842/SolYan-PDF/actions/runs/39159517523
#137 SUCCESS at 2f3131a; #136 SUCCESS at d4a5012; #135 and #134 previously FAILED, now superseded by the green fixes. #133 SUCCESS at 624f2f2 is the R1 baseline.
#138 jobs: build-windows-x64, ci-result/summarize, ci-result/notify-result — all SUCCESS.
#138 artifacts present and not expired when checked: SolYan-PDF-Reader-Windows-x64 (~6.96 MB), SolYan-PDF-Windows-x64 (~889 MB), Windows release checksums, Windows/Reader diagnostics, CI result. Retrieve actual installers via the Actions artifact UI. CI PASS does not replace manual real-Windows UI QA.
Web/PWA GitHub release v0.2.0 exists on main; DO NOT confuse it with public release of Windows R2. Windows R2 has NOT been merged/released.
If any value here is stale when Codex starts, REPLACE it with live GitHub evidence; do not continue from a remembered SHA.

## C. WHAT WAS COMPLETED — PRODUCT AND ARCHITECTURE

### C1. Overall product
- User requires Windows-first for the CURRENT desktop project, despite broader web/PWA architecture also in the repository.
- TWO different Windows applications: sReader PDF (fast lightweight standalone reader) and sTool PDF (full PDF toolbox); two different app IDs, EXEs, NSIS installer artifacts and installed profiles.
- Reuse established OSS/building blocks instead of new engines: Tauri 2/WebView2 shell; pinned PDF.js 6.4.299 + pdf-lib 1.17.1 for Reader, browser-side edit/save; separate Windows services for heavyweight Toolbox functions.
- No need to debate Electron/Wails or rebuild Tauri/PDF engines. Keep Windows 10/11 x64 target. Reader must start without heavyweight Tools sidecars.
- Primary Reader UX reference: https://github.com/DanialJaved/rune ; performance reference: https://github.com/sumatrapdfreader/sumatrapdf ; do not import GPL assets/code blindly. Existing permissive dependencies are the implementation baseline.
- UX: Fluent/Windows 11 (NOT macOS), calm and professional, fast, iLovePDF-style direct discoverability; user interface primarily Vietnamese. Ordinary tools within 1–2 clicks.

### C2. sTool PDF — existing Windows backend/UI (D1–D6)
- Current Toolbox uses five isolated local sidecars: core FastAPI (qpdf + Poppler), Office (LibreOffice), OCR (Paddle/PP-StructureV3 + Tesseract vie/eng), certificate signing (pyHanko), archive/PDF-A (OCRmyPDF internal).
- Windows installers stage native runtimes; tools use loopback 127.0.0.1 and scoped tokens, no public network listening and no required user-installed Docker/Python.
- Proven major subsystems via past CI: tool catalog, search, split/merge and page operations, repair, extract images, active-content inspection/sanitization, attachments, optimize/compress/protect/unlock, annotation/signature removal, conversion, OCR, signing, PDF/A, NSIS install/uninstall smoke.
- DO NOT assume every visually catalogued tool is working: only tools truly wired/tested to a local route may be shown enabled. Use explicit unavailable state for the rest.
- Tool-card UI lock: bold tool name and regular description on SEPARATE lines, adequate spacing.
- Tool/navigation icons: pinned Phosphor Duotone SVG, MIT; 86 vendored SVGs for 96 tool IDs, icons in desktop/ui/icons/phosphor-duotone/, provenance in SOURCE.json. Never substitute emoji, icon fonts or new icon set.

### C3. sReader PDF — R1 / R2 accomplished
- R1 (#133): open/drop local PDF, multiple tabs, continuous PDF.js viewer, visible-page buffering, lazy thumbnails, outline, search/highlights, zoom, navigation, source-preserving Save As, offline Quick Sign. Standalone Reader installer does not launch Toolbox sidecars.
- R2 (#136–#138): categorized toolbar (Home/Comment/Fill & Sign/View); text selection/copy, pan, single/continuous/two-page modes, view rotation, fullscreen, light/dark; highlight, underline, strikethrough, sticky notes, ink, shapes/lines/arrows; pending annotations selectable/movable/resizable/deletable with undo/redo; PDF-native annotation save/reopen; local reusable signature artwork library; warning on already digitally signed PDFs.
- Fill & Sign in #137: insert text (Unicode rendered as small transparent artwork, max 200 characters / three lines), local date, check and cross; drag and resize; fill-only Save As suffix -da-dien.pdf. IMPORTANT: inserted text is currently an IMAGE, not editable/selectable native PDF text; original page/text remain searchable. Real PDF form input support is still incomplete.
- Bookmarks in #138: viewer-local bookmark list, add/delete/jump and remember last reading page keyed to PDF.js document fingerprint. Does not write PDF outline/bookmarks into PDF itself.
- Known unfinished bookmark bug: reader-r2.js DEFINES flushBookmark(d), but desktop/ui/reader.js closes documents by clearing bookmarkTimer without calling r2.flushBookmark(doc). The beforeunload path also does not flush synchronously. Fix before tearing down doc; test immediately closing after page change (less than debounce 500 ms), reopening same PDF with page persisted.
- Existing code: desktop/ui/reader.html, reader.js, reader-r2.js, reader-edits.js, quick-sign.js, reader.css, reader-icons/, branding/, reader-tests/.
- Existing CI test suite includes Node geometry/native-annotation/signature/branding checks; Playwright Reader text/navigation/zoom/Quick Sign, synthetic 100-page lazy canvas, annotation roundtrip, Fill & Sign, signature library and bookmark persistence. DO NOT WEAKEN.

### C4. QUICK SIGN — IMMUTABLE PRODUCT BEHAVIOR
- Fully offline signature via mouse/pen draw, PNG/JPEG import, or typed name. Local reusable artwork library in WebView localStorage under sreader.signatures.v1 (up to 3 MB); NOT synchronized between separate app profiles or two computers.
- Mouse placement anywhere on page. Four corners resize with aspect ratio; four sides resize independently; drag object to move, keyboard arrows for precision. No coordinate sliders or complex UI.
- Apply same template to current page, explicit ranges such as 1,3-5, or all pages, preserving physical position/size as appropriate across mixed page sizes, crop and 0/90/180/270 rotations.
- Windows native Save As defaults new -da-ky.pdf, original source bytes immutable, same-directory temporary atomic replacement; cancel retains edits. Flatten ONLY signature image into PDF page content, never rasterize whole page, preserve original selectable text. On ordinary reopening it is not an individually draggable annotation.
- Visual image signature is NOT PKCS#12 cryptographic signing. Keep pyHanko certificate signing in sTool unchanged. Warn about existing digitally signed PDF modification.
- Zoom lifecycle fix from #134/#135: PDF.js resets overlays during zoom; restore on scalechanging and pagerendered; DPI 125% geometry regression must remain strict. Latest green #136+ proves relevant automated regressions passed.

### C5. BRANDING — LOCKED
- EXACT approved two-application logo pair is already committed: desktop/branding/APPROVED-original-pair.png, desktop/branding/sReader_PDF/, desktop/branding/sTool_PDF/, SHA256.json, README-CODEX.md and INTEGRATION.md.
- sReader icon is the original approved page/S orange ribbon artwork. sTool is the IDENTICAL design plus orange wrench badge. Do not regenerate, redraw, recolor or swap identities.
- PNG frames 16/24/32/48/64/128/256/512/1024, ICO embedded. Integrated into Tauri EXE, window, app UI, installer/shortcuts per R2 source.
- Real taskbar, Windows dark/light and upgrade association appearance still need manual QA. No need to carry logo files from home PC — fetch verified originals from GitHub.

### C6. WEB/PWA AND MAJOR PERMANENT GATES (PRESERVE; NOT CURRENT WINDOWS TASK)
- Main web/PWA product is a full self-hostable Next.js/FastAPI PDF suite with Vietnamese utilities; includes PDF page ops, OCR, conversion, redaction, signing, PDF/A, local workflow, various advanced tools and optional cloud integrations.
- main published v0.2.0 (not Windows Reader R2) includes Google Drive/OneDrive, WebDAV and the prior hybrid PDF translation scope. Cloud providers need own credentials, do not invent them or expand unrelated scope.
- PDF-to-Office fixed release policy: 27 test cases / 68 source pages (18 controlled synthetic + 9 public real-world / 50 pages). DOCX/PPTX: LibreOffice import first, Bloom fallback. XLSX: Bloom primary, PP-StructureV3 fallback on no logical tables, scan 9/9 pages. Never weaken gates.
- Keep web/main separate from Windows development branch. No automatic R2 merge into main or public release.

## D. INCOMPLETE WORK — PRIORITIZED CONTINUATION
P0. Read live GitHub state and exact tests. Fix bookmark flush on close/exit in reader.js by invoking existing r2.flushBookmark(doc) before timer cancellation and PDF destruction; cover immediate close and app-exit path without weakening existing 500 ms debounce tests.
P1. Reliable Print for ALL pages or selected ranges using maintained PDF.js print or browser/native supported pipeline; avoid printing only currently rendered/lazy pages or page screenshots. Native Windows preview QA.
P2. Actual interactive AcroForm fill + reliable save/reopen, history/dirty state, Unicode as supported; preserve original document semantics. Current image-based text stamp is NOT equivalent.
P3. Current-document handoff Reader <-> Tools to a chosen operation (no second manual file selection) with safety for unsaved edits and missing installations. Keep separate app identities and no sidecar startup from standalone Reader.
P4. Existing native annotation edit on reopen, recents with safe native reopening, actual PDF page rotation persistence, user QA polish; no placeholder buttons.
P5. Benchmark real PDFs (scanned, complex/vector, 1/100/500 pages), memory and startup on real Windows 10/11; inspect signature save geometry, files, forms and installer/default association; prepare release only after verified gates and user authorization.

### Known limitations / boundaries
- CI browser tests mock Windows-native Save As bridge; that does NOT prove manual Windows dialog UX.
- The last synthetic 100-page benchmark in R2 docs was one Chromium measurement (not a performance guarantee, not a real PDF corpus).
- R2 source has actual pending-save native annotations but edit/rewrite already-saved annotations is not complete.
- Windows NSIS installer from CI is currently unsigned by an Authenticode publisher certificate unless separately provisioned; do not claim signed/released.
- Large Tools installer (~889 MB) is expected from bundled OCR/Office and sidecars; small Reader (~7 MB) remains independent.
- Do not treat static docs (e.g. WINDOW-DESKTOP-STATE.md) as fresher than live HEAD; some notes include old phase/branch labels.

## E. TWO-PC AND 24/7 CODEX — WORK / STOP / SAVE / RESUME PROTOCOL
1. GitHub is the ONLY synchronization spine. Both home and company PCs may use the same GitHub account/repo, but never simultaneously push incompatible changes to the same branch. One active writer per feature branch. Separate worktrees/branches for simultaneous distinct work.
2. An always-on PC with Codex open is NOT automatically an autonomous 24/7 worker. Codex works only when a task/session is actually running; idle/wait/timeout/quota exhaustion does not imply ongoing work. Use user-requested scheduled agent/checks if available. Never promise unseen background execution.
3. User saying "ok", "tiếp", "tiếp tục" means continue the agreed task. Do not ask routine questions. Stop only for real product decisions, missing credentials/permissions, irreversible/destructive approval, quota/tool hard blocker, or unavailable real logs.
4. **Separate roles for efficiency:** ChatGPT chat = design/strategy, OSS research, GitHub state/log diagnosis, prioritized implementation briefs, user choices; Codex = write/refactor code and run local tests; GitHub Actions Windows = full native build, installer, signing/PDF-A smoke and downloadable artifacts. ChatGPT can sometimes do small verified GitHub changes; choose the cheaper/reliable tool, do not double-do work.
5. Prefer model's Medium reasoning for straightforward implementation. Use High only for difficult renderer/coordinate/form/native/CI root-cause tasks. Avoid repeatedly rewriting long prompts; point to repo AGENTS.md and this handoff.
6. **Batch carefully:** make multiple local commits if useful, but run relevant fast LOCAL tests first. Do not push every trivial edit to a CI-triggering branch. Push one coherent, testable batch to one branch for one Windows CI; avoid two concurrent Windows builds and automatic reruns.
7. **During long CI:** save/commit current state; stop active expensive agent loops while waiting. Use GitHub web/gh CLI checks or event notifications. Do not have Codex continuously poll every few seconds or create new builds while an earlier run is live. Do independent coding on a separate non-CI staging branch only when safe; do not drift from the active base.
8. **When CI fails:** fetch repository-WIDE latest run FIRST, verify run branch+head_sha matches current branch HEAD, locate exact failed job, read RAW job log once. If missing/truncated, read durable diagnostic artifact immediately; NEVER loop the same unavailable logs. Determine root cause, minimally fix it, rerun locally, then push one consolidated fix. Do not weaken tests to force PASS.
9. **When CI PASS:** verify exact SHA, jobs and artifacts. Continue next unfinished milestone automatically only when the last milestone is truly green and new work is coherent; avoid redundant full rebuilds just to confirm nonfunctional/documentation edits.
10. **When Codex quota/time is low:** commit a coherent safe checkpoint (not half-broken state as done), write current branch/HEAD, dirty paths, completed local commands, known errors, next exact task to a short GitHub-tracked handoff; stop and resume when quota resets. Do not automatically switch to paid API, spend credits, delete tests, or use a separate plan/account without explicit decision.
11. **Before rest / PC switch:** finish or abort cleanly; check git status; commit/push only coherent changes, record unresolved uncommitted changes; save only nonsecret needed notes. On next PC, git fetch --prune and examine remote branch, status and latest CI before starting. Avoid forced overwrite, blind branch merge and force-push.
12. **Sensitive/local-only data:** never commit private PDFs, signature library WebView profile, credentials, OAuth tokens, .env, personal documents, test keys. Codex login and GitHub credentials are configured on each PC separately. Only source and approved assets committed to GitHub move automatically; app localStorage, installed tools, manual QA observations and uncommitted files do not.
13. Do not call a project "released", "finished", "fixed" or "PASS" without corresponding commit/ref/CI/test/release evidence and user QA for interactive behavior where required.
14. The machine can remain ON 24/7; **do not confuse availability with nonstop reasoning/CI usage**. Work in natural batches -> local QC -> push CI -> stop/await -> inspect -> continue. Turn off redundant work instead of burning quotas. No invented timers, usage limits, or exact schedules.

## F. FIRST COMMANDS ON COMPANY WINDOWS PC
Install Git, Node.js (matching project's CI; Node 24), Python only if required for local tests, Codex and optionally GitHub CLI. For native local Windows Rust builds, add Rust stable and VS C++ Build Tools; full Windows packaging may be delegated to GitHub Actions rather than repeating huge Office/OCR staging locally. Log into GitHub and Codex; DO NOT copy tokens between machines.

In PowerShell:
    git clone https://github.com/solyan842/SolYan-PDF.git
    cd SolYan-PDF
    git fetch origin --prune
    git switch --track origin/feat/windows-reader-r2
    git status --short --branch
    git rev-parse HEAD
    gh run list --repo solyan842/SolYan-PDF --limit 5

If clone exists, first check git status; use git switch feat/windows-reader-r2 then git pull --ff-only ONLY after resolving local uncommitted work. If gh is unavailable use the GitHub Actions website. Don't assume exact SHA in this handoff still equals live HEAD.

Fast local Reader verification on company PC (with Node installed):
    cd desktop/reader-tests
    npm ci
    node stage.mjs
    npm test
    npx playwright install chromium
    npm run e2e

Run the existing UI contract and Phosphor tests where PowerShell/Node are available. Check current workflow .github/workflows/windows-desktop-ci.yml before making CI modifications.

## G. STARTUP INSTRUCTION TO NEW CODEX SESSION
Read this handoff AND AGENTS.md, but LIVE GitHub always wins. Verify all repository-wide Actions and branch HEAD. Preserve #138 code baseline, Quick Sign and Toolbox. Finish bookmark flush regression first; then Print, AcroForms and Reader-to-Tools handoff. Work through tasks without routine questions; batch fast local tests and one Windows CI per coherent milestone; never rewrite PDF engines or redesign approved logos; never report PASS before actual exact-head GitHub CI, nor release without merge and explicit authorization.

END HANDOFF
