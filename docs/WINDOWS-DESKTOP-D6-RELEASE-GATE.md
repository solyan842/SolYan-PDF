# Windows D6 — installer release acceptance gate

Status: development branch, NOT a public release.
Branch: `feat/windows-desktop-d6-release-gate`.
D5 frozen signing + PDF/A installer source: `22085a8`.
Exact-head D5 Windows Desktop CI #129: **PASS**; build artifact
`SolYan-PDF-Windows-x64` and diagnostics were uploaded.

## Incremental D6 acceptance

The repository already proved:
- Windows x64 NSIS installer generation and silent install;
- five Windows loopback sidecars (qpdf core, LibreOffice, offline OCR, pyHanko,
  OCRmyPDF archive) start under Tauri supervisor and stop without orphans;
- real PKCS#12 signing + offline signature validation using the installed exe;
- real PDF/A conversion using the installed exe and pinned D4 Tesseract.

D6 adds **only** missing release assurance, without rewriting engines:
1. PowerShell parse-check of the installer verification script before the
   expensive Windows build starts.
2. Post-functional-smoke integrity record for the **actual installer**:
   SHA-256, byte size, exact Git commit, Windows desktop version, install mode.
   `Cargo.toml` and `tauri.conf.json` version must match.
3. On the disposable Windows Actions runner only, run the **installed NSIS
   uninstaller** with `/S`. Require the installed main application and all
   five local sidecar binaries to disappear, with no remaining sidecar
   processes. Do not remove data/user settings directories by force.
4. Keep combined stdout/stderr in `windows-desktop-diagnostics` with
   `if: always()`, including `desktop-d6-release-gate.log` and
   `desktop-windows-release-gate.json`.
5. Upload a separate successful
   `SolYan-PDF-Windows-release-checksums` artifact with the .sha256 and
   JSON manifest, which can be used to verify the CI-built installer before
   users install it.

**Gate:** D6 is not PASS until the branch's exact-head Windows Desktop CI
shows all jobs green, `desktop-windows-release-gate.json` says PASS, and
the installer SHA-256 corresponds to the same exact artifact.

## CI #130 uninstall failure and targeted regression

Windows Desktop CI #130 at `3230b66` failed only at D6 uninstall
verification, after both real installed signing and PDF/A smoke tests passed.
The real job log said 2 installed executable files remained. GitHub Actions
runner cleanup specifically terminated orphan `solyan-sign` and
`solyan-archive` processes after the job, identifying the failed test
isolation boundary. Existing smoke scripts called
`Popen.terminate()`, which only targets the PyInstaller `--onefile`
parent, not necessarily the frozen server's child.

The D6 fix uses **taskkill /PID <owned PID> /T /F** on Windows, scoped
strictly to the process tree spawned by each smoke test. It then requires
the loopback socket to stop listening. This is a test harness fix, **not**
a blanket system-wide kill and **not** a weakening of the uninstall gate.
The CI includes a small regression test for process-tree cleanup and an
additional pre-uninstall assertion that no smoke-owned signing/archive
processes remain. The D6 error manifest now lists exact leftover executable
names and live sidecar names if uninstall still fails. Successful installed
signing/PDF-A crypto/format tests remain mandatory.

## Remaining restrictions

- The produced installer is **unsigned** unless Authenticode signing is
  independently arranged. Do not claim it is publisher-signed.
- A full end-user acceptance pass (Windows 10/11, PDF GUI interactions,
  usability, filename association, WebView2 runtime availability) still needs
  real representative environments. A GitHub CI green run is not the same
  as verified broad production readiness.
- The installed app does not bundle the optional external Bloom model for
  PDF-to-Office fallback.
- OCR/PDF-A compliance is limited to the validated cases; no claims of
  universal fidelity/compliance.
- Do not publish a GitHub release or tag, and do not merge to `main`, until
  `AGENTS.md` release gates are checked on current `main`, and release
  version/tag and user-facing scope are settled.
- Keep the PDF-to-Office V1 27/68 and Windows D4 OCR gates unchanged.

## CI reproduction
```powershell
# On a disposable GitHub-hosted Windows runner, after install and app smoke:
./desktop/backend/verify-installer-release.ps1 `
  -InstallerPath $installer.FullName `
  -InstallRoot $installRoot `
  -AppPath $appExe `
  -ArtifactDirectory artifacts
```
