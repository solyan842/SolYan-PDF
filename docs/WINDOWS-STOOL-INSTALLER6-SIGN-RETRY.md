# Installer #6 — signing retry test correction

Branch: feat/windows-stool-health-recovery
Parent: 5f532d38da8da706e74a96121416bc0332c2b890 (Fast CI #12 SUCCESS)
Run: https://github.com/solyan842/SolYan-PDF/actions/runs/39762377218
Job: 119769442595; raw log read once.
Durable diagnostics: artifact 12420024449, stool-native/report.json.

## Verified outcome and root cause

Installer #6 built NSIS successfully. Installed acceptance passed Core, Office
and OCR live-frozen recovery. In particular, the #5 OCR recovery failure did
not recur: frozen OCR PIDs 5092/6436 were replaced by 6316 with real OCR text.
Initial PKCS12 signing and wrong-password/crash retry also passed.

The next frozen-signing test timed out at installed.mjs:131 awaiting download.
The recorded toolStatus is:
`Không thể xử lý: Không đọc được PKCS#12 hoặc mật khẩu không đúng`.
Production sign.js intentionally clears certPassword in finally after every
attempt, as sign.html explicitly tells the user. The harness reused the form
after its successful first signature without re-entering the fixture password.
This is a test precondition error, not evidence of a signing engine failure.
Do not retain a user's password or modify signing runtime to satisfy the test.

## Narrow correction

- Assert that the first signature cleared the password; re-enter the public
  CI fixture passphrase before the frozen-signing invocation; assert clearing
  again after the result. Keep real signed-PDF output validation.
- Factor the existing download/error race into tool-download.mjs and use it
  for signing too, so visible tool errors fail immediately with their text.
  Download failure and actual saveAs remain required.
- Add sign-retry.browser.mjs: execute the real sign.html/sign.js with a mocked
  local transport, verify wrong-password error reporting, clearing after all
  attempts, explicit re-entry and two distinct saved outputs. This is a UI/
  driver regression, not a cryptographic or frozen-engine acceptance result.

No application/Rust/engine/icon/Reader/workflow modifications in this batch.
Fast CI still downloads no browser, models or heavy runtime. The focused
browser regression can use an already installed Playwright Chromium:
`node desktop/stool-tests/sign-retry.browser.mjs`.

## Validation and remaining work

Local: focused real UI/mock transport regression PASS; 15 Node contracts/
native close/freeze tests PASS; installed JS syntax and lane isolation PASS.
Rust is unchanged from the 11-test Windows suite passing on #12.

Run one Fast CI for this correction. After PASS, a deliberate installer
milestone must rerun frozen signing, archive/PDF-A, source hashes, normal
shutdown, D6 crypto validation, uninstall and orphan checks. #6 stopped before
these remaining gates; do not call the installer accepted or #144/#145 done.

Next product work after installer acceptance remains native sTool output Save
(actual Windows dialog/path/Cancel/overwrite and original preservation), then
tool catalog #136. Reader QR fix stays separately checkpointed at 9e69bc5;
stable Reader/main remain untouched. Stop polling while Windows CI runs.
