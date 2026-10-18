"""Frozen Windows PDF/A sidecar; reuses the archive-service app and OCRmyPDF API."""
from __future__ import annotations

import argparse
import multiprocessing
import os
import sys
from pathlib import Path

import uvicorn


def _bootstrap_archive_service() -> object:
    root = Path(__file__).resolve().parents[2]
    service_root = root / "engines" / "archive-service"
    if service_root.is_dir():
        sys.path.insert(0, str(service_root))
    from app.main import app  # type: ignore
    return app


def _pdfa_worker(argv: list[str]) -> int:
    """Child mode preserves subprocess timeout in the service when frozen."""
    parser = argparse.ArgumentParser(description="Internal PDF/A conversion process")
    parser.add_argument("input_pdf")
    parser.add_argument("output_pdf")
    args = parser.parse_args(argv)

    import ocrmypdf
    from ocrmypdf import OcrOptions

    options = OcrOptions(
        input_file=args.input_pdf,
        output_file=args.output_pdf,
        mode="skip",
        ocr_engine="none",
        output_type="pdfa",
        pdfa_backend="internal",
        rasterizer="pypdfium",
        optimize=0,
        fast_web_view=999999,
        jobs=1,
        use_threads=True,
    )
    code = ocrmypdf.ocr(options)
    return int(code)


def main() -> None:
    multiprocessing.freeze_support()
    if len(sys.argv) > 1 and sys.argv[1] == "--pdfa-worker":
        raise SystemExit(_pdfa_worker(sys.argv[2:]))
    parser = argparse.ArgumentParser(description="SolYan PDF local archive sidecar")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise SystemExit("Invalid --port")
    if len(args.token) < 32:
        raise SystemExit("--token must contain at least 32 characters")

    # No PATH-based Python, Ghostscript fallback, or public listener.
    if getattr(sys, "frozen", False):
        os.environ["SOLYAN_ARCHIVE_WORKER_EXE"] = sys.executable
    from desktop.backend.runner import DesktopTokenMiddleware

    app = DesktopTokenMiddleware(_bootstrap_archive_service(), args.token)
    uvicorn.run(app, host="127.0.0.1", port=args.port,
                log_level="warning", access_log=False, server_header=False)


if __name__ == "__main__":
    main()
