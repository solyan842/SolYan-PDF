# Windows D5 — local signing integration

Status: INTEGRATION / exact-HEAD Windows Desktop CI is mandatory.
Branch: `feat/windows-desktop-d5-signing`. Preserve `main` and all D4 gates.

## Reused backend
- Existing `engines/sign-service` pyHanko 0.37.0 is the only signing engine; no duplicate signing implementation.
- `backend.app.sign_proxy` retains `/sign/health`, `/sign/pkcs12`, and `/sign/validate`. It passes the per-launch `SOLYAN_SIGN_TOKEN` header only when configured for desktop.
- Standalone `solyan-sign.exe` binds exclusively to `127.0.0.1`, refuses unauthenticated requests and uses a random per-session 256-bit token. The signing sidecar is tied to a Windows Job Object and stopped on application exit.
- Signed PDFs and private key material remain local; no credentials are written to logs or bundled in the installer.
- The UI exposes **Ký PDF** and **Kiểm tra chữ ký**. The signature validation mode is offline (`network_fetching: false`) and differentiates cryptographic validity from certificate trust.

## CI and release gate
- `Windows Signing Runtime CI` #1 PASS at initial signing sidecar commit `3f0ad89` (real generated ephemeral P12 and frozen Windows exe).
- Windows Desktop CI on the **integration commit** must prove: pinned pyHanko installed, frozen sign sidecar staged in NSIS, installed app starts four sidecars and closes all four without orphans.
- All UI routes/CSP contract checks remain strict. The PDF-to-Office 27-case/68-page release policy is unchanged.
- A successful test with a self-signed certificate demonstrates valid signature cryptography, **not** public-chain certificate trust.
- Do not call D5 complete or release without exact-head installer CI PASS. PDF/A remains the next independent D5 sub-lane.

## Paths
`desktop/backend/sign_runner.py`, `desktop/ui/sign.{html,js}`,
`backend/app/sign_proxy.py`, `desktop/src-tauri/{src/main.rs,tauri.conf.json}`,
`.github/workflows/windows-desktop-ci.yml`, `desktop/ui/validate-contract.ps1`.
