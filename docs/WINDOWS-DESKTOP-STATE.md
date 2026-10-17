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

## Implemented on this branch

### D1A — Windows UI shell — PASS

- Windows Fluent-style Home surface matching the approved concept direction.
- Prominent `Ctrl + K` tool search.
- Complete user-facing tool catalog in `desktop/ui/catalog.js`.
- Locked category navigation and popular-tool surface.
- System light/dark styling baseline.
- `Nối PDF` is functional and processed browser-local with pinned `pdf-lib 1.17.1`; picker, drag/drop, ordering and local result download are implemented.
- Document workspace shell with page thumbnails, canvas, contextual toolbar and right-side inspector.
- `Sửa lỗi PDF` routes from Home to the bundled qpdf sidecar.
- `Trích xuất hình ảnh` routes from Home to the bundled Poppler `pdfimages` backend and downloads the resulting ZIP locally.

### D1B — Tauri / installer gate — PASS

- Tauri 2 Rust shell under `desktop/src-tauri/`.
- Standard Windows decorated/resizable window.
- NSIS current-user installer with Vietnamese/English languages.
- `.pdf` file association declaration.
- Strict CSP remains enabled; no `unsafe-inline` workaround.
- Installer bundles `solyan-core.exe`, pinned qpdf and pinned Poppler; no Docker, Python, system qpdf or system Poppler install is required on the user machine.
- Windows Desktop CI preserves diagnostics and installer artifacts and cancels superseded branch builds.
- Repair-PDF exact-head baseline: Windows Desktop CI run `39028459915` / #39 passed UI contract, Cargo, NSIS, silent install, local-core lifecycle and installer artifact upload.

### D2 — local core sidecar — PASS

- Windows-safe packaging requirements are separate from the Linux backend lock; the Linux lock is not reused because it contains Linux-only `uvloop`.
- Existing `backend.app.main` remains the API source of truth; there is no second desktop API fork.
- `desktop/backend/runner.py` binds only to `127.0.0.1` and requires a random per-launch `X-SolYan-Desktop-Token`.
- Desktop CORS origin defaults to Tauri Windows production origin `http://tauri.localhost` without changing normal web deployment defaults.
- qpdf Windows x64 runtime is pinned in `desktop/vendor/qpdf-windows-x64.json` at qpdf `12.4.2`, SHA-256 `db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d`.
- Poppler Windows x64 runtime is pinned in `desktop/vendor/poppler-windows-x64.json` at `26.09.0-0`, asset `Release-26.09.0-0.zip`, SHA-256 `7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0`.
- `desktop/backend/stage-native-runtimes.ps1` is the shared staging point for native Windows runtimes: exact URL, SHA-256 verification, extraction and CLI presence/version checks.
- Tauri supervisor resolves bundled qpdf + Poppler paths, chooses a free loopback port, generates the session token, starts the core, waits for authenticated qpdf-backed health and exposes the session through `desktop_core_session`.
- Core process is assigned to a Windows Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, while graceful exit still kill/waits explicitly. This prevents orphan `solyan-core.exe` even when the desktop parent is terminated abnormally.
- Core lifecycle baseline: Windows Desktop CI run `39027946794` / #33 passed silent install, launch, child-core startup, parent shutdown/kill fallback and child-core cleanup.
- Poppler packaging baseline: Windows Desktop CI run `39028885480` / #43 on commit `1cd11407c34b71a78ecdbbb7dfdf38e2eca1248d` passed pinned runtime download/hash/extract, Poppler CLI validation, Cargo, NSIS, installed `pdftoppm.exe`/`pdfinfo.exe`, app launch and core cleanup.

## Native tools wired

### Sửa lỗi PDF — PASS

- Reuses `POST /pdf/repair`; no duplicate desktop endpoint.
- UI obtains endpoint/token from `desktop_core_session`.
- Multipart `file` + `X-SolYan-Desktop-Token`.
- Result downloads locally; source file is never overwritten.
- Exact Windows Desktop CI baseline: `39028459915` / #39 PASS.

### Trích xuất hình ảnh — WIRED / FINAL EXACT-HEAD GATE IN PROGRESS

- Reuses existing `POST /pdf/extract-images`; no duplicate engine/API.
- Backend uses Poppler `pdfimages`, preflights image count/dimensions and enforces image/pixel/output-size safety limits.
- Existing `Extract Images CI` performs real embedded-image extraction: generates a PDF with an RGB image, calls the endpoint, verifies ZIP + PNG payload, and also checks no-image and invalid-PDF failures.
- Windows UI obtains endpoint/token from `desktop_core_session`, sends multipart `file`, reads `X-SolYan-Extracted-Images`, and downloads the ZIP locally.
- Windows Desktop CI contract now requires the Extract Images page, route, token header and endpoint strings while preserving strict CSP.

## Next work — continue automatically

1. Keep Windows Desktop CI green on the final exact HEAD for `Trích xuất hình ảnh`.
2. Continue converting catalog placeholders into real tools by reusing existing backend endpoints first; avoid duplicate APIs.
3. Next low-risk candidates: `Thông tin PDF`, other existing qpdf/Poppler-backed inspection/optimization tools, then PDF-to-image rendering if an existing route can be reused.
4. D3: package LibreOffice Windows runtime while preserving LibreOffice-first → Bloom fallback for DOCX/PPTX and the locked PDF→Office quality gate.
5. D4: package OCR runtime and connect OCR/scan tools.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
