# Installer #5 OCR recovery failure — #144 / #145

Branch: feat/windows-stool-health-recovery
Parent: 92128be6ca1c092fa551953e3d635959d7c35f63
Failed run: https://github.com/solyan842/SolYan-PDF/actions/runs/39754231053
Fast CI #11 passed that parent; installer #5 did not pass acceptance.

## Evidence

Raw failed job 119742071224 was read once. It timed out waiting for the
OCR text after live Freeze injection. Durable artifact 12416499106 shows:
`OCR port is not owned by its managed Windows job` in failure.png.
NSIS packaging succeeded (884,299,656 bytes). Core and Office live-frozen
recovery passed; OCR initial recognition, concurrent reuse and crash retry
passed. Frozen OCR failed; later signing, PDF/A, close and uninstall gates
were not reached. Do not describe this installer as accepted.

The retirement path waited only for the launcher, then closed its Job Object
and immediately started a replacement on the same planned OCR port. It did
not wait for descendants or Windows endpoint teardown. Startup then rejected
a connection not owned by the replacement job.

A local Windows regression with a frozen Python descendant listener exposed
an additional timing boundary: even after explicit job termination and
ActiveProcesses == 0, immediate exclusive rebind failed with WSAEADDRINUSE
(10048). The test passed after waiting for exclusive port availability.
This confirms the lifecycle gap; the exact TCP owner PID in the failed CI
was not recorded, so do not claim that PID was directly observed.

## Narrow correction

- Retire only the existing engine job using TerminateJobObject, then query
  JobObjectBasicAccountingInformation until ActiveProcesses is zero (10s
  deadline). Retain the process slot/handle on failure; no replacement starts.
- Apply retirement even when the launcher has already exited: a descendant
  may still hold the engine endpoint.
- Before starting an engine, wait for exclusive loopback bindability (10s
  deadline). No credentials or requests are sent during this wait.
- Keep the existing exact-socket PID/job verification before health requests.
  The bind is released before launch, so ownership verification still guards
  the later allocation race. No foreign PID is killed.
- OCR acceptance now clears old text on every run, fails immediately on an
  actual tool error, and still checks the complete expected OCR content.
  Persist #status text in failure report.json as well as the screenshot.

Use existing Windows APIs and windows-sys; no new engine or dependency.
References:
- https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-terminatejobobject
- https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject

## Local verification

- 11/11 Rust Windows tests PASS. New native test suspends the owned descendant
  using the production Freeze implementation, tests both a live and an exited
  launcher, retires the job, and immediately rebinds after the production
  availability gate. An unrelated process remains alive.
- Existing owned/foreign socket tests and all five startup no-token-leak
  rejection tests remain enabled and pass.
- 15/15 Node lazy/icon/installer/close/freeze tests PASS.
- Installed JavaScript syntax and parsed workflow isolation PASS.
- No OCR model download, heavy installer build or Reader CI locally.

## Next gate / handoff

Run ONE sTool Fast CI for this exact source. On PASS, one deliberate installer
milestone must rerun all installed acceptance, D6 crypto/PDF-A and uninstall
gates. Local lifecycle tests do not prove installed PaddleOCR recovery PASS.
While CI runs, checkpoint and stop polling to conserve quota.

After installer acceptance, prioritize sTool native Save/output flow (actual
Windows Save As, selected path, Cancel, overwrite and source preservation)
before tool catalog #136. Existing Playwright Download.saveAs is not proof
of the user-facing Windows save dialog. Reader QR asset work is separately
checkpointed at 9e69bc51e7cd9c8300ff650b50f98f6fb42a1bb5; no Reader stable,
main, icon/UI or engine changes in this correction. Do not run Windows lanes
concurrently.
