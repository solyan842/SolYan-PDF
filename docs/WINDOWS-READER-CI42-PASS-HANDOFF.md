# Reader #42 accepted Windows build — 2026-10-22

Application branch: feat/windows-reader-fast-window-print-links
Application SHA: 7ef07ed1fd310c229126909c44875f9e7774807f
CI: https://github.com/solyan842/SolYan-PDF/actions/runs/39737874735
Result: SUCCESS
Installer: https://github.com/solyan842/SolYan-PDF/actions/runs/39737874735/artifacts/12408632915
Diagnostics: https://github.com/solyan842/SolYan-PDF/actions/runs/39737874735/artifacts/12408208183

## Proven in installed Windows acceptance

- Oversized window corrected fully inside actual 1024x720 work area.
- Exact normal restart, maximized restart, close during F11 and return to normal.
- Real native file activation/Save As, output content, original PDF preservation.
- Session, ten tabs/100 pages, clean close, zero sidecars/orphans and uninstall.
- Native link warning Cancel, forged approval rejection, unsafe destinations,
  denied WebView navigation and denied new windows.
- Browser print/security/layout regressions and all existing fast/Rust gates passed.

EXE: sReader PDF_0.1.0_x64-setup.exe
Bytes: 8527038
SHA256: 3f4db5e857b1f77ea99693949e38cb330e124f3f5a6f4aab02051b39a714455c
Downloaded EXE checksum verified locally.

## Resume without repeating completed work

The geometry/maximize failure is resolved at the exact SHA above. Do not rerun
#39-#42 or rebuild sTool to establish that fact. Read current GitHub HEAD/Actions
before new work. Do not promote main/stable without explicit authorization.

Remaining scope is listed in WINDOWS-READER-WINDOW-PRINT-LINKS.md:
real printer/driver acceptance, native Allow/Block acceptance, advanced print
English coverage, and explicit large-job limitations. These are not all proven
by the successful geometry/link-Cancel test. Preserve source PDFs and approved UI.

sTool Installer #4 at b6778f868253362e79483ac1405c4e3b43612b1c was already independently
SUCCESS. Its separate installer is unchanged:
https://github.com/solyan842/SolYan-PDF/actions/runs/39573909146/artifacts/12335965303

This is a documentation-only checkpoint, not a new application build.
