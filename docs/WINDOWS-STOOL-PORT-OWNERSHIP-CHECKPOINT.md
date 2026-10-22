# sTool endpoint ownership + frozen-engine acceptance — #144/#145

Branch: feat/windows-stool-health-recovery
Parent: 45d55d0aa19b05c0a95c8d0ef420c472dbbbf6cc
Windows sTool Fast CI #10 SUCCESS:
https://github.com/solyan842/SolYan-PDF/actions/runs/39748693255

Reader is frozen separately at stable/sreader-20261021,
7ef07ed1fd310c229126909c44875f9e7774807f, owner tested OK.
No Reader/main/stable code changes in this batch.

## Evidence and reuse

The old startup health paths connected to a released/planned port and sent
credentials before checking who owned the socket. PID liveness or a 200 body
cannot establish that the process is the intended engine.

Reuse Microsoft's existing TCP endpoint/PID table and existing Windows Job
Objects, exposed by the already used windows-sys crate. Only two feature
flags are added; no proxy, port allocator or process-management replacement.
Primary references:
- https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable
- https://learn.microsoft.com/en-us/windows/win32/api/tcpmib/ns-tcpmib-mib_tcprow_owner_pid
- https://learn.microsoft.com/en-us/windows/win32/api/jobapi/nf-jobapi-isprocessinjob

## Implementation

For each connected IPv4 loopback socket, query the server side's exact
established four-tuple (both addresses and ports), then use IsProcessInJob
against that engine's Job Object. Match the accepted connection, not merely
the listening port, a process name or a trusted-looking health response.
Win32 table/handle/query errors fail closed. Brief bounded retries only cover
an established row not yet visible in the OS table.

All five startup health paths and all reuse checks verify ownership BEFORE
writing the health request/token. A foreign port is rejected with a scoped
error; its process is never terminated by this check. Job descendants are
accepted for PyInstaller's launcher/worker architecture.

The installed harness now has a disposable-runner-only Freeze injection.
It validates the app PID/executable, descendant membership, exact service
executable name and install-root path. Native OpenThread/GetProcessIdOfThread/
SuspendThread affect only the verified service processes; injection failures
resume previously suspended threads. Successful injection proves PIDs remain
alive. Existing failure-only app cleanup still removes test-owned processes.

Five new installed flows freeze Core/Office/OCR/sign/archive separately, then
invoke the actual tool, validate a new PDF/OCR result, require the old PIDs gone,
one replacement root, and unchanged roots for unrelated engines. Original
crash, concurrent reuse, malformed-input, source SHA256, crypto signing,
PDF/A, no-sidecar Home, uninstall and orphan gates remain enabled.

## Local validation on final source

- 10/10 native Rust tests PASS on Windows.
- Includes real socket/PID/Job Object queries, direct and descendant Python
  servers, invalid jobs, and foreign ports receiving ZERO request/token bytes
  in reuse plus all five startup paths.
- Existing bounded-health and live/unresponsive process retirement tests pass.
- 15/15 Node contract/close/freeze tests PASS.
- Freeze test executes the production native C# method on a test-owned ping
  process, verifies it remains alive, then verifies termination cleanup.
- Installed JS syntax, PowerShell parse and parsed YAML lane isolation PASS.
- No models, engines or NSIS were staged for these local/fast checks.

## Boundary and next step

Run ONE exact-head sTool Fast CI now. After PASS, create one deliberate
build/windows-stool-demo-* integration milestone at that SAME source SHA to
run the heavy installed acceptance, including the new five-engine Freeze cases.

Do not claim installed Freeze PASS from local unit tests. The last accepted
installer remains #4/b6778f8 until the new milestone passes.

This guard covers native health handshakes at startup/reuse. It is not a
security guarantee for every later renderer HTTP connection after a session
is returned, or against an already compromised process in the same job.
Released-port allocation can still encounter a collision; it now fails closed
on the health connection rather than trusting the foreign listener.
Existing longer first-start readiness budgets are unchanged.
