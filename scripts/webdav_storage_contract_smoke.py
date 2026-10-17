from __future__ import annotations

import asyncio
import os
from urllib.parse import quote

os.environ["SOLYAN_ALLOWED_ORIGINS"] = "http://localhost:3000"
os.environ["CLOUD_STORAGE_SESSION_TTL_SECONDS"] = "3600"
os.environ["CLOUD_STORAGE_MAX_FILE_SIZE"] = str(2 * 1024 * 1024)
os.environ["CLOUD_STORAGE_COOKIE_SECURE"] = "0"
os.environ["CLOUD_STORAGE_COOKIE_SAMESITE"] = "lax"
os.environ["WEBDAV_BASE_URL"] = "https://dav.example.test/remote.php/dav/files/solyan/"
os.environ["WEBDAV_USERNAME"] = "solyan-user"
os.environ["WEBDAV_PASSWORD"] = "solyan-secret"
os.environ["WEBDAV_VERIFY_TLS"] = "1"

import httpx

from backend.app import webdav_storage
from backend.app.main import app

ORIGIN = "http://localhost:3000"
MOCK_PDF = b"%PDF-1.4\n% SolYan WebDAV mock\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
REQUESTS: list[tuple[str, str]] = []

ROOT_XML = '''<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/solyan/</d:href>
    <d:propstat><d:prop><d:displayname>solyan</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/solyan/PDF/</d:href>
    <d:propstat><d:prop><d:displayname>PDF</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/solyan/T%C3%A0i%20li%E1%BB%87u.pdf</d:href>
    <d:propstat><d:prop><d:displayname>Tài liệu.pdf</d:displayname><d:resourcetype/><d:getcontentlength>71</d:getcontentlength><d:getcontenttype>application/pdf</d:getcontenttype><d:getlastmodified>Sat, 17 Oct 2026 08:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/solyan/skip.txt</d:href>
    <d:propstat><d:prop><d:displayname>skip.txt</d:displayname><d:resourcetype/><d:getcontentlength>3</d:getcontentlength><d:getcontenttype>text/plain</d:getcontenttype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
</d:multistatus>'''.encode("utf-8")


def response(status: int, *, content: bytes = b"") -> httpx.Response:
    return httpx.Response(status, content=content)


async def fake_webdav_request(method: str, url: str, **kwargs: object) -> httpx.Response:
    REQUESTS.append((method, url))
    root = "https://dav.example.test/remote.php/dav/files/solyan/"
    pdf_url = root + quote("Tài liệu.pdf")
    new_url = root + "new-webdav.pdf"

    if method == "PROPFIND" and url == root:
        return response(207, content=ROOT_XML)
    if method == "GET" and url == pdf_url:
        return response(200, content=MOCK_PDF)
    if method == "PROPFIND" and url == new_url:
        return response(404)
    if method == "PUT" and url == new_url:
        headers = kwargs.get("headers")
        assert isinstance(headers, dict) and headers.get("If-None-Match") == "*"
        return response(201)
    if method == "PROPFIND" and url == pdf_url:
        return response(207, content=ROOT_XML)
    if method == "PUT" and url == pdf_url:
        return response(204)
    raise AssertionError(f"unexpected WebDAV request: {method} {url} kwargs={kwargs}")


def assert_status(resp: httpx.Response, expected: int, label: str) -> None:
    if resp.status_code != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {resp.status_code}: {resp.text[:1000]}")


async def run_contract() -> None:
    webdav_storage._reset_for_tests()
    webdav_storage._webdav_request = fake_webdav_request

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://solyan.test",
        headers={"Origin": ORIGIN},
        follow_redirects=False,
    ) as client:
        before = await client.get("/storage/webdav/status")
        assert_status(before, 200, "WebDAV status before connect")
        payload = before.json()
        assert payload["configured"] is True
        assert payload["connected"] is False
        assert payload["auth_mode"] == "server-configured"
        assert payload["credentials_server_side"] is True
        assert "solyan-secret" not in before.text

        connected = await client.post("/storage/webdav/connect")
        assert_status(connected, 200, "WebDAV connect")
        assert "httponly" in connected.headers.get("set-cookie", "").lower()

        after = await client.get("/storage/webdav/status")
        assert after.json()["connected"] is True

        listed = await client.get("/storage/webdav/files")
        assert_status(listed, 200, "WebDAV list")
        items = listed.json()["items"]
        assert [item["kind"] for item in items] == ["folder", "pdf"]
        pdf_item = next(item for item in items if item["kind"] == "pdf")
        assert "/" not in pdf_item["id"]

        downloaded = await client.get(f"/storage/webdav/files/{pdf_item['id']}")
        assert_status(downloaded, 200, "WebDAV download")
        assert downloaded.content == MOCK_PDF
        assert downloaded.headers.get("cache-control") == "no-store"

        uploaded = await client.post(
            "/storage/webdav/files",
            files={"file": ("new-webdav.pdf", MOCK_PDF, "application/pdf")},
            data={"folder_id": "root"},
        )
        assert_status(uploaded, 201, "WebDAV upload")
        assert uploaded.json()["item"]["name"] == "new-webdav.pdf"

        replaced = await client.post(
            f"/storage/webdav/files/{pdf_item['id']}/replace",
            files={"file": ("processed.pdf", MOCK_PDF, "application/pdf")},
        )
        assert_status(replaced, 200, "WebDAV replace")
        assert replaced.json()["item"]["name"] == "Tài liệu.pdf"

        bad_origin = await client.post(
            "/storage/webdav/logout",
            headers={"Origin": "https://evil.example"},
        )
        assert_status(bad_origin, 403, "WebDAV mutation origin guard")

        logged_out = await client.post("/storage/webdav/logout")
        assert_status(logged_out, 200, "WebDAV logout")
        final = await client.get("/storage/webdav/status")
        assert final.json()["connected"] is False

    print("webdav_storage_contract=PASS")
    print("server_side_credentials=PASS")
    print("opaque_path_ids=PASS")
    print("explicit_replace_only=PASS")
    print("origin_guard=PASS")
    print(f"mock_webdav_requests={len(REQUESTS)}")


if __name__ == "__main__":
    asyncio.run(run_contract())
