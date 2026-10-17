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

### qpdf optimize/security batch — CODE-BEARING BASELINE PASS
Windows Desktop CI run `39034173163` / #91 on exact code-bearing HEAD `b36c666681a488dc682b2d78358b38b37eb1100e` PASS end-to-end: UI/CSP contract, pinned browser engine, packaged local core, Cargo, NSIS, silent install, installed app launch and local-core cleanup.

That PASS covers the code present at that HEAD, including:

- `Tối ưu xem web` → `POST /pdf/web-optimize`; downloads `solyan-web-optimized.pdf`.
- `Giải nén cấu trúc PDF` → `POST /pdf/decompress`; downloads `solyan-decompressed.pdf` and warns size may grow.
- `Nén PDF` → `POST /pdf/compress`; structural qpdf compression, no image-downsampling claim.
- `Flatten PDF` → `POST /pdf/flatten`; warns interaction/editability can be lost.
- `Tối ưu hình ảnh` → `POST /pdf/compress-images`; uses qpdf image optimization/recompression.
- `Bảo vệ PDF` → `POST /pdf/protect`; AES-256 with user password, optional owner password, print/modify/extract permissions.
- `Mở khóa PDF` → `POST /pdf/unlock`; requires legitimate access and never claims to bypass an unknown password.

### Xóa chữ ký — PASS
- Reuses existing `POST /pdf/remove-signatures`; no duplicate desktop API/runtime.
- Always writes a new `solyan-unsigned.pdf`; source is never overwritten.
- UX explicitly warns the generated copy loses digital-signature verification state.
- Desktop reports five backend counters: signature fields, widgets, values, permission entries and DSS entries removed.
- Central validator locks the route, local-core token, endpoint and all five result headers.
- Windows Desktop CI run `39034640214` / #97 PASS on exact HEAD `dc25da7ea79871140a036d82174f07eb34f6d879`, including UI/CSP contract, packaged local core, Cargo, NSIS, silent install, installed app launch and core cleanup.

## PDF sang ảnh parity boundary

- V1.5 web behavior is intentionally browser-local using PDF.js + Canvas + JSZip, including page selection, DPI, PNG/JPEG/WebP, color mode, annotation mode, ZIP vs single composite and strict render budgets.
- Do not silently replace that behavior with a different Poppler-only desktop contract merely because Poppler is bundled.
- Reuse/package the existing web contract or make an explicit parity decision before changing semantics.

## Next work — continue automatically

1. Continue low-risk existing backend tools before new heavy runtimes; inspect `Quyền hạn PDF`, annotation/signature/form utilities and route only where semantics are already defined.
2. D3: package LibreOffice Windows runtime while preserving LibreOffice-first → Bloom fallback for DOCX/PPTX and the locked PDF→Office 27-case / 68-page quality gate.
3. D4: package OCR runtime and connect OCR/scan tools.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
