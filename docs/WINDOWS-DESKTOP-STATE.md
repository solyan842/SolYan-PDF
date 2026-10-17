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

### D1A — Windows UI shell

- Windows Fluent-style Home surface, matching the approved concept direction.
- Prominent `Ctrl + K` tool search.
- Complete user-facing tool catalog in `desktop/ui/catalog.js`.
- Locked category navigation and popular-tool surface.
- System light/dark styling baseline.
- `Nối PDF` screen with picker, drag/drop and reorder shell.
- Document workspace shell with page thumbnails, canvas, contextual toolbar and right-side inspector.

### D1B — Tauri / installer gate

- Tauri 2 Rust shell under `desktop/src-tauri/`.
- Standard Windows decorated/resizable window.
- NSIS current-user installer configuration.
- Vietnamese/English NSIS language configuration.
- `.pdf` file association declaration.
- Windows Desktop CI builds the Tauri NSIS target and preserves diagnostics.
- Workflow concurrency cancels superseded desktop builds.

### D2 — local core sidecar, in progress

- Windows-safe packaging requirements are separate from the Linux backend lock; the Linux lock is not reused because it contains Linux-only `uvloop`.
- Existing `backend.app.main` remains the API source of truth; no second desktop API fork.
- `desktop/backend/runner.py` binds only to `127.0.0.1` and requires a per-launch `X-SolYan-Desktop-Token`.
- Desktop CORS origin defaults to Tauri Windows production origin `http://tauri.localhost` without changing normal web deployment defaults.
- Official qpdf Windows x64 runtime pinned in `desktop/vendor/qpdf-windows-x64.json`:
  - qpdf `12.4.2`
  - `qpdf-12.4.2-msvc64.zip`
  - SHA-256 `db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d`
- Windows Core Sidecar CI:
  - downloads and verifies pinned qpdf;
  - packages the existing FastAPI backend with PyInstaller;
  - verifies token rejection;
  - verifies qpdf-backed `/health`;
  - exercises `/pdf/repair` with a deterministic one-page PDF fixture;
  - preserves diagnostics and, on success, uploads `solyan-core.exe`.

## Last observed D2 diagnostic

The first sidecar smoke run built `solyan-core.exe` successfully and passed qpdf download/hash/version, sidecar startup, authenticated qpdf-backed health, token protection and `/pdf/repair` invocation. Its final qpdf validation failed only because the original smoke fixture used a zero-page PDF (`file does not contain any pages`). The fixture was replaced with `desktop/backend/make_smoke_pdf.py`, which generates a deterministic one-page PDF. The replacement run must be checked from current repository-wide Actions state before calling D2 PASS.

## Next work — continue automatically

1. Refresh repository-wide workflow runs; verify current branch HEAD.
2. Diagnose only the newest exact-head failing workflow using real raw job logs (artifact fallback if needed).
3. Get both Windows Desktop CI and Windows Core Sidecar CI green on current relevant HEADs.
4. Add Tauri sidecar supervisor:
   - generate random token + free loopback port;
   - spawn packaged `solyan-core.exe` with qpdf runtime on PATH;
   - wait for token-authenticated `/health`;
   - terminate child on application exit.
5. Stage `solyan-core.exe` + pinned qpdf runtime into the Tauri installer build; do not require Docker or a system qpdf install.
6. Wire the first real desktop qpdf action to the local sidecar and preserve browser-local operations where they are already stronger/simpler.
7. Research and pin Poppler Windows runtime before adding Poppler-dependent tools.
8. D3 LibreOffice Windows runtime, then D4 OCR.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
