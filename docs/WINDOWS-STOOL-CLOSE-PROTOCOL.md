# Installed sTool close protocol — 2026-10-21

Installer #3 (39566911487, b196207) diagnostics prove all five functional engine cases reached the shutdown stage; the actual failure is JSON.parse on an empty Close helper reply. Raw job119111260893 was already read before this task; used durable artifact12331702749 to confirm.

Close now returns an explicit JSON acknowledgement only when Process.CloseMainWindow returns true. This means a close request was sent, not that shutdown succeeded. JavaScript rejects empty/malformed JSON, wrong-owner replies and false acknowledgement, then separately requires exit code0 and zero previously owned descendant PIDs within20seconds. Census errors and nonzero exits fail. Failure-only taskkill is unchanged and cannot produce PASS. All OCR/tokenization, signing/PDF-A, source hashes and NSIS uninstall/orphan gates are retained.

Local Windows regression:14/14 Node tests PASS, including executing the actual PowerShell close function with deterministic success/refusal owners, empty protocol replies, still-living parent/child, abnormal exit, successful delayed child exit and census failure. PowerShell parser, installed JS syntax and workflow isolation PASS. This is not a claim of real installed-app acceptance; run Fast CI, then exactly one Installer milestone on the same verified commit.
