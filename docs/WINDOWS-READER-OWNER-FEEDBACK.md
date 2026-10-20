# Reader owner feedback: footer, F11, English, Typewriter and Save

Date: 2026-10-19. Branch: `feat/windows-reader-fast-ci`. GitHub HEAD and repository-wide Actions supersede this snapshot. One writer only; never force-push or modify main/stable.

## Verified starting point

Current code base before this batch is `644e1a9a3ac77f785b25eaf723f107f97f13fd8d`. [Windows Reader CI #5](https://github.com/solyan842/SolYan-PDF/actions/runs/39216608271) completed SUCCESS on that exact SHA, including native installed activation, 20 browser tests, 6 Node tests, 3 Rust tests, NSIS install/uninstall and orphan checks. The prior page-to-zoom failure is repaired; do not redo it or the elevated WebView2 bootstrap.

The owner's new instructions override the older Rune-inspired plan: **F11, not F5**; navigation/view/zoom controls belong in a reserved footer, **not a floating overlay**. They also explicitly removed the old selection/night backplate. Approved app logos and Quick Sign image/export algorithms remain unchanged. Signature background-removal research was explicitly declined (`bỏ qua`); no removal algorithm is added.

## Changes in this batch

- Thin 32px footer: first/previous/page/next/last at left; status in remaining space; single/continuous/two-page view, zoom slider, percentage/fit selector, +/- and presentation at right. The footer reserves layout space outside the PDF canvas. Screenshot checks cover 1024/1440/1708 widths.
- Open, Save and Save As stay after the app logo and before file tabs; visible sTool PDF command stays in the header. Existing Tools launch/handoff behavior is reused.
- Selection artwork has transparent backing. Eight handles retain 14px screen hit targets with 6px visible squares independent of PDF zoom. Delete works from a focused toolbar, while typing and open dialogs are protected; undo restores edits.
- Ctrl + mouse wheel zoom uses the public PDF.js updateScale API, keeps pointer anchoring and existing pending marks. The exact-head rapid navigation fix (view.update before changing scale) remains in every zoom path.
- F11 opens actual fullscreen, a single page fit on black, with pending edits included. Arrow/PageUp/PageDown, Home/End and Space navigate; Esc/F11 restore editor page, scale, scroll, selection and focus. PDF.js renders on a separate bounded canvas (12 million pixels maximum). No PDF.js engine fork or replacement navigation engine.
- Vietnamese/English UI selection lives in display settings and local storage. Translation excludes source PDF text, filenames, bookmark names, signature names and inserted user text. Native Open/Save As captions receive the language. The source document is never translated.
- Pen and highlight color choices feed both screen appearance and native PDF annotation colors.
- Direct Typewriter button: font, 6-96pt size, color and multiline text. Noto Sans, Noto Serif and Noto Sans Mono support Vietnamese. Double-click pending text to edit it again; existing move/resize/delete/undo tools apply. Output is searchable/selectable PDF text, not a page screenshot or text image.
- About shows the approved Reader logo, sReader PDF, actual app version, Hoang Minh Anh / SolYan84, yansign841@gmail.com and https://www.youtube.com/@SolYan-Music.
- Distinct Save (Ctrl+S) and Save As (Ctrl+Shift+S). First Save uses the native picker to choose a working copy; subsequent Save updates that chosen copy. Save As always chooses a target again. Cancellation preserves dirty edits. Native output paths come only from OS Save As, stored by document identity; reader_save accepts no JS path. Atomic temp/sync/replace is reused. Known OS-opened source paths, including case/canonical aliases, are protected against overwrite. Original in-memory bytes remain the export source, preventing duplicate flattening on repeated saves. Browser preview can only request a download and deliberately keeps its dirty marker.

## Reuse and pinned assets

PDF.js 6.4.299 continues rendering/text/navigation; pdf-lib 1.17.1 continues writing; existing ReaderEdits continues coordinates; Quick Sign continues image insertion. Typewriter uses pdf-lib's existing registerFontkit/embedFont/drawText APIs with exact @pdf-lib/fontkit 1.1.1 (MIT), not a custom font parser/subsetter. The official pdf-lib custom-font integration is the lowest-cost extension to the already installed writer. PDF.js editor storage is tied to its own editor lifecycle; replacing the current edit model would duplicate the established Reader undo/placement/export pipeline. Pulling in a separate server-side PDF suite or GPL viewer solely for text would add packaging/license/runtime cost. Rune remains visual inspiration only; no GPL Rune implementation was copied.

`desktop/reader-tests/reader-fonts.json` pins official Noto assets and OFL license to notofonts/noto-fonts commit `ffebf8c1ee449e544955a7e813c54f9b73848eac` with SHA-256 for every file. Stage verifies downloaded bytes or a verified local cache, bundles fonts/license and fontkit README, and generates the app version fallback from tauri.conf.json. Generated vendor fonts/binaries stay ignored. The installed Reader needs no network. Npm lockfile pins fontkit and its dependency integrity.

## Validation and boundaries

Local Node: 8/8 PASS (approved logo/icon hashes, Quick Sign/annotations/coordinates, font/license hashes, native text across three fonts and all four rotations/crop origins). Toolbox icon contracts: 5/5 PASS. Package/CSP contract, JS syntax, PowerShell parser, C# native-helper compilation and whitespace checks PASS.

Browser coverage is 25 cases: all existing 20 remain, plus DPI 100/125 selection/Delete/Ctrl-wheel/footer, F11 mixed pages/huge page/restoration, English/About/colors/three-font PDF extraction/re-edit and Save/Save As/cancellation. An added screenshot drag initially read a bounding box before asynchronous font loading finished; it now waits for the actual inserted text before interaction. No product assertion, hard case, geometry tolerance or timeout was removed or loosened. Final complete run: **25/25 PASS, 1.0 minute, exit 0**. The explicitly owned preview server was stopped after local verification.

Local browser preview screenshots are synthetic and visually inspected, not owner approval or release evidence:

- test-results/reader-refined-1.png and reader-refined-1.25.png
- test-results/reader-English-typewriter.png
- test-results/reader-presentation-F11.png
- existing reader-compact-* captures regenerated with the reserved footer

Native/Rust/installed acceptance cannot run locally (Rust toolchain unavailable). The next Reader-only CI must compile the Rust commands and exercise actual installed F11/restore, Delete/undo, forged Save rejection, real Win32 Save As to a synthetic copy, Ctrl+S update without source modification, English/About, existing Explorer activation/caption tests and uninstall/orphans. Save picker automation is bounded to the synthetic native test-results directory and the disposable Actions process. Durable existing artifacts retain logs/screenshots/report. This is **pending**, not Windows PASS or released.

## Next continuation

Push this coherent batch once, re-fetch all changed files and branch HEAD, identify the exact new Reader CI and stop while it runs (AGENTS.md section 13). On continuation refresh unfiltered repository-wide Actions plus HEAD. If CI fails, read the real exact-job log once then artifact fallback, fix observed cause and batch one subsequent push. Do not rerun full Toolbox or revisit old failures.

If PASS, inspect installed captures, then continue the existing milestones: Print PDF, AcroForm completion, document handoff between Reader and Tools, and representative Windows release QA (caption drag/resize/Snap/high DPI and real document corpus). Bookmark and existing annotation/signing/export behavior already have passing regressions; extend only demonstrated gaps. User visual review is still needed for final layout approval. No merge, stable/main write, public release, background-removal feature or complete release readiness is claimed.

## Follow-up: unshaded icons and pinned Tools command (owner approved About provisionally)

2026-10-19: the owner clarified that the unwanted gray was the shaded path inside toolbar pictograms, not just selection backing. Reader display variants now remove only the 20% opacity path from each of the 23 pinned MIT Phosphor SVG originals. Originals and their hashes remain unchanged; SOURCE.json records derivative hashes. Four distinct unfilled project SVGs identify single page, continuous pages, two pages and fullscreen, replacing the reused rectangle. sTool PDF is anchored after the flexible title spacer at the header's right with its approved 19px logo; opening extra tabs does not move it. No branded logo pixels or Toolbox behavior change.

Validation: 9/9 Reader Node tests PASS, including exact outline derivation/hashes; focused shell browser test PASS at 1024/1440/1708 widths, light/dark, popovers, actual icon image loading, four distinct view icons and pinned sTool position with three open tabs. Real localhost About and language-settings captures were produced and inspected; the owner accepted About provisionally (`about tạm thế`). Language selector: Menu > Tùy chọn hiển thị > Ngôn ngữ. About content/version is unchanged.

Reader CI #6 on 9f5656e was still building when this follow-up was prepared (fast gates and Rust queue tests passed; installed acceptance pending). To preserve that expensive run, the follow-up is saved on feat/reader-toolbar-review without starting/cancelling Windows CI. On continuation first refresh unfiltered Actions and both branch heads; inspect CI #6 real logs if failed. Integrate the UI follow-up into feat/windows-reader-fast-ci after CI #6 finishes, batching it with the next appropriate Reader milestone and a single CI. Do not lose this review branch or mistake the prior installer for the new icon build. No release/installed PASS is claimed for this follow-up.

## Consolidated continuation — 2026-10-20

Reader CI #6 failed in native Save As automation after build/F11/restore passed. The owner requested bundling the repair, Print, AcroForm and document transfer into one build. Follow docs/WINDOWS-DESKTOP-READER-RELEASE-BATCH.md and live GitHub. The owner then clarified Reader only. Active build branch: feat/windows-reader-fast-ci; run one Windows Reader CI and leave the full Desktop/Tools workflow unchanged. The compatible Tools transfer counterpart remains source checkpoint work, not a built/validated Tools update. Avoid duplicate Windows jobs. Native installed results remain pending until the new exact-head Reader run finishes.
