from __future__ import annotations

import argparse
import os
import secrets
from collections.abc import Awaitable, Callable
from typing import Any

import uvicorn


class DesktopTokenMiddleware:
    """Require a per-launch token for every request to the desktop HTTP sidecar."""

    def __init__(self, app: Any, token: str) -> None:
        self.app = app
        self.token = token.encode("utf-8")

    async def __call__(self, scope: dict[str, Any], receive: Callable[..., Awaitable[Any]], send: Callable[..., Awaitable[Any]]) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        supplied = b""
        for name, value in scope.get("headers", []):
            if name.lower() == b"x-solyan-desktop-token":
                supplied = value
                break

        if not supplied or not secrets.compare_digest(supplied, self.token):
            body = b'{"detail":"Desktop session token is missing or invalid"}'
            await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]})
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SolYan PDF local desktop API sidecar")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--token", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not (1024 <= args.port <= 65535):
        raise SystemExit("--port must be between 1024 and 65535")
    if len(args.token) < 32:
        raise SystemExit("--token must contain at least 32 characters")

    # Tauri 2 production origin on Windows is http://tauri.localhost.
    # Keep the normal web backend default unchanged outside the desktop sidecar.
    os.environ.setdefault("SOLYAN_ALLOWED_ORIGINS", "http://tauri.localhost")
    # The desktop webview and the loopback API are different origins. Cloud
    # sessions use HttpOnly cookies, so allow credentialed CORS and SameSite=None
    # only for the isolated local desktop process.
    os.environ.setdefault("CLOUD_STORAGE_CALLBACK_BASE_URL", f"http://127.0.0.1:{args.port}")
    os.environ.setdefault("CLOUD_STORAGE_FRONTEND_BASE_URL", "http://tauri.localhost")
    os.environ.setdefault("CLOUD_STORAGE_COOKIE_SAMESITE", "none")
    os.environ.setdefault("CLOUD_STORAGE_COOKIE_SECURE", "1")

    from backend.app.main import app as fastapi_app
    from starlette.middleware.cors import CORSMiddleware

    # A browser preflight carries the *name* of the token header, never its
    # secret value. Keep standard CORS outside authentication so approved UI
    # origins can preflight, while every real API request still needs its token.
    app = CORSMiddleware(
        DesktopTokenMiddleware(fastapi_app, args.token),
        allow_origins=[origin.strip() for origin in os.environ['SOLYAN_ALLOWED_ORIGINS'].split(',') if origin.strip()],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
