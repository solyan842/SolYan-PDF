# Reader session restoration checkpoint — 2026-10-21

Base: `66b9bfaf5fc942019ae3e214554b28c2e07f0d0c`, Reader CI #33,
run `39470025941`, failed job `118791334264`. Repository-wide Actions
also contain newer sTool-only failures; those are outside this Reader task.

The raw job log was read once. Its sole browser failure was
`reader-session.spec.mjs:82`: restored inactive A expected page 3, received 1
(37 other browser tests passed). The base failure was reproduced locally,
including premature persistence of page 1 while restoring tabs.

The session controller now waits until startup has finished selecting the
final active tab before applying restoration. It snapshots a visible tab
before `hidden` resets its DOM scroll offsets, preserves that snapshot in
background session writes, and reapplies it when the tab becomes active.
Old page >1 records with a zero scroll offset retain PDF.js's requested-page
position rather than jumping back to page 1.

The regression now requires a nonzero stored offset for inactive page 3 and
checks switching away and back after reload. Its previously unreachable
Recent reopen assertion expected page 1 despite existing fingerprint-based
bookmark resume; it now checks page 3 and actual page-3 text. Bookmark resume
is established behavior and remains covered by its independent tests.

Local Windows validation: 16/16 Node tests, Reader package/CSP/no-engine
contract PASS, 38/38 Playwright tests PASS; the session regression also passed
three consecutive repetitions. This is browser acceptance,
not proof that the installed native Windows session acceptance has passed.

Next: one Reader-only CI for this coherent batch, retaining installed-EXE
session restart/missing-file acceptance and all Save As/native/installer gates.
Checkpoint and stop while CI runs; inspect exact-head outcome on continuation.
No Toolbox build, main/stable edit, release or owner installation change.
Local untracked Cargo.lock, generated Tauri files and icon.ico were preserved.

