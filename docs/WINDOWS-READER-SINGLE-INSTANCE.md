# Reader P1 — native single-instance and file activation
Date: 2026-10-19. Branch: `feat/windows-reader-fast-ci`.
Base HEAD: `a79eb6c622b14ab4418c04146b4ecd63cac96168` (docs-only successor of Reader CI #1 PASS at df272a2).

## Implementation

Only the Windows `reader-only` Cargo feature enables `tauri-plugin-single-instance =2.4.5`. It is registered before all other plugins and uses the existing distinct Reader identifier. Toolbox startup and its separate identity, engines, UI, signing and full Desktop release gate are retained.

The native side accepts PDF paths only from OS startup argv, a forwarded process's argv/cwd, the Windows file picker, or a native window drop. It canonicalizes paths, normalizes Windows case for the session key, and keeps at most 32 outstanding requests. Same pending path is collapsed; different canonical paths remain separate even with the same basename. The UI focuses an existing document by canonical source key and does not re-read it, preserving dirty edits, selection, page, scroll and zoom.

Native requests remain queued until the WebView subscribes, then drains. The event is only a notification; it never carries document bytes. Native reads require a single-use ticket minted by the native queue; JS cannot supply arbitrary paths. Reads check the 200 MB input bound before and during reading. Individual invalid files report an error and do not stop subsequent requests. Initial argv can contain several PDFs. The old one-shot `reader_initial_file` bridge is replaced by the queued ticket bridge.

The Open button / Ctrl+O uses the existing Win32 common-dialog API family, including multi-selection and cancel. This gives chosen files the same canonical identity as Explorer files. Standalone Reader now uses native file-drop events for the same reason; browser preview and bundled Tools Reader retain their existing HTML drop fallback. No path is persisted to localStorage. Original PDF bytes, Quick Sign placement/export and annotation code are unchanged.

## OSS choice / sources

- Chosen: [Tauri official single-instance plugin](https://v2.tauri.app/plugin/single-instance/), Apache-2.0 OR MIT, exact [2.4.5 source](https://github.com/tauri-apps/plugins-workspace/tree/single-instance-v2.4.5/plugins/single-instance). It already forwards Windows argv/cwd and includes the Windows foreground-rights fix. The pinned tag declares Rust 1.77.2; CI uses current stable, as before. Newer website MSRV guidance is not a claim about this exact pin.
- A handwritten Win32 mutex/WM_COPYDATA engine could provide the same behavior, but would duplicate a maintained implementation and add parsing/focus/startup races. Rejected; only the application queue/authorization adapter is custom.
- A URI/deep-link handler would add protocol registration and still need single-instance coordination for ordinary PDF associations. It cannot replace this layer and is unnecessary here.
- Real WebView2 acceptance follows the supported [Playwright WebView2 CDP approach](https://playwright.dev/docs/webview2). Debugging is enabled only for the test Reader on the disposable runner, using child environment or scoped per-app HKLM policy when elevated, bound to loopback; production config has no new debug endpoint or test RPC.

## Test layers and evidence

LOCAL PASS before push:

- 15 Playwright browser scenarios (37.4 s): the original 11 remain; four new scenarios cover pre-listener queueing, duplicate focus without another read, distinct same-basename files, dirty/page/scroll/zoom/selection preservation, invalid-file continuation, and chosen/cancelled native-open bridge requests.
- All 6 Reader Node tests, 5 Toolbox icon tests and UI/CSP contract; package/asset contract; actionlint 1.7.7.
- New PowerShell helpers and all five workflow run blocks parse; the C# Win32 helper compiles locally. JS syntax checks and git diff --check pass.

ADDED, NOT RUN LOCALLY (no Rust toolchain / installed test app on this PC):

- Native Rust queue tests: canonical paths/case aliases, same basenames in different directories, one-shot authorization, relative cwd, invalid requests, bounded queue/grants.
- Installed Windows acceptance in the existing Reader-only workflow. The test starts the actual installed EXE with synthetic PDF A, launches EXE B, inspects real WebView2 tabs/text and actual Win32 PIDs/HWNDs, and checks one persistent process/window. It verifies uppercase/Unicode paths, duplicate focus, original dirty state/geometry/scroll, cancelled dirty close, two different same-basename files, minimized restore/foreground, malformed-plus-valid argv, native open-dialog cancellation, clean close/reopen, restart and early second launch.
- The test exercises the installed Reader PDF Open With registration through ShellExecuteEx with its explicit registered class. It does not change Windows' chosen default PDF app. A real Explorer GUI double-click on Windows 10/11 remains manual release QA, not a claim from a Chromium mock.
- Native tests capture the Reader process tree and assert no surviving descendants after cleanup, then the smoke script uninstalls Reader. It still rejects engine resources/sidecars. Always-upload diagnostics preserve real failure codes, logs, report and screenshots. WebView profile folders are never uploaded.

CI result is pending at this checkpoint. Do not call P1 verified until the new exact-head native unit/build/installed acceptance passes. A browser mock, C# compilation, or the previous Reader CI #1 cannot prove the new native implementation.

## Continuation / boundaries

Push this coherent batch once to the existing Reader-only branch trigger; no new PR and no full Toolbox build. Refresh repository-wide Actions once to identify the exact new run, then stop agent work during CI. On next continuation, refresh GitHub HEAD + repository-wide Actions; on failure read the exact failed raw job log once and use artifact fallback if needed. Fix the observed cause without weakening tests.

After P1 native CI PASS: P2 actual compact Rune UI and running screenshots at the requested sizes for owner visual acceptance, then P3 F5 presentation, then P4 Print/AcroForms/native Unicode text/properties/recents/document handoff and final integration QA. Do not stop for routine confirmation.

Remaining QA boundaries: Windows 10/11 human Explorer/default-app experience; actual multi-file picker selection and native drag gesture; UNC access where available; protected-PDF prompt behavior with real documents; full Toolbox compatibility at a deliberate integration gate. No UI redesign, F5, Print or AcroForm completion is claimed by this batch. No main/stable merge, public release, paid API, private PDF or signature-profile upload.

## Reader CI #2 failure / transport repair checkpoint

Exact application commit: `91de30a470bbfdde9d21ec461c9398e651dcfc91`. [Reader CI #2](https://github.com/solyan842/SolYan-PDF/actions/runs/39209528697) passed all 15 Playwright scenarios, 6 Node tests, 3 Rust queue tests and NSIS packaging. Installed acceptance failed at the first CDP endpoint wait after 45 seconds, before tab assertions. P1 native acceptance therefore remains unverified.

The exact failed job log and diagnostic report show the unreachable debugger endpoint; they did not record runtime version or elevation. Microsoft documents that recent elevated WebView2 hosts ignore environment/HKCU overrides ([Microsoft report](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645), [supported registry configuration](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl?view=webview2-1.0.2151.40)). This is a transport compatibility repair, not a claim that CI #2 proved that specific runtime condition.

The test now records elevation and installed runtime versions. On elevated disposable Windows Actions runners it sets only Reader EXE/AUMID-specific HKLM AdditionalBrowserArguments/UserDataFolder values, refuses pre-existing values, reads writes back and records rollback data before changes. Medium-integrity runs retain child environment configuration. Cleanup removes only unchanged values written by the test, with installer-level recovery if Node exits unexpectedly. Recovery state and WebView profiles are excluded from uploaded artifacts. Failure diagnostics include Reader exit status, descendant WebView command lines and the last connection error. The 45-second deadline and all native assertions remain intact; production application code is unchanged.

Local validation: JS syntax, PowerShell parsing, C# window-helper compilation, non-Actions policy guard and git diff whitespace checks PASS. No local registry changes or native installed acceptance were performed. Push this repair once to the Reader-only branch, verify saved files/HEAD and identify its new workflow run, then rest while CI runs. The next continuation must inspect exact-head results before advancing to P2.