# sTool Installer #5 — integration wait checkpoint (2026-10-22)

Source SHA: 92128be6ca1c092fa551953e3d635959d7c35f63
Feature branch: feat/windows-stool-health-recovery
Build milestone: build/windows-stool-demo-20261022-health
Fast CI #11: SUCCESS
https://github.com/solyan842/SolYan-PDF/actions/runs/39752463488

Windows sTool Installer #5: IN PROGRESS at checkpoint
https://github.com/solyan842/SolYan-PDF/actions/runs/39754231053

The build branch was re-fetched and points to exactly the Fast-CI-tested SHA.
No source changes were made after Fast CI PASS. One installer run was launched;
do not dispatch another while this run is active.

## Installed gates in this source

All prior zero-engine Home, real PDF/Office/OCR/sign/PDF-A output, concurrent
reuse, process crash recovery, original-source hashes, cryptographic checks,
NSIS uninstall and orphan-process assertions remain.

New live-frozen recovery exercises Core/Office/OCR/sign/archive separately:
prove target PIDs remain alive while suspended; real tool invocation must
produce validated output; old PIDs must disappear; exactly one replacement
root remains; other engine roots retain their PIDs.

Native health connections now verify the exact established server endpoint's
PID is in the expected Windows Job Object before sending request bytes/token.
Fast CI and local real socket/Job Object tests passed. This is not yet evidence
that the new installed integration gate passed.

## Resume

1. Refresh repository-wide Actions and feature/build HEADs.
2. Read exact run #5 result above once complete.
3. If failure: identify failed job, read its actual raw log once, then diagnostics
   artifact if needed; fix only demonstrated cause.
4. If PASS: verify installer checksum/artifacts and provide the independent
   sTool Windows demo. Do not rebuild a successful source unnecessarily.

Reader stable is separately frozen at 7ef07ed1fd310c229126909c44875f9e7774807f
and was owner-tested OK. Do not merge Reader/sTool or touch main/stable.

This checkpoint branch contains documentation only and must not trigger
Reader, Fast CI, or a second installer.
