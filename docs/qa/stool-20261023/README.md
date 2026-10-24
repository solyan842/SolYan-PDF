# Local engine acceptance — 2026-10-23

Supersedes the missing-runtime/signing blockers in WINDOWS-STOOL-LOCAL-BATCH-20261023.md.

Actual Windows source-engine checks now PASS: Office RTF -> PDF (25974 bytes and expected text); Paddle OCR (SOL YAN OCR TEST 12345, fallback_used=false, models initially unloaded); internal PDF/A (4517 bytes with Metadata/OutputIntents); signing/validation (cryptographically valid, self-signed certificate untrusted, network fetching disabled). Public fixtures preserved. JSON reports are attached here. These are production source/real-engine checks, not installed or native UI acceptance.

Existing TXT/CBZ workflow gates also passed locally, including encrypted password handling. Do not repeat completed engine conversion cases without relevant changes.

A current-source native application was compiled locally in 34.22 seconds using the cached Rust toolchain, with resource bundling disabled. Binary size 13314048 bytes; no model staging or NSIS build. Location: work/stool-native-demo-20261023/solyan-pdf-desktop.exe. Remaining: reuse already-installed frozen sidecars in that isolated demo folder, then test current native UI outputs/lifecycle. The restricted agent still cannot read the Administrator-created dependency folders or existing installed application, even after filesystem read permission was requested; the prepared STAGE-LOCAL-DEMO.ps1 copies existing runtimes and restores task-folder inheritance outside that restriction. No global ACL or antivirus change, no downloads.

No new GitHub CI or installer build was launched. Reader/main/stable untouched. Source-engine PASS must not be reported as finished demo/release acceptance.

## Native UI checkpoint — 2026-10-24

See native-ui-progress.json. Current native app with reused frozen sidecars passed actual Windows selection, conversion, Save and readback for TXT, CBZ, Paddle OCR TXT, Office RTF-to-PDF and signing. Public source hashes are unchanged. The signed output has one intact cryptographically valid signature; the synthetic self-signed certificate remains untrusted. Offline readback used explicit empty trust roots because the restricted agent cannot read the Windows certificate store.

PDF/A conversion reported success in the UI, but the session ended before Save. On continuation the old window and engine processes were absent; this does not prove normal-close cleanup. The new demo window exists but Windows capture is black and activation fails after one recovery. Await a visible/unlocked desktop to finish PDF/A Save/readback and normal-close process cleanup. No code changes, new downloads, installer build or CI run were made for this checkpoint. Do not repeat the five completed native conversion/Save cases. Do not claim installer or full release acceptance.

## Resolved desktop continuation — 2026-10-24

The user reopened the Windows desktop. PDF/A conversion and native Windows Save now PASS: native-pdfa-output.pdf is 4517 bytes, one page with Metadata/OutputIntents; source SHA-256 unchanged. This is the existing structural gate, not an external conformance certification. Normal title-bar Close PASS for the Core/archive process pairs active in this session (31016, 46856, 39740, 41944), with zero remaining and no forced termination. See native-pdfa-report.json and native-close-report.json. The capture/activation blocker above is resolved.

Six recorded native happy paths now PASS with output readback: TXT, CBZ, OCR TXT, Office PDF, signed PDF and PDF/A. This is a current-source debug application using existing frozen sidecars, not install/uninstall acceptance or the complete simultaneous-five-engine/failure-recovery matrix. The normal-close result covers Core/archive in this session only. No product code changed after Fast CI #19. One packaging-only installer candidate is ready to be built from this checkpoint; its checksum/source manifest must remain explicitly unaccepted until installer acceptance. Do not repeat completed conversion tests as part of packaging.
