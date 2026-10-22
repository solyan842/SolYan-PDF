# sTool Installer #7 PASS; native Save draft checkpoint

## Accepted CI demo source

- Branch: build/windows-stool-demo-20261022-sign-retry
- SHA: 059b727db6bce818e76988b9f9aa5484875049b0
- Fast CI #13 SUCCESS: https://github.com/solyan842/SolYan-PDF/actions/runs/39806581197
- Installer #7 SUCCESS: https://github.com/solyan842/SolYan-PDF/actions/runs/39810344157
- Windows x64 NSIS artifact:
  https://github.com/solyan842/SolYan-PDF/actions/runs/39810344157/artifacts/12441249583
- NSIS bytes: 885039290; SHA256:
  94e0b8c7912b63a684f6af981291212156967ccddf161718b2f8dbf12eb41202
- Diagnostics artifact: 12442587164; checksums artifact: 12442397328.

Downloaded and inspected stool-native/report.json (status PASS),
desktop-windows-release-gate.json (status PASS, exact SHA), and
stool-installer-smoke.log. All five live-frozen engine recoveries passed:
Core, Office, OCR, sign, archive. Real outputs, concurrent reuse, invalid-input/
wrong-password retry, source hashes, normal close and descendant cleanup pass.
Separate pyHanko check: one cryptographically valid signature; offline trust
not established (trusted=false), no network fetching. Frozen PDF-A smoke PASS.
Current-user install and silent uninstall pass; installed executables removed.

Home observed usable time 2820ms on Windows Server 26100 / AMD EPYC / 16GB,
sampled peak private bytes 163020800. First OCR 33045ms, peak private bytes
1550610432. These include test transport overhead and uncontrolled OS cache;
not a retail hardware performance guarantee. Owner field demo still pending.
No main/stable merge or public release. Reader stable is unchanged.

## Native Save draft in THIS checkpoint only

Reuse Tauri's existing WebviewWindowBuilder::on_download and Win32 common
Save dialog, as Reader already uses GetSaveFileNameW. The callback chooses a
destination before WebView starts download IO; no PDF byte copy across IPC,
no sidecar at Home, no per-tool UI rewrite and no new crate. Dialog Cancel
returns false; Windows provides path-existence and overwrite prompts.

Changed draft files: output_save.rs, main.rs setup/download hook,
tauri.conf.json create=false/manual main window creation, Cargo Windows dialog
feature, and the startup contract allowing window-only setup. Existing
startup assertions still prohibit all five engine start functions.

Reference: https://docs.rs/tauri/2.12.4/tauri/webview/struct.WebviewWindowBuilder.html#method.on_download

Local compile/build PASS, 12 Rust Windows tests PASS, 15 Node contract/close/
freeze tests PASS. The new Rust test covers safe filename suggestions only;
it does NOT prove Save dialog acceptance. No heavy CI launched for this draft.

## Verified local technical boundary

Real UI launch fails creating WebView2 with HRESULT 0x800700AA:
`The requested resource is in use.`
Reproduces with both the new manual-window setup and the old auto-window
startup, each with a distinct test dataDirectory. A separate executable name
also failed. No existing user browser process was killed, no registry/security
setting changed, and no user PDF used. Sources restored after comparison.
Local probe files/logs are under work/stool-save-probe, outside repo source.

DO NOT promote this checkpoint or call native Save complete. Continue on a
dedicated feat/windows-stool-* branch only after reviewing current GitHub.
Resolve the local WebView launch boundary or use a disposable native QA host.
Then exercise actual PDF/ZIP/TXT output via the installed tool UI, selected
Windows path, Cancel (no output), overwrite Yes/No, errors, exact contents and
original SHA preservation. Verify cancel/error status ordering and completion
feedback; confirm suggested extension and parent ownership.

Existing installed.mjs uses Playwright Download.saveAs, which can bypass the
native destination flow. Update the installed harness to operate the real
dialog before the next heavy milestone; never weaken/remove the #7 gates.
The draft has not yet implemented source-path exclusion if the user explicitly
selects the input file, nor proven atomic output replacement. These require
design/implementation and real tests before native Save acceptance.

After that: one Fast CI, then one deliberate installer milestone. Preserve
the #7 demo branch/SHA. Tool catalog #136 follows native Save. Reader QR fix
remains separately checkpointed at 9e69bc51e7cd9c8300ff650b50f98f6fb42a1bb5.
