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

## Implemented on this branch

### D1A — Windows UI shell — PASS

- Windows Fluent-style Home surface matching the approved concept direction.
- Prominent `Ctrl + K` tool search.
- Complete user-facing tool catalog in `desktop/ui/catalog.js`.
- Locked category navigation and popular-tool surface.
- System light/dark styling baseline.
- `Nối PDF` is functional and processed browser-local with pinned `pdf-lib 1.17.1`; picker, drag/drop, ordering and local result download are implemented.
- Document workspace shell with page thumbnails, canvas, contextual toolbar and right-side inspector.
- Real tool routes currently include `Sửa lỗi PDF`, `Trích xuất hình ảnh`, `Thông tin PDF`, and `Kiểm tra nội dung chủ động`.

### D1B — Tauri / installer gate — PASS

- Tauri 2 Rust shell under `desktop/src-tauri/`.
- Standard Windows decorated/resizable window.
- NSIS current-user installer with Vietnamese/English languages.
- `.pdf` file association declaration.
- Strict CSP remains enabled; no `unsafe-inline` workaround.
- Installer bundles `solyan-core.exe`, pinned qpdf and pinned Poppler; no Docker, Python, system qpdf or system Poppler install is required on the user machine.
- Windows Desktop CI preserves diagnostics and installer artifacts and cancels superseded branch builds.
- Runtime gate performs silent NSIS install, starts the installed app, verifies bundled native resources, observes `solyan-core.exe`, exits the app and verifies no orphan core remains.

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
- Exact installed-runtime baseline: Windows Desktop CI run `39029525483` / #49 on `52db3ca9d682b1a75aadf6bf575460c9f877b22b` PASS.

## Native tools wired

### Sửa lỗi PDF — PASS

- Reuses `POST /pdf/repair`; no duplicate desktop endpoint.
- UI obtains endpoint/token from `desktop_core_session`.
- Multipart `file` + `X-SolYan-Desktop-Token`.
- Result downloads locally; source file is never overwritten.
- Exact Windows Desktop CI baseline: `39028459915` / #39 PASS.

### Trích xuất hình ảnh — PASS

- Reuses existing `POST /pdf/extract-images`; no duplicate engine/API.
- Backend uses Poppler `pdfimages`, preflights image count/dimensions and enforces image/pixel/output-size safety limits.
- Windows UI obtains endpoint/token from `desktop_core_session`, sends multipart `file`, reads `X-SolYan-Extracted-Images`, and downloads the ZIP locally.
- Exact installed-runtime branch baseline: Windows Desktop CI run `39029525483` / #49 PASS.

### Thông tin PDF — PASS

- Reuses existing `POST /pdf/info`; no duplicate desktop endpoint.
- qpdf provides structure/encryption analysis; Poppler `pdfinfo`, `pdffonts`, and `pdfimages -list` provide document metadata, font and image tables.
- Supports optional PDF password.
- Desktop UI presents summaries, metadata, structural/security counts, font/image details and SHA-256 without dumping raw JSON as the primary UX.
- No new runtime or dependency was added.
- Exact Windows Desktop CI baseline: run `39030593053` / #54 on commit `6a448aefff88365bb57706346a92c5fd67dbcf8d` PASS, including UI contract, Cargo, NSIS, silent install, installed app launch and local-core cleanup.

### Kiểm tra nội dung chủ động — WIRED / EXACT-HEAD GATE IN PROGRESS

- Reuses existing `POST /pdf/inspect-active-content`; no duplicate desktop endpoint.
- qpdf JSON inspector searches reachable object graph for JavaScript, actions, triggers, active annotations and attachment references.
- Optional PDF password supported.
- JavaScript payload is displayed only as text and is never executed by the desktop UI.
- UI preserves the web product safety language: a finding does not mean a PDF is certainly malicious; this structural inspector is not antivirus and cannot guarantee a PDF is completely safe.
- Windows Desktop CI contract requires the page, route, token header, endpoint and strict-CSP hygiene.

## Next work — continue automatically

1. Keep Windows Desktop CI green on the final exact HEAD for `Kiểm tra nội dung chủ động` and record its exact run/commit as PASS.
2. Continue low-risk existing qpdf/Poppler-backed tools before adding new heavy runtimes. Prioritize existing APIs such as attachments/security inspection/optimization where UX can remain clear and local-first.
3. Then connect PDF-to-image rendering if the existing Poppler-backed route can be reused cleanly.
4. D3: package LibreOffice Windows runtime while preserving LibreOffice-first → Bloom fallback for DOCX/PPTX and the locked PDF→Office quality gate.
5. D4: package OCR runtime and connect OCR/scan tools.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
