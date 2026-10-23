# sTool visible Save / Save As — implementation and evidence

Base: checkpoint/windows-stool-native-save-20261023 at c6eaf2b.
Target: feat/windows-stool-output-save-ui. Reader/main/stable untouched.
Installer #7 at 059b727 remains the accepted ENGINE/INSTALLATION demo; it does
not contain these Save controls and is not full user-facing Save acceptance.

## Actual product behavior

Processing now places the produced Blob in a visible Results shelf in the
tool page. Each result has Lưu (Save) and Lưu thành… (Save As). Processing no
longer automatically saves/downloads. The first Save opens the real owned
Windows dialog; later Save replaces that result's previously selected output.
Save As always asks for another path. Cancel retains the result and previous
destination. Errors keep both buttons available. Only a successful native
write displays Saved plus the actual path.

The common initialization script captures existing Blob outputs across tools,
without changing approved icons or importing heavy modules at Home. Existing
tool status wording that falsely said "already saved" is corrected.

Native destinations are held in a per-window output-ID map, never accepted as
renderer-supplied write paths. Bytes are written to a create_new sibling temp,
synced and replaced with Windows MoveFileExW REPLACE_EXISTING/WRITE_THROUGH.
Failures clean the temp. Source PDF fingerprints are collected on file input/
drop before existing tool handlers clear file inputs, then checked before any
write and immediately before replacement. Matching source content is refused,
including a different path/hardlink containing the same original PDF bytes.
This is app-level source preservation, not a hostile-filesystem TOCTOU guarantee.
Output: 250 MiB maximum; bounded 256 native result destinations.

## CSP defect found by the real Windows test

The initial browser-only prototype used fetch(blobURL); actual Tauri CSP
correctly blocked it. The final implementation retains the original Blob at
URL.createObjectURL instead, so no Blob fetch or CSP relaxation is required.
The permanent browser regression now uses production CSP headers.

## Evidence, 2026-10-23

- 14/14 native Rust Windows tests PASS, including atomic replacement, original
  hash rejection, no temp leak, first-save Cancel, Save destination reuse,
  Save As Cancel retaining the previous path, and Save As changing path.
- 15/15 Node lazy/icon/installer/native close/freeze contracts PASS.
- Actual merge.html/merge.js in Chromium with production CSP: visible Save /
  Save As, zero auto downloads, Cancel/retry, error feedback, original hashes,
  complete two-page PDF bytes and consistent result identity PASS. Native
  transport is mocked in this browser test; it does not prove Windows dialogs.
- Real local Tauri Windows binary, operated through Computer Use: opened two
  public CI PDFs, merged, saw BOTH Save buttons, opened real Save dialog,
  cancelled and observed the result remain available, retried Save to
  work/stool-save-probe/saved-merge.pdf, used Save again without another dialog,
  then Save As to work/stool-save-probe/saved-as-merge.pdf. All those actions
  succeeded; actual files were read back with pypdf.
- Both saved PDFs have two pages with expected text and page geometry. SHA256:
  231c91de9e36d921a243b5a86933fc0015fea6f18e9c80f71ae388ac2a245165
  Both public source SHA256 values remained unchanged after the native saves.
- Windows overwrite prompt was observed for choosing the public source path,
  but the UI interaction was interrupted before completing that collision
  scenario. Do not report native source-collision refusal or overwrite Yes/No
  acceptance from that partial test; the source guard has native unit coverage.
- Native binary contains final Save/CSP logic; a later text-only correction to
  old producer wording does not affect saved bytes or command behavior.

Fast CI runs the new browser regression using installed Edge and checksum-
verified pdf-lib 1.17.1. No browser download, sidecar/model staging or installer
build in Fast CI. Existing Rust, CORS, icons and lifecycle gates remain.

## Remaining integration gate — do not skip

Run ONE exact-head Fast CI. Then adapt installed.mjs/tool-download.mjs to click
the actual Save shelf and operate real Windows Save dialogs. Its old automatic
Playwright Download.saveAs protocol cannot validate this native command flow.
Do not simply bypass the dialog, mock stool_save_output in installed acceptance,
or remove any #7 engine/signing/PDF-A/source/uninstall/orphan checks.

Complete native overwrite Yes/No, source-collision refusal, failure/retry,
ZIP/TXT specialized outputs and all five engine outputs through the new shelf.
Only then run one deliberate sTool installer milestone and provide that new
installer for owner QA. Do not claim #7 includes this code or native Save is
release-accepted from local merge coverage alone. Keep Reader QR separately
checkpointed and keep native GUI interaction scoped to the test application.

## Save shelf alignment checkpoint — 2026-10-23

After Fast CI #14 passed at 0df8e83910e53cd0f4bdee73dfd0d249fcba25aa,
align the result shelf with the tool content, add 24px internal gutters and
place Save / Save As at the right of the filename row. Allow grid children to
shrink so the tool and result shelf do not overflow horizontally. At narrow
widths the actions wrap while retaining their right alignment.

The actual merge UI browser regression passes at 1024, 1200 and 1440px,
including gutter and horizontal-overflow assertions plus existing Save flow
checks. Workflow contracts and UI validation also PASS. This CSS-only follow-up
does not complete the installed native Save integration gate above; no new
installer has been built for it.
