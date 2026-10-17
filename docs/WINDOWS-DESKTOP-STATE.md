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
- `Sửa lỗi PDF` is the first native-core tool page and routes from Home to the bundled qpdf sidecar.

### D1B — Tauri / installer gate — PASS

- Tauri 2 Rust shell under `desktop/src-tauri/`.
- Standard Windows decorated/resizable window.
- NSIS current-user installer with Vietnamese/English languages.
- `.pdf` file association declaration.
- Strict CSP remains enabled; no `unsafe-inline` workaround.
- Installer bundles `solyan-core.exe` and the pinned qpdf runtime; no Docker, Python or system qpdf install is required on the user machine.
- Windows Desktop CI preserves diagnostics and installer artifacts and cancels superseded branch builds.
- Build baseline: run `39026035774` / Windows Desktop CI #28 passed Cargo check, NSIS build, installer verification and artifact upload.

### D2 — local core sidecar — PASS

- Windows-safe packaging requirements are separate from the Linux backend lock; the Linux lock is not reused because it contains Linux-only `uvloop`.
- Existing `backend.app.main` remains the API source of truth; there is no second desktop API fork.
- `desktop/backend/runner.py` binds only to `127.0.0.1` and requires a random per-launch `X-SolYan-Desktop-Token`.
- Desktop CORS origin defaults to Tauri Windows production origin `http://tauri.localhost` without changing normal web deployment defaults.
- Official qpdf Windows x64 runtime pinned in `desktop/vendor/qpdf-windows-x64.json`:
  - qpdf `12.4.2`
  - `qpdf-12.4.2-msvc64.zip`
  - SHA-256 `db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d`
- Windows Core Sidecar CI run `39024452859` passed PyInstaller packaging, token protection, qpdf-backed `/health` and deterministic one-page `/pdf/repair` smoke.
- Tauri supervisor resolves the bundled core/qpdf resources, chooses a free loopback port, generates the session token, starts the core, waits for authenticated qpdf-backed health and exposes the session to the UI through `desktop_core_session`.
- Core process is assigned to a Windows Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, while graceful exit still kill/waits explicitly. This prevents orphan `solyan-core.exe` even when the desktop parent is terminated abnormally.
- Exact runtime evidence: Windows Desktop CI run `39027946794` / #33 on commit `6d7902de2aafc94a12ab1450549639d4f581fd4a` passed Cargo check, NSIS build, silent install, launch, bundled qpdf/core discovery, child-core startup, parent shutdown/kill fallback, child-core cleanup and installer artifact upload.

## Native tool wiring now in progress

### Sửa lỗi PDF

- Uses the existing backend endpoint `POST /pdf/repair`; no duplicate desktop endpoint.
- UI obtains the loopback endpoint/token from Tauri command `desktop_core_session`.
- Request uses multipart field `file` and `X-SolYan-Desktop-Token`.
- Result is downloaded locally; the source file is never overwritten.
- Tool UI follows the locked Fluent visual language and keeps the local-processing message visible.

## Next work — continue automatically

1. Keep Windows Desktop CI green on the current exact HEAD, including the `Sửa lỗi PDF` UI contract.
2. Exercise the first native tool end-to-end from the packaged app, then expand qpdf-backed tools without creating duplicate APIs.
3. Research, pin and package Poppler Windows x64 for render/extract/compare-dependent tools.
4. D3: package LibreOffice Windows runtime while preserving LibreOffice-first → Bloom fallback for DOCX/PPTX and the locked PDF→Office quality gate.
5. D4: package OCR runtime and connect OCR/scan tools.
6. Continue converting catalog placeholders into real tools in priority order while preserving browser-local implementations where they are already simpler/stronger.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
