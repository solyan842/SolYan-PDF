# Installed Core CORS repair — issue #144 / #145

Actual failing installer #1: run `39552910841`, job `119065930183`, code
`5f9c430911004d46fee0ae8094e2cd2cd5caa9cc`. Raw job log read once; artifact
`12326255431` inspected. NSIS built (884,519,342 bytes / 843.54 MiB), installation
and zero-engine Home succeeded. First compression produced no download;
failure.png shows `Không thể xử lý PDF: Failed to fetch`.

The real runner composition wrapped FastAPI/CORS inside DesktopTokenMiddleware.
Browser OPTIONS preflight advertises the token header name but cannot carry its
value. Authentication therefore rejected preflight with 401 before CORS ran.
Even missing-token 401 responses lacked CORS headers and were unreadable by UI.

Five unit tests invoke runner.main with a tiny real FastAPI backend and capture
the actual composed ASGI app passed to uvicorn (no fake process startup). On
the unmodified runner, preflight and readable-401 tests FAIL. After the repair,
all five PASS: approved preflight, authenticated output, missing/wrong token
401, rejected foreign origin and plain OPTIONS remaining protected.

Reuse standard Starlette CORSMiddleware as the outer desktop-only wrapper.
Every actual API request still passes through the unchanged token validator;
no origin wildcard or token bypass. The normal web backend and Rust lifecycle
are unchanged. Runtime repair is a separate commit from installer scaffolding.
Only exact-head installed Windows acceptance can establish the final fix.

Local Python TLS downloads were reset on this PC. Test wheels were fetched
from official PyPI over Node HTTPS and individually verified against PyPI
SHA-256, then installed offline into a workspace-only test target. No TLS,
antivirus or system Python setting was disabled or changed.
