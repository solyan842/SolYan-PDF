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
- `Xóa trang trắng` → `POST /pdf/remove-blank-pages`.
- `Page Labels` → `POST /pdf/page-labels`.
- Windows Desktop CI run `39048379715` / #101 PASS on exact HEAD `9b62c14da1e60abcc69e8755aeeb626c3a61abfe`.

### Poppler conversion batch — PASS
- `PDF sang TXT` → `POST /pdf/to-text`.
- `PDF sang HTML` → `POST /pdf/to-html`.
- `PDF sang XML` → `POST /pdf/to-xml`.
- `PDF sang CBZ` → `POST /pdf/to-cbz`.
- `PDF sang SVG` → `POST /pdf/to-svg`.
- `PDF sang PostScript` / `PDF sang EPS` → `POST /pdf/to-postscript`.
- `Markdown` and `CSV` remain deferred to D4 structured OCR; `RTF` remains deferred to D3 Office runtime.
- Windows Desktop CI run `39048949509` / #102 PASS on exact HEAD `85984a4866791d6d89a67a1927d353e3b8e53562`.

### PDF Portfolio — PASS
- Reuses `POST /pdf/portfolio`; no duplicate backend API.
- Accepts up to 50 files, max 25 MB each / 100 MB total; creates PDF 1.7 `/Collection` + `/UseAttachments` and validates via qpdf.
- Windows Desktop CI run `39049468771` / #103 PASS on exact HEAD `e2b4e9f1cd686bd5700c34d361e0eced2108af83`, including UI/CSP, packaged core, Cargo, NSIS, silent install, installed app launch and local-core cleanup.

## D3 Office runtime — ACTIVE

### D3A — pinned Windows runtime + standalone Office sidecar — GATE NEXT
- Keep existing `engines/office-service` API and conversion logic as source of truth; do not move LibreOffice-specific logic into main backend.
- Pin official The Document Foundation LibreOffice `26.8.1` x64 MSI (`PackageVersion 26.8.1.1`) at `desktop/vendor/libreoffice-windows-x64.json`.
- Pinned SHA-256: `c6298b10cfa1748bcbedad94c62ce771e240e5021bfd6d7a967cd571b04b5312`, cross-checked against the Microsoft WinGet `TheDocumentFoundation.LibreOffice 26.8.1.1` installer manifest.
- `desktop/backend/stage-office-runtime.ps1` downloads only the official TDF MSI, verifies SHA-256 before extraction, performs MSI administrative extraction, locates `soffice`, records the runtime inventory and executes `--version`.
- `desktop/backend/office_runner.py` launches the existing Office FastAPI app on `127.0.0.1` only.
- Separate `Windows Office Runtime CI` builds `solyan-office.exe`, checks `/health`, then performs a real UTF-8 TXT → PDF conversion and validates the `%PDF-` signature.
- This D3A gate intentionally does not bundle LibreOffice into the NSIS yet; integration into the Tauri supervisor/install package happens only after the runtime/sidecar gate is green.

### D3B — installer/supervisor integration — AFTER D3A PASS
- Bundle `solyan-office.exe` + extracted LibreOffice under a dedicated `office/` resource tree.
- Tauri starts Office sidecar first on a random loopback port, then starts `solyan-core.exe` with `OFFICE_SERVICE_URL=http://127.0.0.1:<office-port>`.
- Both processes must be tied to Windows Job Object / explicit exit cleanup.
- Installed-runtime smoke must prove `soffice`, `solyan-office.exe`, `solyan-core.exe` exist, start, and leave no orphans.
- Preserve LibreOffice-first → Bloom fallback for DOCX/PPTX; run locked PDF→Office 27-case / 68-page gate before D3 is accepted.

## PDF sang ảnh parity boundary

- V1.5 web behavior is intentionally browser-local using PDF.js + Canvas + JSZip, including page selection, DPI, PNG/JPEG/WebP, color mode, annotation mode, ZIP vs single composite and strict render budgets.
- Do not silently replace that behavior with a different Poppler-only desktop contract merely because Poppler is bundled.
- Reuse/package the existing web contract or make an explicit parity decision before changing semantics.

## Next work — continue automatically

1. Run D3A Office runtime CI on exact HEAD and fix only from actual logs if needed.
2. After D3A PASS, integrate Office runtime into Tauri/NSIS (D3B) and extend installed-runtime lifecycle smoke.
3. Run the locked PDF→Office 27-case / 68-page gate; only then wire Office/RTF Windows UI and mark D3 PASS.
4. D4: package OCR runtime and connect OCR/scan plus Markdown/CSV tools.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
