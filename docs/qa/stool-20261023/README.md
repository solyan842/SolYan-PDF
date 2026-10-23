# Local engine acceptance — 2026-10-23

Supersedes the missing-runtime/signing blockers in WINDOWS-STOOL-LOCAL-BATCH-20261023.md.

Actual Windows source-engine checks now PASS: Office RTF -> PDF (25974 bytes and expected text); Paddle OCR (SOL YAN OCR TEST 12345, fallback_used=false, models initially unloaded); internal PDF/A (4517 bytes with Metadata/OutputIntents); signing/validation (cryptographically valid, self-signed certificate untrusted, network fetching disabled). Public fixtures preserved. JSON reports are attached here. These are production source/real-engine checks, not installed or native UI acceptance.

Existing TXT/CBZ workflow gates also passed locally, including encrypted password handling. Do not repeat completed engine conversion cases without relevant changes.

A current-source native application was compiled locally in 34.22 seconds using the cached Rust toolchain, with resource bundling disabled. Binary size 13314048 bytes; no model staging or NSIS build. Location: work/stool-native-demo-20261023/solyan-pdf-desktop.exe. Remaining: reuse already-installed frozen sidecars in that isolated demo folder, then test current native UI outputs/lifecycle. The restricted agent still cannot read the Administrator-created dependency folders or existing installed application, even after filesystem read permission was requested; the prepared STAGE-LOCAL-DEMO.ps1 copies existing runtimes and restores task-folder inheritance outside that restriction. No global ACL or antivirus change, no downloads.

No new GitHub CI or installer build was launched. Reader/main/stable untouched. Source-engine PASS must not be reported as finished demo/release acceptance.
