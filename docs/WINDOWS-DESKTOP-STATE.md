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
- Real desktop tool routes now include `Sửa lỗi PDF`, `Trích xuất hình ảnh`, `Thông tin PDF`, `Kiểm tra nội dung chủ động`, `Tệp đính kèm`, `Xóa hình ảnh`, `Làm sạch PDF`, `Tối ưu xem web`, and `Giải nén cấu trúc PDF`.

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
- Exact Windows Desktop CI baseline: `39028459915` / #39 PASS.

### Trích xuất hình ảnh — PASS
- Reuses `POST /pdf/extract-images`; no duplicate engine/API.
- Exact installed-runtime branch baseline: Windows Desktop CI run `39029525483` / #49 PASS.

### Thông tin PDF — PASS
- Reuses `POST /pdf/info`; qpdf + Poppler provide structure, encryption, metadata, font and image inspection.
- Optional PDF password; desktop presents summaries/details instead of raw JSON as primary UX.
- Exact Windows Desktop CI baseline: `39030593053` / #54 on `6a448aefff88365bb57706346a92c5fd67dbcf8d` PASS.

### Kiểm tra nội dung chủ động — PASS
- Reuses `POST /pdf/inspect-active-content`; no duplicate desktop endpoint.
- Searches reachable qpdf object graph for JavaScript, actions, triggers, active annotations and attachment references.
- JavaScript is displayed as text only and never executed.
- Product language stays explicit: findings do not prove malware; this is structural inspection, not antivirus.
- Exact Windows Desktop CI baseline: `39031147389` / #60 on `2bf8cf314deea8b07bf9bed964767fa25a25aec4` PASS, including UI/CSP contract, Cargo, NSIS, silent install, installed app launch and core cleanup.

### Tệp đính kèm — PASS
- Reuses existing qpdf endpoints: `POST /pdf/attachments/list`, `/add`, `/extract`, `/remove`.
- No duplicate engine/API and no new runtime dependency.
- UI can list embedded files, extract one attachment, add multiple bounded attachments, or remove one attachment into a newly generated PDF.
- Add/remove never overwrite the source PDF; result is downloaded as a new file.
- Backend limits remain authoritative: PDF 100 MB, at most 20 attachments per add, 25 MB each, 50 MB combined, extracted payload bounded to 100 MB.
- Exact Windows Desktop CI baseline: `39031676738` / #66 on `a0027f239ac16504d0b26590b1d3e4a12a68b8e2` PASS, including route + four endpoint contract, strict CSP, Cargo, NSIS, silent install, installed app launch and core cleanup.

### Xóa hình ảnh — PASS
- Reuses existing `POST /pdf/remove-images`; no duplicate desktop endpoint or new runtime dependency.
- qpdf JSON removes reachable Image XObject references from page/Form resources while preserving text/vector structure supported by the existing engine.
- Backend validates output using `qpdf --check` and returns `X-SolYan-Images-Removed` with the number of Image XObjects removed.
- Desktop always downloads `solyan-images-removed.pdf` as a new file; source PDF is never overwritten.
- UX explicitly warns that visual layout may change when images are important page content.
- The route and installed runtime are covered by later exact-head Windows Desktop gates, including #75 below.

### Làm sạch PDF — PASS
- Reuses existing `POST /pdf/sanitize`; no duplicate desktop endpoint.
- User can independently remove actions/active content, links, metadata, and embedded files.
- Desktop presents removal counts from `X-SolYan-Sanitize-*` response headers and always creates a new PDF.
- UX explicitly states structural sanitization is not antivirus and does not prove a file is completely safe.
- Exact Windows Desktop CI baseline: run `39032719002` / #75 on `627a3a7d3295bd93a990b1d009dcc080cdd17119` PASS.

### Tối ưu xem web — WIRED / EXACT-HEAD GATE IN PROGRESS
- Reuses existing `POST /pdf/web-optimize` (`qpdf --linearize`).
- No duplicate backend/API and no extra runtime dependency.
- Desktop explains that linearization improves byte-range/page-first loading and is not image compression.
- Source PDF is never overwritten; result downloads as `solyan-web-optimized.pdf`.

### Giải nén cấu trúc PDF — WIRED / EXACT-HEAD GATE IN PROGRESS
- Reuses existing `POST /pdf/decompress` (`--stream-data=uncompress`, `--object-streams=disable`).
- No duplicate backend/API and no extra runtime dependency.
- Desktop makes the technical purpose explicit and warns that output size may grow substantially.
- Source PDF is never overwritten; result downloads as `solyan-decompressed.pdf`.

## Next work — continue automatically

1. Keep Windows Desktop CI green on the final exact HEAD for `Tối ưu xem web` + `Giải nén cấu trúc PDF` and record the exact run/commit as PASS.
2. Continue low-risk existing-engine tools. Best next candidate: `PDF sang ảnh` using the already bundled Poppler/runtime and existing backend contract if reusable without API fork.
3. D3: package LibreOffice Windows runtime while preserving LibreOffice-first → Bloom fallback for DOCX/PPTX and the locked PDF→Office quality gate.
4. D4: package OCR runtime and connect OCR/scan tools.

Stop only for a genuine user product decision, credentials/permissions, irreversible/destructive choice, or a hard tool boundary.
