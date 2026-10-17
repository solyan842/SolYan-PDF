from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import uvicorn


def _configure_native_runtime() -> None:
    binary = os.getenv("SOLYAN_TESSERACT_BINARY", "").strip()
    if binary:
        binary_path = Path(binary).resolve()
        if not binary_path.is_file():
            raise SystemExit(f"SOLYAN_TESSERACT_BINARY does not exist: {binary_path}")
        current_path = os.environ.get("PATH", "")
        os.environ["PATH"] = f"{binary_path.parent}{os.pathsep}{current_path}"

    tessdata = os.getenv("TESSDATA_PREFIX", "").strip()
    if tessdata:
        tessdata_path = Path(tessdata).resolve()
        if not tessdata_path.is_dir():
            raise SystemExit(f"TESSDATA_PREFIX does not exist: {tessdata_path}")
        os.environ["TESSDATA_PREFIX"] = str(tessdata_path)

    # Avoid an unnecessary network source probe before a local Paddle model is
    # requested. D4B will pin explicit local model directories for full offline
    # inference; D4A only proves the Windows runtime can package and start.
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


def _bootstrap_ocr_service() -> object:
    root = Path(__file__).resolve().parents[2]
    service_root = root / "engines" / "ocr-service"
    if service_root.is_dir():
        sys.path.insert(0, str(service_root))
    from app.main import app  # type: ignore

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="SolYan PDF local OCR sidecar")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    if args.port < 1 or args.port > 65535:
        raise SystemExit("invalid --port")

    _configure_native_runtime()
    app = _bootstrap_ocr_service()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        log_level="warning",
        access_log=False,
        server_header=False,
    )


if __name__ == "__main__":
    main()
