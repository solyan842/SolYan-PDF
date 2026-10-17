# SolYan PDF Windows Desktop — Active State

Status: **ACTIVE / DO NOT DROP**
Branch: `feat/windows-desktop-v1`

This is the rolling handoff for the Windows desktop lane. Repository state and current exact-head CI override this file when HEAD advances.

## Locked product direction

Read first:

- `AGENTS.md`
- `docs/WINDOWS-DESKTOP-V1.md`
- `docs/WINDOWS-DESKTOP-UX-LOCK.md`

Do not restart the Windows-vs-web, Tauri-vs-Electron, or macOS-style discussion unless new evidence creates a real product decision. Windows-first and the current Fluent/iLovePDF-ease direction are already approved.

## Continuation rule — DO NOT DROP

- `ok`, `tiếp`, `tiếp tục` means continue the agreed Windows implementation automatically.
- Keep working continuously through normal engineering choices and CI iterations.
- Stop only for a genuine product decision, credentials/permissions, an irreversible/destructive choice, or a hard tool boundary.
- Do not leave the Windows lane as a demo-only shell: keep converting catalog placeholders into real tools by reusing the existing backend first.

## Platform status

### D1A — Windows UI shell — PASS
- Windows Fluent-style Home, `Ctrl + K` search, complete catalog, category navigation and system light/dark baseline.
- `Nối PDF` is functional browser-local with pinned `pdf-lib 1.17.1`.
- `desktop/ui/validate-contract.ps1` is the central UI/route/endpoint/strict-CSP contract gate.

### D1B — Tauri / installer — PASS
- Tauri 2 Rust shell; NSIS current-user installer; Vietnamese/English; `.pdf` association; strict CSP.
- Installer bundles the local sidecars and pinned native runtimes; no Docker/Python/system qpdf/Poppler/LibreOffice is required from the user.
- Installed-runtime smoke silent-installs the NSIS, launches the installed app, observes local sidecars, closes the app and rejects orphan processes.

### D2 — local core sidecar — PASS
- Existing `backend.app.main` remains source of truth; no desktop API fork.
- `desktop/backend/runner.py` binds only `127.0.0.1` and requires a random per-launch `X-SolYan-Desktop-Token`.
- qpdf Windows x64 `12.4.2`, SHA-256 `db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d`.
- Poppler Windows x64 `26.09.0-0`, SHA-256 `7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0`.
- Windows Job Object uses `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; graceful exit also kills/waits explicitly.

## Native tools wired — PASS baselines

- `Sửa lỗi PDF` → `/pdf/repair`; run #39 `39028459915` PASS.
- `Trích xuất hình ảnh` → `/pdf/extract-images`; #49 `39029525483` PASS.
- `Thông tin PDF` → `/pdf/info`; #54 `39030593053` PASS.
- `Kiểm tra nội dung chủ động` → `/pdf/inspect-active-content`; #60 `39031147389` PASS.
- `Tệp đính kèm` → list/add/extract/remove endpoints; #66 `39031676738` PASS.
- `Làm sạch PDF` → `/pdf/sanitize`; #75 `39032719002` PASS.
- qpdf optimize/security batch (`Tối ưu xem web`, `Giải nén cấu trúc PDF`, `Nén PDF`, `Flatten PDF`, `Tối ưu hình ảnh`, `Bảo vệ PDF`, `Mở khóa PDF`) → #91 `39034173163` PASS.
- `Xóa chữ ký` → `/pdf/remove-signatures`; #97 `39034640214` PASS.
- `Quyền hạn PDF` read-only inspection via `/pdf/info`; #99 `39047266679` PASS.
- `Xóa chú thích` + `Mở khóa biểu mẫu`; #100 `39047834628` PASS.
- `Xóa trang trắng` + `Page Labels`; #101 `39048379715` PASS.
- Poppler converters TXT/HTML/XML/CBZ/SVG/PS/EPS; #102 `39048949509` PASS on `85984a4866791d6d89a67a1927d353e3b8e53562`.
- `PDF Portfolio` → `/pdf/portfolio`; #103 `39049468771` PASS.

## D3 Office runtime

### D3A — pinned LibreOffice runtime + standalone Office sidecar — PASS
- Existing `engines/office-service` remains the Office conversion source of truth.
- Official The Document Foundation LibreOffice `26.8.1` x64 (`PackageVersion 26.8.1.1`) is pinned in `desktop/vendor/libreoffice-windows-x64.json`.
- Asset: `LibreOffice_26.8.1_Win_x86-64.msi`; SHA-256 `c6298b10cfa1748bcbedad94c62ce771e240e5021bfd6d7a967cd571b04b5312`.
- `stage-office-runtime.ps1` downloads the official MSI, verifies SHA-256, administrative-extracts it and verifies `soffice --version`.
- `solyan-office.exe` runs the existing Office FastAPI service on loopback only.
- Office service honors `SOLYAN_LIBREOFFICE_BINARY`, caches the binary/version probe and does not respawn `soffice --version` on every health call.
- Windows Office Runtime CI run `39052164899` PASS on exact HEAD `a86a8358dcca55e39e761ce02f65914ba71039a2`, including real UTF-8 TXT → PDF output validation.

### D3B — installer/supervisor integration — PASS
- Installer bundles `solyan-office.exe` + extracted LibreOffice under `office/` resources.
- Tauri starts Office first on a random loopback port, then starts `solyan-core.exe` with `OFFICE_SERVICE_URL=http://127.0.0.1:<office-port>`.
- Office and core are independently tied to Windows Job Objects and explicit exit cleanup.
- Windows Desktop CI run `39052548159` / #105 PASS on exact HEAD `b12a59aa0d1e941ab9aab48ed8ebf9fb8749947a`.
- Exact-head gate passed UI/CSP, qpdf/Poppler + LibreOffice staging, both PyInstaller sidecars, Cargo, NSIS, installer existence, silent install, installed app launch, `solyan-office.exe` + `solyan-core.exe` observation, cleanup and installer artifact upload.

### D3C — Office conversion UI — WIRED / EXACT-HEAD GATE NEXT
- Office → PDF cards use existing `POST /office/to-pdf`: Word, Excel, PowerPoint, OpenDocument and RTF.
- PDF → Word / PowerPoint use existing `POST /experimental/pdf-to-office` with `mode=auto`, preserving **LibreOffice-first → Bloom fallback** semantics and reporting `X-SolYan-Conversion-Engine` when present.
- `PDF → Excel` is deliberately not advertised as local in D3: its source-of-truth path remains Bloom → PP-StructureV3 fallback and therefore waits for the appropriate D4/external runtime lane rather than exposing a misleading desktop-local button.
- Source files remain untouched; UI limits match the backend 100 MB Office conversion boundary.

## Locked PDF→Office release gate

- Release policy is `benchmarks/corpora/pdf_to_office_release_v1.json`.
- Gate is fixed at **27 cases / 68 source pages**: 18 synthetic cases plus 9 real cases / 50 selected real pages.
- DOCX/PPTX must remain LibreOffice-first → Bloom fallback.
- XLSX must remain Bloom → PP-StructureV3 fallback; scan regression preserves 9/9 pages.
- Do not mark D3 accepted for release until the exact 27/68 policy has been run/validated against the intended conversion stack.

## PDF sang ảnh parity boundary

- V1.5 web behavior is intentionally browser-local using PDF.js + Canvas + JSZip, including page selection, DPI, PNG/JPEG/WebP, color mode, annotation mode, ZIP vs single composite and strict render budgets.
- Do not silently replace that behavior with a different Poppler-only desktop contract merely because Poppler is bundled.
- Reuse/package the existing web contract or make an explicit parity decision before changing semantics.

## Next work — continue automatically

1. Keep Windows Desktop CI green on exact HEAD containing D3C Office UI and record the run/commit.
2. Execute/validate the locked PDF→Office **27-case / 68-page** release policy; preserve the established fallback order.
3. D4: package OCR runtime and connect OCR/scan plus Markdown/CSV tools.
4. Only after those gates, move to remaining heavyweight/local-runtime tools and release hardening.

Stop only for a genuine product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
