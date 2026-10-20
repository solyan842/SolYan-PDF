# sReader — Recent Files + Session Restore (Windows only)

Scope: standalone Windows sReader on the feature branch derived from Reader CI #31 PASS at `d73063d5335a50763d2f34af98fb80eabeaceb61`. Source of truth remains the exact new HEAD/Reader CI; main/stable and sTool remain unchanged.

## Behavior
- Recent PDFs appears in the hamburger menu. It lists up to 20 previously opened native PDFs with original paths and the last page. Missing/deleted/moved files remain identifiable but their Open button is disabled. Clear History wipes the list without deleting PDFs or their current tabs.
- On a clean sReader startup **without an Explorer/Open With PDF argument**, the most recent session of up to 12 native-file tabs is restored in tab order, with active tab, page, PDF zoom and scroll offsets. User-provided Explorer/Open With arguments take precedence over automatic session restoration; existing single-instance forwarding is unchanged.
- Closing a tab removes it from the *restorable session* but keeps it in Recent until history is cleared. Closing all tabs persists an empty restorable session. Browser-only PDF preview uploads are not treated as native paths or persisted in Recents.
- If source files have moved or disappeared, restoration skips them and reports the number skipped; the remaining documents still reopen. A PDF reopened from Recent follows the same native one-shot ticket queue and duplicate-tab focus logic as Explorer and the native file picker.
- Document contents, signatures, form edits and uncommitted annotations are **not** checkpointed. On ordinary Reader caption close, existing dirty-document confirmation still protects unsaved edits and session state is flushed before shutdown. After a crash, session restoration reopens original PDFs, not an unsaved working copy. Original PDF files are never modified by session history.

## Security and persistence
- Only the Reader WebView window can invoke the new Tauri commands. JS receives immutable source IDs via existing OS-granted file-open tickets. Native session writes validate IDs against the in-memory canonical OS-open source map; no command takes an arbitrary user-supplied filesystem path for opening or restoring.
- Native reads re-enter the existing canonicalizing, 200 MB-capped, one-shot grant queue. Transfer-inbox temporary PDFs are excluded from persistent session storage.
- The Reader stores UTF-8 paths (hex-encoded for a strict line format), bounded page/zoom/scroll metadata and recent ordering in the application user profile via Tauri's `app_data_dir`; no source paths or PDF bytes are stored in web localStorage. Files are written using a sync + atomic replace on Windows. Broken/oversize storage is treated as an empty session, never interpreted as executable content.
- History is private user-local application data, with a Clear History control. App uninstall may retain user-profile data according to Windows installer settings.

## Validation
- Rust unit tests: Unicode paths, atomic roundtrip, page/scale bounds, duplicate suppression, missing-file identification, corrupted store and durable Clear History.
- Playwright browser tests: real Reader UI with a mocked restricted ticket bridge, startup restore and reload, active tab/page/zoom, missing file and disabled Recent, closing the last tab, reopen from history, text-only treatment of untrusted filenames and Clear History.
- **Mandatory actual installed Windows acceptance:** launch sReader with PDF A and early PDF B, navigate and zoom, close gracefully, restart the real EXE with no arguments and restore both tabs/active/page/zoom. Then remove B from the synthetic fixture and restart: only A restores, and missing B is disabled in Recent. All existing single-instance, Save/Save As, fonts, UI, F11, uninstall/orphan tests stay enabled.
- Do not claim release-ready until this exact-head Reader CI completes green and owner Windows field QA checks real file associations, crashes, sleep/wake and private-document usability. No sTool/Toolbox build is needed.
