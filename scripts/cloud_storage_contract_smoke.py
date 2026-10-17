from __future__ import annotations

import asyncio
import os
from urllib.parse import parse_qs, urlparse

os.environ["SOLYAN_ALLOWED_ORIGINS"] = "http://localhost:3000"
os.environ["CLOUD_STORAGE_CALLBACK_BASE_URL"] = "http://solyan.test"
os.environ["CLOUD_STORAGE_FRONTEND_BASE_URL"] = "http://localhost:3000"
os.environ["CLOUD_STORAGE_SESSION_TTL_SECONDS"] = "3600"
os.environ["CLOUD_STORAGE_MAX_FILE_SIZE"] = str(2 * 1024 * 1024)
os.environ["CLOUD_STORAGE_COOKIE_SECURE"] = "0"
os.environ["CLOUD_STORAGE_COOKIE_SAMESITE"] = "lax"
os.environ["GOOGLE_DRIVE_CLIENT_ID"] = "google-client"
os.environ["GOOGLE_DRIVE_CLIENT_SECRET"] = "google-secret"
os.environ["GOOGLE_PICKER_API_KEY"] = "picker-key"
os.environ["GOOGLE_PICKER_APP_ID"] = "picker-app"
os.environ["ONEDRIVE_CLIENT_ID"] = "onedrive-client"
os.environ["ONEDRIVE_CLIENT_SECRET"] = "onedrive-secret"
os.environ["ONEDRIVE_TENANT"] = "common"

import httpx

from backend.app import cloud_storage
from backend.app.main import app

MOCK_PDF = b"%PDF-1.4\n% SolYan cloud storage mock\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
ORIGIN = "http://localhost:3000"
FAIL_GOOGLE_LIST = False
REQUESTS: list[tuple[str, str]] = []
TOKEN_FORMS: list[dict[str, str]] = []


def response(status: int, *, json: dict | None = None, content: bytes | None = None, headers: dict[str, str] | None = None) -> httpx.Response:
    return httpx.Response(status, json=json, content=content, headers=headers)


async def fake_http_request(method: str, url: str, **kwargs: object) -> httpx.Response:
    global FAIL_GOOGLE_LIST
    REQUESTS.append((method, url))
    data = kwargs.get("data")
    if isinstance(data, dict):
        TOKEN_FORMS.append({str(key): str(value) for key, value in data.items()})

    if url == "https://oauth2.googleapis.com/token":
        if isinstance(data, dict) and data.get("grant_type") == "refresh_token":
            return response(200, json={"access_token": "google-access-refreshed", "expires_in": 3600})
        return response(
            200,
            json={"access_token": "google-access", "refresh_token": "google-refresh", "expires_in": 3600},
        )

    if url.startswith("https://www.googleapis.com/drive/v3/files/") and method == "GET":
        params = kwargs.get("params")
        if isinstance(params, dict) and params.get("alt") == "media":
            return response(200, content=MOCK_PDF, headers={"Content-Type": "application/pdf"})
        return response(
            200,
            json={
                "id": "google-pdf-1",
                "name": "Tài liệu Google.pdf",
                "mimeType": "application/pdf",
                "size": str(len(MOCK_PDF)),
                "modifiedTime": "2026-10-17T00:00:00Z",
                "webViewLink": "https://drive.google.com/mock",
            },
        )

    if url == "https://www.googleapis.com/drive/v3/files" and method == "GET":
        if FAIL_GOOGLE_LIST:
            return response(500, json={"error": {"message": "SECRET_PROVIDER_DETAIL_MUST_NOT_LEAK"}})
        return response(
            200,
            json={
                "files": [
                    {
                        "id": "google-folder-1",
                        "name": "PDF",
                        "mimeType": "application/vnd.google-apps.folder",
                    },
                    {
                        "id": "google-pdf-1",
                        "name": "Tài liệu Google.pdf",
                        "mimeType": "application/pdf",
                        "size": str(len(MOCK_PDF)),
                        "modifiedTime": "2026-10-17T00:00:00Z",
                        "webViewLink": "https://drive.google.com/mock",
                    },
                ]
            },
        )

    if url == "https://www.googleapis.com/upload/drive/v3/files" and method == "POST":
        return response(200, json={}, headers={"Location": "https://upload.googleapis.com/mock/google-new"})

    if url.startswith("https://www.googleapis.com/upload/drive/v3/files/") and method == "PATCH":
        return response(200, json={}, headers={"Location": "https://upload.googleapis.com/mock/google-replace"})

    if url == "https://upload.googleapis.com/mock/google-new" and method == "PUT":
        return response(
            200,
            json={
                "id": "google-created",
                "name": "new-google.pdf",
                "size": str(len(MOCK_PDF)),
                "modifiedTime": "2026-10-17T00:00:00Z",
            },
        )

    if url == "https://upload.googleapis.com/mock/google-replace" and method == "PUT":
        return response(
            200,
            json={
                "id": "google-pdf-1",
                "name": "Tài liệu Google.pdf",
                "size": str(len(MOCK_PDF)),
                "modifiedTime": "2026-10-17T00:00:00Z",
            },
        )

    if url.startswith("https://login.microsoftonline.com/common/oauth2/v2.0/token"):
        if isinstance(data, dict) and data.get("grant_type") == "refresh_token":
            return response(200, json={"access_token": "onedrive-access-refreshed", "expires_in": 3600})
        return response(
            200,
            json={"access_token": "onedrive-access", "refresh_token": "onedrive-refresh", "expires_in": 3600},
        )

    if url == "https://graph.microsoft.com/v1.0/me/drive/root/children" and method == "GET":
        return response(
            200,
            json={
                "value": [
                    {"id": "onedrive-folder-1", "name": "PDF", "size": 0, "folder": {}, "webUrl": "https://onedrive.live.com/folder"},
                    {
                        "id": "onedrive-pdf-1",
                        "name": "OneDrive.pdf",
                        "size": len(MOCK_PDF),
                        "file": {"mimeType": "application/pdf"},
                        "lastModifiedDateTime": "2026-10-17T00:00:00Z",
                        "webUrl": "https://onedrive.live.com/pdf",
                    },
                    {"id": "not-pdf", "name": "skip.txt", "size": 3, "file": {"mimeType": "text/plain"}},
                ]
            },
        )

    if url.startswith("https://graph.microsoft.com/v1.0/me/drive/items/onedrive-pdf-1") and method == "GET":
        if url.endswith("/content"):
            return response(200, content=MOCK_PDF, headers={"Content-Type": "application/pdf"})
        return response(
            200,
            json={
                "id": "onedrive-pdf-1",
                "name": "OneDrive.pdf",
                "size": len(MOCK_PDF),
                "file": {"mimeType": "application/pdf"},
                "webUrl": "https://onedrive.live.com/pdf",
            },
        )

    if "createUploadSession" in url and url.startswith("https://graph.microsoft.com/") and method == "POST":
        suffix = "replace" if "/items/onedrive-pdf-1/" in url else "new"
        return response(200, json={"uploadUrl": f"https://mock.up.1drv.com/session/{suffix}"})

    if url == "https://mock.up.1drv.com/session/new" and method == "PUT":
        return response(
            201,
            json={
                "id": "onedrive-created",
                "name": "new-onedrive.pdf",
                "size": len(MOCK_PDF),
                "lastModifiedDateTime": "2026-10-17T00:00:00Z",
            },
        )

    if url == "https://mock.up.1drv.com/session/replace" and method == "PUT":
        return response(
            200,
            json={
                "id": "onedrive-pdf-1",
                "name": "OneDrive.pdf",
                "size": len(MOCK_PDF),
                "lastModifiedDateTime": "2026-10-17T00:00:00Z",
            },
        )

    raise AssertionError(f"unexpected mock provider request: {method} {url} kwargs={kwargs}")


def assert_status(resp: httpx.Response, expected: int, label: str) -> None:
    if resp.status_code != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {resp.status_code}: {resp.text[:1000]}")


def oauth_state(location: str) -> str:
    values = parse_qs(urlparse(location).query).get("state", [])
    if not values:
        raise AssertionError(f"OAuth redirect does not contain state: {location}")
    return values[0]


async def connect(client: httpx.AsyncClient, provider: str) -> str:
    start = await client.get(f"/storage/{provider}/auth/start?return_path=/cloud-storage", follow_redirects=False)
    assert_status(start, 307, f"{provider} auth start")
    location = start.headers["location"]
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert query.get("code_challenge_method") == ["S256"]
    assert query.get("code_challenge") and len(query["code_challenge"][0]) >= 40
    assert "code_verifier" not in query
    state = oauth_state(location)
    callback = await client.get(
        f"/storage/{provider}/auth/callback",
        params={"state": state, "code": f"{provider}-code"},
        follow_redirects=False,
    )
    assert_status(callback, 303, f"{provider} auth callback")
    assert callback.headers["location"].startswith("http://localhost:3000/cloud-storage?")
    assert "connected=1" in callback.headers["location"]
    assert callback.headers.get("cache-control") == "no-store"
    return state


async def run_contract() -> None:
    global FAIL_GOOGLE_LIST
    cloud_storage._reset_for_tests()
    cloud_storage._http_request = fake_http_request

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://solyan.test",
        headers={"Origin": ORIGIN},
        follow_redirects=False,
    ) as client:
        preflight = await client.options(
            "/storage/providers",
            headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"},
        )
        assert_status(preflight, 200, "credentialed CORS preflight")
        assert preflight.headers.get("access-control-allow-origin") == ORIGIN
        assert preflight.headers.get("access-control-allow-credentials") == "true"

        status = await client.get("/storage/providers")
        assert_status(status, 200, "provider status before auth")
        payload = status.json()
        providers = {item["id"]: item for item in payload["providers"]}
        assert providers["google"]["configured"] is True and providers["google"]["connected"] is False
        assert providers["google"]["least_privilege_scope"] == "drive.file"
        assert providers["google"]["picker_configured"] is True
        assert providers["onedrive"]["configured"] is True and providers["onedrive"]["connected"] is False
        assert payload["credentials_required_for_build"] is False

        google_state = await connect(client, "google")
        replay = await client.get(
            "/storage/google/auth/callback",
            params={"state": google_state, "code": "replay"},
            follow_redirects=False,
        )
        assert_status(replay, 400, "single-use OAuth state")
        assert any(form.get("code_verifier") for form in TOKEN_FORMS if form.get("grant_type") == "authorization_code")

        status = await client.get("/storage/providers")
        google = {item["id"]: item for item in status.json()["providers"]}["google"]
        assert google["connected"] is True

        listed = await client.get("/storage/google/files")
        assert_status(listed, 200, "Google list")
        assert [item["kind"] for item in listed.json()["items"]] == ["folder", "pdf"]

        downloaded = await client.get("/storage/google/files/google-pdf-1")
        assert_status(downloaded, 200, "Google download")
        assert downloaded.content == MOCK_PDF
        assert downloaded.headers.get("cache-control") == "no-store"
        assert "filename*=UTF-8''" in downloaded.headers["content-disposition"]

        picker = await client.get("/storage/google/picker-token")
        assert_status(picker, 200, "Google Picker token")
        picker_payload = picker.json()
        assert picker_payload["access_token"] == "google-access"
        assert picker_payload["browser_storage"] == "memory-only"
        assert "refresh_token" not in picker_payload
        assert picker.headers.get("cache-control") == "no-store"

        uploaded = await client.post(
            "/storage/google/files",
            files={"file": ("new-google.pdf", MOCK_PDF, "application/pdf")},
            data={"folder_id": "root"},
        )
        assert_status(uploaded, 201, "Google upload")
        assert uploaded.json()["item"]["id"] == "google-created"

        replaced = await client.post(
            "/storage/google/files/google-pdf-1/replace",
            files={"file": ("processed.pdf", MOCK_PDF, "application/pdf")},
        )
        assert_status(replaced, 200, "Google replace")
        assert replaced.json()["item"]["id"] == "google-pdf-1"

        old_limit = os.environ["CLOUD_STORAGE_MAX_FILE_SIZE"]
        os.environ["CLOUD_STORAGE_MAX_FILE_SIZE"] = "1024"
        oversized = b"%PDF-1.4\n" + (b"x" * 1100)
        rejected = await client.post(
            "/storage/google/files",
            files={"file": ("too-large.pdf", oversized, "application/pdf")},
            data={"folder_id": "root"},
        )
        assert_status(rejected, 413, "bounded cloud upload")
        os.environ["CLOUD_STORAGE_MAX_FILE_SIZE"] = old_limit

        FAIL_GOOGLE_LIST = True
        sanitized = await client.get("/storage/google/files")
        FAIL_GOOGLE_LIST = False
        assert_status(sanitized, 502, "sanitized provider error")
        assert "SECRET_PROVIDER_DETAIL_MUST_NOT_LEAK" not in sanitized.text
        assert sanitized.json()["detail"] == "Cloud storage provider request failed"

        evil = await client.get(
            "/storage/google/auth/start",
            params={"return_path": "https://evil.example/steal"},
            follow_redirects=False,
        )
        evil_state = oauth_state(evil.headers["location"])
        safe_callback = await client.get(
            "/storage/google/auth/callback",
            params={"state": evil_state, "code": "safe-return-code"},
            follow_redirects=False,
        )
        assert safe_callback.headers["location"].startswith("http://localhost:3000/cloud-storage?")
        assert "evil.example" not in safe_callback.headers["location"]

        await connect(client, "onedrive")
        onedrive_list = await client.get("/storage/onedrive/files")
        assert_status(onedrive_list, 200, "OneDrive list")
        assert [item["kind"] for item in onedrive_list.json()["items"]] == ["folder", "pdf"]

        onedrive_download = await client.get("/storage/onedrive/files/onedrive-pdf-1")
        assert_status(onedrive_download, 200, "OneDrive download")
        assert onedrive_download.content == MOCK_PDF

        onedrive_upload = await client.post(
            "/storage/onedrive/files",
            files={"file": ("new-onedrive.pdf", MOCK_PDF, "application/pdf")},
            data={"folder_id": "root"},
        )
        assert_status(onedrive_upload, 201, "OneDrive upload session")
        assert onedrive_upload.json()["item"]["id"] == "onedrive-created"

        onedrive_replace = await client.post(
            "/storage/onedrive/files/onedrive-pdf-1/replace",
            files={"file": ("processed.pdf", MOCK_PDF, "application/pdf")},
        )
        assert_status(onedrive_replace, 200, "OneDrive replace session")
        assert onedrive_replace.json()["item"]["id"] == "onedrive-pdf-1"

        unsupported = await client.get("/storage/dropbox/files")
        assert_status(unsupported, 404, "server-side provider allow-list")

        bad_origin = await client.post(
            "/storage/google/logout",
            headers={"Origin": "https://evil.example"},
        )
        assert_status(bad_origin, 403, "mutation origin guard")

        logged_out = await client.post("/storage/google/logout")
        assert_status(logged_out, 200, "Google logout")
        status = await client.get("/storage/providers")
        assert {item["id"]: item for item in status.json()["providers"]}["google"]["connected"] is False

    async with httpx.AsyncClient(transport=transport, base_url="http://solyan.test", headers={"Origin": ORIGIN}) as isolated:
        isolated_status = await isolated.get("/storage/providers")
        assert_status(isolated_status, 200, "isolated browser session")
        state = {item["id"]: item for item in isolated_status.json()["providers"]}
        assert state["google"]["connected"] is False
        assert state["onedrive"]["connected"] is False

    print("cloud_storage_contract=PASS")
    print("oauth_pkce_state=PASS")
    print("server_side_token_session=PASS")
    print("google_drive_file_scope=PASS")
    print("google_picker_memory_token=PASS")
    print("onedrive_upload_session=PASS")
    print("bounded_pdf_transfer=PASS")
    print("provider_error_sanitization=PASS")
    print("origin_and_redirect_guards=PASS")
    print(f"mock_provider_requests={len(REQUESTS)}")


if __name__ == "__main__":
    asyncio.run(run_contract())
