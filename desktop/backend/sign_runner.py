"""Windows-local pyHanko sidecar: reuse engines/sign-service with per-launch auth."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn


def _bootstrap_sign_service() -> object:
    root = Path(__file__).resolve().parents[2]
    service_root = root / "engines" / "sign-service"
    if service_root.is_dir():
        sys.path.insert(0, str(service_root))
    from app.main import app  # type: ignore

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="SolYan PDF local signing sidecar")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    if not (1024 <= args.port <= 65535):
        raise SystemExit("--port must be between 1024 and 65535")
    if len(args.token) < 32:
        raise SystemExit("--token must contain at least 32 characters")

    from desktop.backend.runner import DesktopTokenMiddleware

    app = DesktopTokenMiddleware(_bootstrap_sign_service(), args.token)
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
