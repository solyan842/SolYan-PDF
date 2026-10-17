# SolYan PDF Windows Desktop — Active State

Status: **ACTIVE / DO NOT DROP**
Branch: `feat/windows-desktop-v1`

This is the rolling handoff for the Windows desktop lane. Repository state and current CI still override this file when HEAD advances.

## Locked product direction

Read first:

- `AGENTS.md`
- `docs/WINDOWS-DESKTOP-V1.md`
- `docs/WINDOWS-DESKTOP-UX-LOCK.md`

Do not restart the Windows-vs-web, Tauri-vs-Electron, or macOS-style discussion unless new evidence creates a real product decision. The user explicitly selected Windows first and approved the current Windows Fluent/iLovePDF-ease visual direction.

## Continuation rule — DO NOT DROP

- `ok`, `tiếp`, `tiếp tục` means continue the agreed Windows implementation automatically.
- Keep working continuously through normal engineering choices and CI iterations.
- Stop only for a genuine user product decision, credentials/permissions, an irreversible/destructive choice, or a hard tool boundary.
- Do not leave the Windows lane as a demo-only shell: continue converting catalog placeholders into real tools by reusing the existing backend first.

## Platform status

### D1A — Windows UI shell — PASS
- Windows Fluent-style Home matching the approved concept direction.
- `Ctrl + K` search, complete catalog, category navigation, system light/dark baseline.
- `Nối PDF` is functional browser-local with pinned `pdf-lib 1.17.1`.
- Document workspace shell is present.
- `desktop/ui/validate-contract.ps1` is the central UI/route/endpoint/strict-CSP contract gate.

### D1B — Tauri / installer — PASS
- Tauri 2 Rust shell, Windows decorated/resizable window.
- NSIS current-user installer, Vietnamese/English, `.pdf` association.
- Strict CSP; no `unsafe-inline` workaround.
- Installer bundles `solyan-core.exe`, qpdf and Poppler; user needs no Docker/Python/system qpdf/system Poppler.
- CI silent-installs the built NSIS, launches installed app, verifies bundled runtimes, observes `solyan-core.exe`, closes app and verifies no orphan core.

### D2 — local core sidecar — PASS
- Existing `backend.app.main` remains source of truth; no desktop API fork.
- `desktop/backend/runner.py` binds only `127.0.0.1` and requires random per-launch `X-SolYan-Desktop-Token`.
- qpdf Windows x64: `12.4.2`, SHA-256 `db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d`.
- Poppler Windows x64: `26.09.0-0`, SHA-256 `7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0`.
- Tauri supervisor resolves native resources, allocates loopback port/token, waits for authenticated qpdf-backed health and exposes the session through `desktop_core_session`.
- Windows Job Object uses `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; graceful exit also kill/waits explicitly.

## Native tools wired

### Earlier PASS baselines
- `Sửa lỗi PDF` → `POST /pdf/repair`; run `39028459915` / #39 PASS.
- `Trích xuất hình ảnh` → `POST /pdf/extract-images`; installed-runtime run `39029525483` / #49 PASS.
- `Thông tin PDF` → `POST /pdf/info`; run `39030593053` / #54 on `6a448aefff88365bb57706346a92c5fd67dbcf8d` PASS.
- `Kiểm tra nội dung chủ động` → `POST /pdf/inspect-active-content`; run `39031147389` / #60 on `2bf8cf314deea8b07bf9bed964767fa25a25aec4` PASS.
- `Tệp đính kèm` → existing list/add/extract/remove endpoints; run `39031676738` / #66 on `a0027f239ac16504d0b26590b1d3e4a12a68b8e2` PASS.
- `Xóa hình ảnh` → `POST /pdf/remove-images`; covered by later exact-head gates.
- `Làm sạch PDF` → `POST /pdf/sanitize`; run `39032719002` / #75 on `627a3a7d3295bd93a990b1d009dcc080cdd17119` PASS.

### qpdf optimize/security batch — PASS
Windows Desktop CI run `39034173163` / #91 on exact code-bearing HEAD `b36c666681a488dc682b2d78358b38b37eb1100e` PASS end-to-end.
Covers `Tối ưu xem web`, `Giải nén cấu trúc PDF`, `Nén PDF`, `Flatten PDF`, `Tối ưu hình ảnh`, `Bảo vệ PDF`, `Mở khóa PDF`.

### Xóa chữ ký — PASS
- Reuses `POST /pdf/remove-signatures`.
- Windows Desktop CI run `39034640214` / #97 PASS on exact HEAD `dc25da7ea79871140a036d82174f07eb34f6d879`.

### Quyền hạn PDF — PASS
- Reuses `POST /pdf/info`; read-only inspection of encryption and permission map.
- Windows Desktop CI run `39047266679` / #99 PASS on exact HEAD `ace818bc42367c961828f5360785596d60745dcc`.

### Annotation / form utility batch — PASS
- `Xóa chú thích` → `POST /pdf/remove-annotations`.
- `Mở khóa biểu mẫu` → `POST /pdf/unlock-forms`.
- Windows Desktop CI run `39047834628` / #100 PASS on exact HEAD `4e79f38f93f58bfdf9341437bda5ea6014f7a958`.

### Blank-page / Page Labels batch — PASS
- `Xóa trang trắng` → `POST /pdf/remove-blank-pages`; text-layer pages are hard-kept, only text-free pages are raster-classified; backend keeps 300-page/render budgets and refuses an empty all-removed result.
- `Page Labels` → `POST /pdf/page-labels`; set/remove, up to 20 ordered rules, decimal/Roman/alpha/no-number styles, start values and optional prefixes; backend verifies physical page count and `/PageLabels` state.
- Windows Desktop CI run `39048379715` / #101 PASS on exact HEAD `9b62c14da1e60abcc69e8755aeeb626c3a61abfe`.

### Poppler conversion batch — PASS
Reusable Windows page `poppler-convert.html/js` routes existing backend conversions through the already-bundled Poppler runtime:
- `PDF sang TXT` → `POST /pdf/to-text`.
- `PDF sang HTML` → `POST /pdf/to-html`.
- `PDF sang XML` → `POST /pdf/to-xml`.
- `PDF sang CBZ` → `POST /pdf/to-cbz`.
- `PDF sang SVG` → `POST /pdf/to-svg`.
- Existing catalog cards `PDF sang PostScript` and `PDF sang EPS` → `POST /pdf/to-postscript`.
- `Markdown` and `CSV` remain deliberately deferred to D4 because their existing backends depend on structured OCR. `RTF` remains deliberately deferred to D3 because it depends on Office/LibreOffice.
- Windows Desktop CI run `39048949509` / #102 PASS on exact HEAD `85984a4866791d6d89a67a1927d353e3b8e53562`, including UI/CSP, packaged core, Cargo, NSIS, silent install, installed app launch and local-core cleanup.

### PDF Portfolio — WIRED / EXACT-HEAD GATE NEXT
- Reuses `POST /pdf/portfolio`; no duplicate backend API.
- Accepts up to 50 files, max 25 MB each / 100 MB total; arbitrary attachment types are supported.
- Backend creates PDF 1.7, `/Collection`, `/UseAttachments`, validates attachment count and qpdf integrity, and returns a new `solyan-portfolio.pdf`.
- UI stays local-first and never mutates source files.

## D3 Office runtime direction — LOCKED FOR IMPLEMENTATION
- Keep the existing `engines/office-service` API and conversion logic; do not move LibreOffice-specific logic into the main backend.
- Windows should package a separate loopback `solyan-office.exe` plus an official pinned LibreOffice x64 runtime, then point the existing `OFFICE_SERVICE_URL` at that local sidecar.
- Main core remains the only browser-facing API and keeps the random per-launch desktop token; office sidecar binds loopback only.
- Upstream target for first Windows packaging pass: official LibreOffice `26.8.1` x64 MSI, checksum-pinned. Re-run the locked PDF→Office 27-case / 68-page gate before accepting the runtime.
- Preserve LibreOffice-first → Bloom fallback for DOCX/PPTX; do not silently change conversion ordering or quality semantics.

## PDF sang ảnh parity boundary

- V1.5 web behavior is intentionally browser-local using PDF.js + Canvas + JSZip, including page selection, DPI, PNG/JPEG/WebP, color mode, annotation mode, ZIP vs single composite and strict render budgets.
- Do not silently replace that behavior with a different Poppler-only desktop contract merely because Poppler is bundled.
- Reuse/package the existing web contract or make an explicit parity decision before changing semantics.

## Next work — continue automatically

1. Keep Windows Desktop CI green on exact HEAD containing `PDF Portfolio`, then record exact run/commit as PASS.
2. D3: package LibreOffice Windows runtime + `solyan-office.exe`, preserve Office API/source-of-truth and LibreOffice-first → Bloom fallback, and execute the locked 27-case / 68-page gate.
3. D4: package OCR runtime and connect OCR/scan plus Markdown/CSV tools.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
