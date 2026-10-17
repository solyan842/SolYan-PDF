from __future__ import annotations

import asyncio
import os
from urllib.parse import parse_qs, urlparse

os.environ["SOLYAN_ALLOWED_ORIGINS"] = "http://localhost:3000"
os.environ["CLOUD_STORAGE_CALLBACK_BASE_URL"] = "http://solyan.test"
os.environ["CLOUD_STORAGE_FRONTEND_BASE_URL"] = "http://localhost:3000"
os.environ["CLOUD_STORAGE_COOKIE_SECURE"] = "0"
os.environ["GOOGLE_DRIVE_CLIENT_ID"] = "google-client"
os.environ["GOOGLE_DRIVE_CLIENT_SECRET"] = "google-secret"

import httpx

from backend.app import cloud_storage
from backend.app.main import app


async def fake_exchange(self, code: str, verifier: str, redirect_uri: str) -> cloud_storage.OAuthToken:
    assert code == "bound-session-code"
    assert len(verifier) >= 43
    assert redirect_uri == "http://solyan.test/storage/google/auth/callback"
    return cloud_storage.OAuthToken(
        access_token="bound-access",
        refresh_token="bound-refresh",
        expires_at=cloud_storage.time.time() + 3600,
    )


def state_from(location: str) -> str:
    values = parse_qs(urlparse(location).query).get("state", [])
    if len(values) != 1:
        raise AssertionError(f"missing OAuth state: {location}")
    return values[0]


async def run() -> None:
    cloud_storage._reset_for_tests()
    cloud_storage.GoogleDriveProvider.exchange_code = fake_exchange
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://solyan.test", follow_redirects=False) as initiator:
        start = await initiator.get("/storage/google/auth/start?return_path=/cloud-storage")
        assert start.status_code == 307, start.text
        state = state_from(start.headers["location"])
        assert initiator.cookies.get(cloud_storage.COOKIE_NAME)

        async with httpx.AsyncClient(transport=transport, base_url="http://solyan.test", follow_redirects=False) as other_browser:
            stolen = await other_browser.get(
                "/storage/google/auth/callback",
                params={"state": state, "code": "bound-session-code"},
            )
            assert stolen.status_code == 400, stolen.text
            assert stolen.headers.get("cache-control") == "no-store"
            assert "initiating browser session" in stolen.json()["detail"] or "session is missing" in stolen.json()["detail"]
            status = await other_browser.get("/storage/providers")
            assert status.status_code == 200
            google = {item["id"]: item for item in status.json()["providers"]}["google"]
            assert google["connected"] is False

        callback = await initiator.get(
            "/storage/google/auth/callback",
            params={"state": state, "code": "bound-session-code"},
        )
        assert callback.status_code == 303, callback.text
        assert "connected=1" in callback.headers["location"]

        status = await initiator.get("/storage/providers")
        assert status.status_code == 200
        google = {item["id"]: item for item in status.json()["providers"]}["google"]
        assert google["connected"] is True

        replay = await initiator.get(
            "/storage/google/auth/callback",
            params={"state": state, "code": "bound-session-code"},
        )
        assert replay.status_code == 400, replay.text

    print("oauth_callback_session_binding=PASS")
    print("cross_browser_callback_rejected=PASS")
    print("initiating_browser_callback=PASS")
    print("state_replay_rejected=PASS")


if __name__ == "__main__":
    asyncio.run(run())
