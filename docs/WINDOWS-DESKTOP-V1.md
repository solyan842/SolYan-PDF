# SolYan PDF Windows Desktop V1

Status: implementation lane / Windows x64 first

## Product goal

Ship SolYan PDF as a Windows desktop application that runs document processing locally and does not require a public SolYan PDF host for normal use.

The existing web/PWA product remains intact. Desktop is a packaging/orchestration layer around the same frontend contracts and engine behavior rather than a fork of the product.

## Platform decision

### Shell: Tauri 2

Tauri 2 is the selected Windows shell because it:

- reuses the current HTML/React UI instead of introducing a second UI stack;
- supports Windows NSIS `.exe` and MSI packaging;
- has first-class external sidecar support for local services/binaries;
- uses the system WebView2 runtime rather than bundling a full Chromium runtime;
- allows a narrow capability model for spawning only approved bundled sidecars.

Electron is not selected for V1 because its bundled Chromium/Node runtime materially increases package/runtime footprint without solving any engine problem that Tauri sidecars cannot solve. Wails is not selected because moving orchestration into Go would add an unnecessary second backend implementation beside the existing Python/FastAPI services.

## Locked V1 target

- OS: Windows 10/11 x64.
- Installer: NSIS `SolYan-PDF_<version>_x64-setup.exe` first; MSI may be added after the NSIS path is proven.
- Install scope: current user by default; no administrator requirement for the app shell itself.
- UI: reuse the existing frontend.
- Networking: all local product traffic binds to loopback only (`127.0.0.1`), never `0.0.0.0`.
- Cloud connectors remain optional and use the existing Google Drive / OneDrive / WebDAV product contracts.
- No Docker requirement in the final desktop V1.
- No silent fallback to a remote SolYan host when a local engine is unavailable.

## Runtime architecture

```text
Tauri Windows shell
  |
  |-- WebView2 -> SolYan frontend
  |
  `-- local supervisor
        |-- core API sidecar (FastAPI contract)
        |     |-- qpdf
        |     `-- Poppler utilities
        |-- Office sidecar -> bundled/pinned LibreOffice runtime
        |-- OCR sidecar -> PaddleOCR / PP-StructureV3 + Tesseract fallback
        |-- signing sidecar -> pyHanko
        `-- archive/PDF-A sidecar
```

The existing optional Bloom service remains external/optional for paths that already depend on it; desktop V1 must not pretend Bloom is bundled when it is not.

## Packaging phases

### D1 — Desktop shell + local contract

- Tauri 2 project under `desktop/`.
- Windows x64 NSIS build workflow.
- loopback-only runtime contract and deterministic health checks.
- strict sidecar capability declarations when sidecars are added.
- desktop shell lifecycle owns child processes and terminates them on app exit.

### D2 — Core local backend

Bundle the existing FastAPI core as a Windows sidecar and package pinned Windows qpdf/Poppler tools. Reuse routes; do not create desktop-only conversion APIs.

### D3 — Office

Package a pinned LibreOffice Windows runtime and point the existing Office service adapter to that local runtime.

### D4 — OCR

Build a dedicated Windows OCR sidecar. Keep Paddle models in the application data/model cache rather than repeatedly downloading them into temporary directories. Preserve Tesseract `vie+eng` and OSD fallback behavior.

### D5 — Signing / PDF-A / remaining services

Package the existing pyHanko and archive service paths and verify the permanent PDF-to-Office and OCR release gates remain unchanged.

### D6 — Installer/release

- unsigned CI artifacts first;
- Authenticode signing only when a real certificate/signing provider is available;
- install/uninstall smoke on Windows runner;
- start app -> local health -> frontend smoke -> clean shutdown;
- no temporary desktop workflow may enter a product release unintentionally.

## Security invariants

- Sidecars bind to `127.0.0.1` only.
- The desktop shell chooses/reserves local ports; ports are not fixed public listeners.
- Desktop-to-local-service requests carry a per-launch random token where an HTTP service is used.
- Tauri capabilities allow only named packaged sidecars and bounded arguments.
- User documents remain local unless the user explicitly invokes a cloud connector.
- App exit terminates owned sidecars.
- Installer scripts must not disable Windows security controls or firewall protections.

## OSS-first packaging policy

Prefer official/upstream Windows distributions for qpdf, Poppler/Tesseract/LibreOffice and maintained packaging mechanisms. Do not rebuild document engines merely to make them desktop-native. The desktop layer remains an adapter/supervisor around the existing engine contracts.

## First usable Windows acceptance gate

A build is not called usable until a Windows x64 CI runner proves all of the following from the generated installer/unpacked artifact:

1. shell starts successfully;
2. WebView loads the SolYan UI;
3. local core API reaches healthy state;
4. a browser-local PDF operation succeeds;
5. at least one qpdf-backed operation succeeds locally;
6. app shutdown leaves no owned SolYan sidecar process behind.

Office/OCR are promoted into the desktop-supported matrix only after their own real smoke tests pass; unavailable engines must be shown explicitly rather than silently routed to a public server.
