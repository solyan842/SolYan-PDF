# SolYan PDF Windows D5 — PDF/A installer integration

Status: INTEGRATION PENDING EXACT-HEAD GATE. Branch:
`feat/windows-desktop-d5-pdfa-integration`.

Reuse the existing `engines/archive-service` with OCRmyPDF 17.13.0
`--pdfa-backend internal`, no Ghostscript fallback, and pikepdf PDF/A
validation. The Windows variant uses OCRmyPDF's supported Python API
(`OcrOptions`) from a frozen child mode because a PyInstaller executable
cannot run `sys.executable -m ocrmypdf`. The parent archive service
preserves its 240-second subprocess timeout and existing output/error API.
Unfrozen web deployments keep the original command unchanged.

The desktop package starts `solyan-archive.exe` on localhost only, protected
with a random per-launch token. It reuses the checksum-verified Tesseract
5.5.3 runtime from D4 (no duplicate executable in NSIS). Windows Job Object
ownership kills the sidecar on app exit. The core proxy forwards the token
only when `SOLYAN_ARCHIVE_TOKEN` is configured; web mode is unchanged.

Native proof on Windows runner:
- PDF/A direct API #2 PASS at commit `f44192f`.
- Real frozen executable PDF/A + HTTP-token smoke #3 PASS at `82988c8`.
- Signing desktop #127 PASS at `8b87a45`; signing runtime #2 PASS at `3c9a758`.

Gate **not accepted** until current branch's Windows Desktop CI passes:
(1) UI/CSP, (2) native resource staging and installer size,
(3) NSIS silent install/startup/shutdown for core, Office, OCR, signing,
and archive, (4) no orphaned processes,
(5) installed-signing test and installed-PDF/A real conversion.

PDF/A works for compatible PDFs; font and color constraints can require
conversion not supported by the internal backend. In that case the operation
MUST fail with an actionable error, not return a mislabeled plain PDF.
This proof is not a blanket conformance certification. User originals stay
local and untouched. Source PDF-to-Office 27/68 and D4 OCR gates stay locked.

Do not change main or release until an exact-head CI gate passes.
