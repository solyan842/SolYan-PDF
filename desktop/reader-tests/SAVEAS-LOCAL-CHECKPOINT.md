# Reader Save As checkpoint — 2026-10-20

Base: 3884f4bc573baf8552112fb927a3145b69c5d83b; GitHub Issue #139.
The owner explicitly requested moving the remaining build/acceptance to one
Reader-only CI after initially choosing local-first. This supersedes the
earlier requirement to finish local native PDF acceptance before push.

## Evidence and changes

Latest failed Reader CI when checked: #13, run 39373383738, SHA 4561c33.
Its exact job log was read once: ENOENT for the requested working-copy.pdf.
The helper reported submission while the native dialog kept its default name.

- Keep 3884f4b's real keyboard path and exact-file-existence acceptance.
- Require both modal foreground and filename Edit focus before sending keys.
- Share keyboard escaping/input between smoke and installed acceptance.
- Replace the obsolete synthetic test calling removed ReaderWindows.SaveAs
  with actual GetSaveFileNameW path selection and cancellation.
- OPENFILENAME uses a managed lifetime for an allocated UTF-16 buffer;
  thread failures are reported, avoiding the initial fixture marshaling crash.
- Reject non-input desktops before starting the focused dialog smoke.
- Add a focused portable-EXE local acceptance harness and PID/path-restricted
  helper. These are not registered as extra CI jobs and remain unexecuted
  against the application. They never install, change associations/policies,
  terminate owner Reader processes or spoof GITHUB_ACTIONS.

All application/Toolbox/main/stable/logo/Quick Sign source is unchanged.

## Verified local results

- Owner executed the real dialog smoke on Windows Default desktop:
  ASCII filename PASS; Vietnamese filename with + ^ % ~ { } [ ] PASS;
  Cancel PASS. The redirected console replaces Vietnamese glyphs with ?;
  the script compares the actual Unicode strings before emitting PASS.
- Local log SHA256:
  b9acd75439cd7ce7a50287f464b8fce8301244070517ca378d1c361967f0c4b6
- Node 10/10 PASS; full browser suite 28/28 PASS (1.3 min).
- Reader package/CSP/no-engine contract, script syntax and diff checks PASS.
- Rust native unit tests 4/4 PASS in release, reader-only profile.
- Local Reader-only release build PASS (39.02 sec after shared dependency
  compilation). Rust 1.99.1, MSVC 14.44.35207, Windows SDK 10.0.26100.0.
- Local native PDF/form/working-copy/source-byte acceptance has NOT run.

## Tooling / preserved local state

Rust/Cargo installed in work/tooling/native-build without changing system PATH.
Owner installed signed Microsoft Build Tools 2022 successfully (exit 0).
Cargo.lock was absent in the repo; generated a local lock from cached index.
461 official crates were downloaded with verified SHA256 matching that lock,
then compilation ran offline. No TLS verification was disabled.
Local Cargo.lock, generated Tauri schemas/icon and build artifacts are not
part of this commit; do not discard them or other uncommitted files.

Unified exec currently fails with helper_unknown_error: setup refresh had
errors. The approved Node execution tool can read/write the workspace and
run the compiler. Shell GUI runs on CodexSandboxDesktop while owner input
desktop is Default; don't pretend background focus tests prove user UI.

## CI / next milestone

Push one batch on feat/windows-reader-fast-saveas-native. Existing workflow
branch filters run Windows Reader CI only; no PR/full Desktop/Toolbox build.
Keep native gates: exact output PDF path, Nguyen Van An Unicode form value,
Ctrl+S updating only chosen working copy, original bytes unchanged, dialog
cancellation and installer/uninstaller cleanup. No weakened assertions.

After dispatch, stop costly polling. On continuation refresh repository-wide
Actions and exact HEAD. If failed, read that job's actual log once and use its
diagnostic artifact if needed. Do not call Save As fixed before exact-head
native acceptance PASS. After PASS continue the lean Rune-like Reader work;
do not merge optional lazy-fontkit changes or touch main/stable automatically.
