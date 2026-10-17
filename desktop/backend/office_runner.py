from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn


def _bootstrap_office_service() -> object:
    root = Path(__file__).resolve().parents[2]
    service_root = root / "engines" / "office-service"
    if service_root.is_dir():
        sys.path.insert(0, str(service_root))
    from app.main import app  # type: ignore

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="SolYan PDF local Office sidecar")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    if args.port < 1 or args.port > 65535:
        raise SystemExit("invalid --port")
    app = _bootstrap_office_service()
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
