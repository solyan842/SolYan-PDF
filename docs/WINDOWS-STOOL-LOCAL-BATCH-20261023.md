# Local batch — 2026-10-23

Completed without GitHub builds:
- Poppler 26.09.0-0: downloaded, SHA256 matches repository pin, extracted.
- LibreOffice 26.8.1: 374870016 bytes downloaded; SHA256 matches repository pin.
- Existing PDF-to-text workflow gates: text, page range, layout, page breaks,
  encrypted input with correct password and wrong-password rejection: PASS.
- Existing CBZ workflow gates: 12-page order, ZIP/PNG content, range, 150/96 DPI,
  invalid-range rejection, encrypted input and wrong password: PASS.
- Recovered 33 Python packages from existing local wheels into a fresh readable
  directory. Core/sign imports PASS.

Not PASS / exact boundary:
- Old frozen signing binary cannot create SSL context in the restricted process.
- Production source signing creates a signed PDF, but /validate fails while
  oscrypto opens the Windows system certificate store: OSError Access is denied.
  No cryptographic/trust assertions were weakened. Source acceptance is FAIL.
- External taskkill cleanup is denied; the owned source process was stopped
  using exact-PID Stop-Process. No broad process killing was performed.
- pip downloads from files.pythonhosted.org are reset/closed; both normal and
  direct official index attempts failed. OCR/PDF-A dependencies remain missing.
- LibreOffice administrative extraction returns 1603; MSI log contains internal
  errors 2502/2503. It did not yield a runnable Office runtime.

CONTINUE-LOCAL-QA.ps1 is a thin outside-Codex batch using the pinned MSI,
original requirements files, original OCR/Tesseract/model staging scripts and
existing signing acceptance. It does not build NSIS or alter antivirus settings.
Run outside the restricted Codex process with Windows installer/certificate
access and working files.pythonhosted.org connectivity. Then resume native app
integration checks; do not repeat the completed TXT/CBZ conversion gates.

All files/logs are local under work/stool-runtime-20261023. No new CI launched.

