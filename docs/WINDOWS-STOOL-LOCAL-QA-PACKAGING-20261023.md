# Local QA first; package once

User direction, 2026-10-23: perform functional QA on the Windows PC, then use
GitHub to package. Do not rebuild a roughly 885 MB installer to debug a test
driver. This updates the execution order in the earlier Save checkpoints.

## Verified current repository boundary

Reference HEAD: fb9d27d248e21bf53f58c08bfa6597d54561e34e on
feat/windows-stool-output-save-ui. Latest repository-wide run at inspection:
Installer #8, run 39909364844, failed at installed Save acceptance. Its actual
log expected artifacts/stool-native/compressed.pdf but the application reported
Documents/solyan-compressed.pdf. Compilation and NSIS creation had succeeded.
The installer was 885101209 bytes. Do not rebuild it to diagnose this mismatch.

The actual local application shows the modern Windows filename edit, ID 1001,
inside FileNameControlHost. The CI fixture uses WinForms with
AutoUpgradeEnabled=false. Its previous PASS does not prove the installed
application's dialog driver. The old driver's last matching Edit selection
and direct WM_COMMAND remain unverified against the modern dialog; there is
no evidence that changing product Save code is necessary.

## Direct Windows application evidence

Operated the existing sTool-Save-UI-Test.exe through Computer Use, without
recompiling, NSIS, sidecar/model downloads or a new CI run. Binary SHA256:
f6da54ef7378eb72b9c5b2316761d5ea639c44fae22050345b395d432f566a28.
This is the earlier local probe containing the final native Save/CSP logic,
with earlier UI wording/CSS. It is NOT whole-HEAD installer acceptance.

Public fixtures only, under work/stool-save-probe/fixtures. Local baseline:

- source-one.pdf: e52d10386387c0011427178b01dbd4b331d0dab6f5787a7525fdf9089e198ba4
- source-two.pdf: d5aecee41c128e05c67ba4108fe7692d0cf53e4b936c32e0efa24f0a8914dfbd

Newly completed native cases:

1. Merge the two PDFs, use visible Save, choose kiem-tra-luu-23.pdf in the
   explicit local probe directory. UI reports the exact selected path.
2. Read output with pypdf: two pages; exact concatenated source text and page
   geometry; both original SHA256 values unchanged.
3. Save As to source-one.pdf, answer Windows overwrite Yes. Application refuses
   with "PDF nguồn được bảo vệ". Both originals still match their baseline.
4. Save after that error: succeeds to the earlier output without another dialog.
5. Save As to an output containing "overwrite sentinel", answer No: sentinel
   remains byte-identical and the chooser remains available.
6. Retry and answer Yes: output is the correct two-page PDF.
7. Hold only that disposable output with FileShare.None. Save reports Windows
   error 32 and both Save actions remain enabled. Release lock, retry Save:
   succeeds to the same path, correct PDF, no .solyan-*.tmp remains.
8. Save As to "Bản lưu tiếng Việt 23.pdf": exact Unicode/spaced path reported;
   actual file re-read, correct text/geometry and unchanged source hashes.

The three new outputs all have SHA256:
55511d88a16043836649174673e5e311246aa2798e0131b759fa1e39272b7a18.
Their PDF metadata differs from the earlier local merge; comparisons here use
the current result bytes plus source text/geometry, not the old output hash.
The existing local verify_saved_pdf.py reads outputs and checks the preserved
source-hashes.json baseline. Private user PDFs were not opened or uploaded.

## Build/test separation implemented

- windows-stool-installer.yml builds the dedicated sTool NSIS candidate and
  emits its exact source SHA, byte length and SHA256. It does not run the UI
  Save driver or repeat unit/browser/Rust checks already run before packaging.
- Its manifest explicitly says packaging-only, functional_acceptance=not-run,
  release_accepted=false. Packaging green must never be described as a full
  application/release PASS.
- All original installed functional, signing, PDF/A, source, recovery, close,
  uninstall and orphan gates remain in stool-installer-smoke.ps1/installed.mjs.
  No assertion or quality threshold was removed from them.
- Optional windows-stool-acceptance.yml downloads a successful candidate by
  run ID, verifies exact SHA256/source identity, and invokes those original
  gates without staging models, freezing engines or rebuilding NSIS. It is
  manual only. Driver-only revisions can reuse the same installer; product
  source differences are rejected. This optional lane is not launched as part
  of routine packaging or this local QA milestone.

Local validation of the workflow change: YAML/isolation checks PASS; three
installer contract tests PASS; two candidate identity tests PASS. No new CI
or heavyweight build was launched for this checkpoint.

## Work still pending; do not claim complete

- Current full product revision local acceptance, including specialized ZIP/
  TXT output and all five engines through Save, remains pending. Reuse cached
  local runtimes; only compile the small application when its code changes.
- Do not re-run the completed native merge Save cases unless their source or
  environment changes. Carry these results forward with the recorded scope.
- The existing CI dialog driver has NOT been repaired or validated by manual
  Computer Use. Do not invoke optional full acceptance until its modern-dialog
  mismatch is resolved. That work must reuse an existing candidate, not rebuild.
- Before the next packaging milestone, verify GitHub HEAD and local source
  identity, complete affected local cases, then package once. Reader, stable
  and main stay untouched; no public release acceptance is claimed.
