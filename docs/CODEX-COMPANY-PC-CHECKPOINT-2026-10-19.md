# Company PC continuation checkpoint — 2026-10-19

Active writer branch: `feat/windows-reader-r2-company-continuation`.
Base: `feat/windows-reader-r2` at `04a8f079453c55d427ab65666f1c82590db18246`.
Latest repository-wide CI before this change: Windows Desktop #138, run 39159517523, SUCCESS at bb56189f47f50525527a4d1de7bd3d6c8659546f.

## P0 bookmark lifecycle
- Call existing synchronous `flushBookmark(doc)` before closing a tab destroys its viewer/timer.
- Flush every open document in `beforeunload`, retaining the unsaved-edit confirmation.
- Two deterministic browser regressions change page and close/dispatch beforeunload in the same JavaScript task, before the 500 ms debounce can run; verify storage immediately and reopen the identical PDF at page 4.
- Both regressions failed against unchanged product code (missing stored record), then passed with the lifecycle calls. Existing debounce persistence test remains unchanged.

Local verification on this PC: Node v24.19.0; all 6 Reader Node tests, 11 Playwright scenarios, 5 Toolbox icon tests and UI/CSP contract PASS; git diff --check PASS. Chromium 145.0.7632.6. Playwright web-server cleanup stalled in this restricted shell after workers finished; stopping only its known server PID allowed the runner to exit 0 and report 11 passed. An earlier run interrupted by server shutdown is not counted as a product result.

No native UI QA or Windows release claim. The beforeunload regression dispatches the browser lifecycle event; real WebView2 window-close behavior still needs native QA.

## Next steps / CI wait
Open one draft PR targeting `feat/windows-reader-r2` to run existing Windows Desktop CI once. Do not push to main/stable or the home-PC branch. Re-fetch repository-wide Actions and this branch HEAD before interpreting results. If CI is running, stop agent work; inspect its exact result on continuation. On failure read actual logs once, then artifact fallback per AGENTS.md.

After exact-head CI PASS: continue P1 all-page/range Print using the existing PDF.js pipeline; then real AcroForm fill/save/history, current-document Reader/Tools handoff, and Windows release QA per the original handoff. These remain unfinished. Preserve Quick Sign, Toolbox, approved logos and all gates. No merge/public release is authorized by this checkpoint.

Environment: repository clone in work/SolYan-PDF; npm cache and Playwright browsers in work/. Git HTTPS uses command-scoped http.sslBackend=openssl because Windows schannel has no available credentials in this shell. No TLS verification was disabled. No private documents, signatures or credentials were added.
