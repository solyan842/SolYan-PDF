# sTool living-but-unresponsive recovery — issue #144

Base: b6778f868253362e79483ac1405c4e3b43612b1c, the independently accepted
sTool Installer #4 / Fast CI #9 source. Branch history and all 218 repository
branches were checked; the later Reader branch is not a sTool base.

## Reader owner approval and freeze

The owner reported Reader #42 tested OK and explicitly requested stable promotion.
stable/sreader-20261021 was fast-forwarded with an expected-SHA lease from
35c642ef1468e3448ac6620da4a573763d371dc4 to
7ef07ed1fd310c229126909c44875f9e7774807f, then re-fetched and verified.
This sTool branch does not contain or merge Reader implementation changes.
No main change, tag or public release.

## Confirmed gap

Existing managed_child_alive only calls Child::try_wait. A live process with
a stalled or unhealthy HTTP service was unconditionally reused, including the
cached Core session. This is the explicit living-but-unresponsive follow-up
in #144; existing dead-process recovery and Installer #4 are not rewritten.

## Reused components and narrow delta

Reuse existing loopback /health endpoints, engine identity markers, launch_lock,
spawn_blocking, per-session tokens and Windows Job Object ownership.
Add a bounded reuse probe (two seconds total, including slow/trickling reads;
16 KiB response ceiling, HTTP status-line and expected engine checks).
Startup keeps its existing longer engine-specific readiness budget.
The new probe is invoked only on tool execution/retry, never at Home.

A healthy owned child keeps its PID. If its reuse probe fails, retire/reap only
that managed child and drop its existing Job Object, then let the existing
start function supply the replacement. Missing/dead children do not contact a
stale port; Core without a valid cached session cannot be reused.
Errors remain scoped to the invoked tool. No global process kill, UI/icon
change, sidecar/model download or Reader build.

## Local evidence

- 7/7 real Rust tests PASS on Windows: authenticated matching health, error
  status/wrong engine, silent server deadline, trickling/oversized replies,
  healthy child PID reuse, unhealthy child retirement/replacement while an
  unrelated child stays alive, absent/exited child skips stale probing.
- 10/10 sTool lazy/icon/installer contracts PASS.
- 4/4 close-protocol tests PASS (including actual PowerShell helper execution).
- 5/5 production-composition Core CORS/auth tests PASS.
- UI/CSP contract and parsed YAML build-lane isolation PASS.
- Fast CI now runs these Rust tests as well as cargo check. Compile-only
  resources remain disposable; no NSIS or runtime downloads in Fast CI.

## Remaining acceptance and limits

This patch does not solve hostile port collisions or prove listener ownership.
Existing token health is not a claim of protection against a malicious process
that steals the released port; that remains a separate focused #144 task.
Two-second health availability is a retry heuristic, not a guarantee that an
engine will never pause under heavy load. Real installed frozen/stalled engine
acceptance and port-ownership tests remain necessary before another full
installer milestone. Do not call all of #144 complete from Fast CI.

After this coherent push, run only Windows sTool Fast CI once. On PASS continue
the port-ownership/integration test milestone; do not automatically rebuild the
heavy installer for this intermediate patch. Preserve every existing D6
signing, PDF/A, OCR, file-integrity, uninstall and orphan gate.
