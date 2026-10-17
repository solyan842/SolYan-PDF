from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote, urlencode, urlparse

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, Response

router = APIRouter(prefix="/storage", tags=["cloud-storage"])

COOKIE_NAME = "solyan_storage_session"
PROVIDER_IDS = {"google", "onedrive"}
GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"
PDF_MIME = "application/pdf"
DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024
ONEDRIVE_CHUNK_SIZE = 10 * 1024 * 1024  # 32 * 320 KiB, valid for Graph upload sessions.
_SAFE_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{20,160}$")


class CloudProviderError(RuntimeError):
    def __init__(self, message: str = "cloud provider request failed", *, auth_expired: bool = False) -> None:
        super().__init__(message)
        self.auth_expired = auth_expired


@dataclass(frozen=True)
class OAuthToken:
    access_token: str
    refresh_token: str | None
    expires_at: float


@dataclass
class SessionRecord:
    tokens: dict[str, OAuthToken] = field(default_factory=dict)
    touched_at: float = field(default_factory=time.time)


@dataclass(frozen=True)
class OAuthAttempt:
    provider_id: str
    session_id: str
    verifier: str
    return_path: str
    expires_at: float


class SessionVault:
    """Bounded, restart-ephemeral OAuth state/token vault for the current single-worker backend."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}
        self._states: dict[str, OAuthAttempt] = {}
        self._lock = threading.RLock()

    def _ttl(self) -> int:
        return _bounded_int("CLOUD_STORAGE_SESSION_TTL_SECONDS", 86400, 300, 604800)

    def _max_sessions(self) -> int:
        return _bounded_int("CLOUD_STORAGE_MAX_SESSIONS", 512, 16, 4096)

    def _cleanup_locked(self) -> None:
        now = time.time()
        ttl = self._ttl()
        self._states = {key: value for key, value in self._states.items() if value.expires_at > now}
        self._sessions = {
            key: value for key, value in self._sessions.items() if value.touched_at + ttl > now
        }
        overflow = len(self._sessions) - self._max_sessions()
        if overflow > 0:
            oldest = sorted(self._sessions.items(), key=lambda item: item[1].touched_at)[:overflow]
            for session_id, _ in oldest:
                self._sessions.pop(session_id, None)
                self._states = {
                    key: state for key, state in self._states.items() if state.session_id != session_id
                }

    def touch(self, session_id: str) -> None:
        with self._lock:
            self._cleanup_locked()
            record = self._sessions.setdefault(session_id, SessionRecord())
            record.touched_at = time.time()

    def issue_state(self, provider_id: str, session_id: str, verifier: str, return_path: str) -> str:
        with self._lock:
            self._cleanup_locked()
            self.touch(session_id)
            state = secrets.token_urlsafe(32)
            self._states[state] = OAuthAttempt(
                provider_id=provider_id,
                session_id=session_id,
                verifier=verifier,
                return_path=return_path,
                expires_at=time.time() + min(self._ttl(), 600),
            )
            return state

    def consume_state(self, provider_id: str, state: str) -> OAuthAttempt:
        with self._lock:
            self._cleanup_locked()
            attempt = self._states.pop(state, None)
            if attempt is None or attempt.provider_id != provider_id or attempt.expires_at <= time.time():
                raise HTTPException(status_code=400, detail="OAuth state is invalid or expired")
            self.touch(attempt.session_id)
            return attempt

    def set_token(self, session_id: str, provider_id: str, token: OAuthToken) -> None:
        with self._lock:
            self._cleanup_locked()
            record = self._sessions.setdefault(session_id, SessionRecord())
            record.tokens[provider_id] = token
            record.touched_at = time.time()

    def get_token(self, session_id: str, provider_id: str) -> OAuthToken | None:
        with self._lock:
            self._cleanup_locked()
            record = self._sessions.get(session_id)
            if record is None:
                return None
            record.touched_at = time.time()
            return record.tokens.get(provider_id)

    def remove_provider(self, session_id: str, provider_id: str) -> None:
        with self._lock:
            record = self._sessions.get(session_id)
            if record is None:
                return
            record.tokens.pop(provider_id, None)
            record.touched_at = time.time()

    def reset_for_tests(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._states.clear()


_VAULT = SessionVault()


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _max_file_size() -> int:
    return _bounded_int("CLOUD_STORAGE_MAX_FILE_SIZE", DEFAULT_MAX_FILE_SIZE, 1024, DEFAULT_MAX_FILE_SIZE)


def _http_timeout() -> float:
    try:
        value = float(os.getenv("CLOUD_STORAGE_HTTP_TIMEOUT_SECONDS", "45"))
    except ValueError:
        value = 45.0
    return max(5.0, min(300.0, value))


def _callback_base() -> str:
    return os.getenv("CLOUD_STORAGE_CALLBACK_BASE_URL", "http://localhost:8000").rstrip("/")


def _frontend_base() -> str:
    return os.getenv("CLOUD_STORAGE_FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")


def _cookie_secure() -> bool:
    return os.getenv("CLOUD_STORAGE_COOKIE_SECURE", "0").strip().lower() in {"1", "true", "yes", "on"}


def _cookie_samesite() -> str:
    value = os.getenv("CLOUD_STORAGE_COOKIE_SAMESITE", "lax").strip().lower()
    return value if value in {"lax", "strict", "none"} else "lax"


def _allowed_origins() -> set[str]:
    return {
        origin.strip().rstrip("/")
        for origin in os.getenv("SOLYAN_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    }


def _require_mutation_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in _allowed_origins():
        raise HTTPException(status_code=403, detail="Origin is not allowed")


def _session_id(request: Request) -> str | None:
    value = request.cookies.get(COOKIE_NAME)
    if value and _SAFE_SESSION_RE.fullmatch(value):
        return value
    return None


def _new_session_id() -> str:
    return secrets.token_urlsafe(32)


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        max_age=_VAULT._ttl(),
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),  # type: ignore[arg-type]
        path="/",
    )


def _no_store(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    return response


def _safe_return_path(value: str) -> str:
    value = value.strip()
    if not value.startswith("/") or value.startswith("//") or "://" in value or "\\" in value:
        return "/cloud-storage"
    if len(value) > 512:
        return "/cloud-storage"
    return value


def _frontend_redirect(return_path: str, provider_id: str, *, connected: bool = False, error: str | None = None) -> str:
    separator = "&" if "?" in return_path else "?"
    params: dict[str, str] = {"storage_provider": provider_id}
    if connected:
        params["connected"] = "1"
    if error:
        params["error"] = error
    return f"{_frontend_base()}{return_path}{separator}{urlencode(params)}"


def _pkce_verifier() -> str:
    return secrets.token_urlsafe(64)


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _validate_item_id(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 512 or any(char in value for char in "/\\?#\x00\r\n"):
        raise HTTPException(status_code=422, detail="Invalid cloud item id")
    return value


def _validate_filename(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 255 or any(char in value for char in "/\\\x00\r\n"):
        raise HTTPException(status_code=422, detail="Invalid filename")
    if not value.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="V1.7 cloud storage accepts PDF files only")
    return value


def _validate_pdf_bytes(data: bytes) -> None:
    if len(data) > _max_file_size():
        raise HTTPException(status_code=413, detail="Cloud PDF exceeds configured size limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="Cloud object is not a PDF")


def _download_disposition(filename: str) -> str:
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._") or "solyan-cloud.pdf"
    if not ascii_name.lower().endswith(".pdf"):
        ascii_name += ".pdf"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'


async def _http_request(method: str, url: str, **kwargs: Any) -> httpx.Response:
    async with httpx.AsyncClient(timeout=_http_timeout(), follow_redirects=True) as client:
        return await client.request(method, url, **kwargs)


def _token_from_payload(payload: Any, existing_refresh: str | None = None) -> OAuthToken:
    if not isinstance(payload, dict) or not isinstance(payload.get("access_token"), str):
        raise CloudProviderError()
    try:
        expires_in = int(payload.get("expires_in", 3600))
    except (TypeError, ValueError):
        expires_in = 3600
    refresh_token = payload.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        refresh_token = existing_refresh
    return OAuthToken(
        access_token=payload["access_token"],
        refresh_token=refresh_token,
        expires_at=time.time() + max(60, min(expires_in, 86400)),
    )


def _json_or_provider_error(response: httpx.Response, expected: set[int] | None = None) -> dict[str, Any]:
    expected = expected or {200}
    if response.status_code not in expected:
        raise CloudProviderError(auth_expired=response.status_code in {401, 403})
    try:
        payload = response.json()
    except ValueError as exc:
        raise CloudProviderError() from exc
    if not isinstance(payload, dict):
        raise CloudProviderError()
    return payload


def _validate_upload_session_url(provider_id: str, url: str) -> str:
    parsed = urlparse(url)
    allow_test_http = os.getenv("CLOUD_STORAGE_ALLOW_TEST_HTTP", "0").strip().lower() in {"1", "true", "yes"}
    if parsed.scheme not in ({"https", "http"} if allow_test_http else {"https"}) or not parsed.hostname:
        raise CloudProviderError()
    host = parsed.hostname.lower()
    if provider_id == "google":
        allowed = host == "googleapis.com" or host.endswith(".googleapis.com")
    else:
        allowed = (
            host == "graph.microsoft.com"
            or host.endswith(".1drv.com")
            or host.endswith(".sharepoint.com")
            or host.endswith(".onedrive.com")
            or host.endswith(".live.com")
        )
    if not allowed and not allow_test_http:
        raise CloudProviderError()
    return url


class StorageProvider:
    id: str
    label: str
    scopes: tuple[str, ...]

    @property
    def configured(self) -> bool:
        raise NotImplementedError

    def authorization_url(self, redirect_uri: str, state: str, challenge: str) -> str:
        raise NotImplementedError

    async def exchange_code(self, code: str, verifier: str, redirect_uri: str) -> OAuthToken:
        raise NotImplementedError

    async def refresh(self, refresh_token: str) -> OAuthToken:
        raise NotImplementedError

    async def list_files(self, access_token: str, folder_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def download_pdf(self, access_token: str, item_id: str) -> tuple[bytes, str]:
        raise NotImplementedError

    async def upload_pdf(self, access_token: str, data: bytes, filename: str, folder_id: str) -> dict[str, Any]:
        raise NotImplementedError

    async def replace_pdf(self, access_token: str, data: bytes, item_id: str) -> dict[str, Any]:
        raise NotImplementedError


class GoogleDriveProvider(StorageProvider):
    id = "google"
    label = "Google Drive"
    scopes = ("https://www.googleapis.com/auth/drive.file",)

    @property
    def configured(self) -> bool:
        return bool(os.getenv("GOOGLE_DRIVE_CLIENT_ID") and os.getenv("GOOGLE_DRIVE_CLIENT_SECRET"))

    @property
    def picker_configured(self) -> bool:
        return bool(os.getenv("GOOGLE_PICKER_API_KEY") and os.getenv("GOOGLE_PICKER_APP_ID"))

    @property
    def client_id(self) -> str:
        return os.getenv("GOOGLE_DRIVE_CLIENT_ID", "")

    @property
    def client_secret(self) -> str:
        return os.getenv("GOOGLE_DRIVE_CLIENT_SECRET", "")

    def authorization_url(self, redirect_uri: str, state: str, challenge: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.scopes),
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "consent",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    async def exchange_code(self, code: str, verifier: str, redirect_uri: str) -> OAuthToken:
        response = await _http_request(
            "POST",
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "code_verifier": verifier,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        return _token_from_payload(_json_or_provider_error(response))

    async def refresh(self, refresh_token: str) -> OAuthToken:
        response = await _http_request(
            "POST",
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        return _token_from_payload(_json_or_provider_error(response), refresh_token)

    async def list_files(self, access_token: str, folder_id: str) -> list[dict[str, Any]]:
        folder = folder_id.replace("\\", "\\\\").replace("'", "\\'")
        query = (
            f"'{folder}' in parents and trashed = false and "
            f"(mimeType = '{PDF_MIME}' or mimeType = '{GOOGLE_FOLDER_MIME}')"
        )
        response = await _http_request(
            "GET",
            "https://www.googleapis.com/drive/v3/files",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "q": query,
                "pageSize": "1000",
                "orderBy": "folder,name_natural",
                "fields": "files(id,name,mimeType,size,modifiedTime,parents,webViewLink)",
            },
        )
        payload = _json_or_provider_error(response)
        items: list[dict[str, Any]] = []
        for raw in payload.get("files", []):
            if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not isinstance(raw.get("name"), str):
                continue
            kind = "folder" if raw.get("mimeType") == GOOGLE_FOLDER_MIME else "pdf"
            items.append(
                {
                    "id": raw["id"],
                    "name": raw["name"],
                    "kind": kind,
                    "size": int(raw["size"]) if str(raw.get("size", "")).isdigit() else None,
                    "modified_at": raw.get("modifiedTime"),
                    "web_url": raw.get("webViewLink"),
                }
            )
        return items

    async def _metadata(self, access_token: str, item_id: str) -> dict[str, Any]:
        response = await _http_request(
            "GET",
            f"https://www.googleapis.com/drive/v3/files/{quote(item_id, safe='')}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"fields": "id,name,mimeType,size,modifiedTime,webViewLink"},
        )
        return _json_or_provider_error(response)

    async def download_pdf(self, access_token: str, item_id: str) -> tuple[bytes, str]:
        metadata = await self._metadata(access_token, item_id)
        name = metadata.get("name") if isinstance(metadata.get("name"), str) else "solyan-cloud.pdf"
        if metadata.get("mimeType") != PDF_MIME and not name.lower().endswith(".pdf"):
            raise CloudProviderError("cloud item is not a PDF")
        response = await _http_request(
            "GET",
            f"https://www.googleapis.com/drive/v3/files/{quote(item_id, safe='')}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"alt": "media"},
        )
        if response.status_code != 200:
            raise CloudProviderError(auth_expired=response.status_code in {401, 403})
        data = response.content
        _validate_pdf_bytes(data)
        return data, _validate_filename(name)

    async def upload_pdf(self, access_token: str, data: bytes, filename: str, folder_id: str) -> dict[str, Any]:
        metadata: dict[str, Any] = {"name": filename}
        if folder_id:
            metadata["parents"] = [folder_id]
        response = await _http_request(
            "POST",
            "https://www.googleapis.com/upload/drive/v3/files",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-Upload-Content-Type": PDF_MIME,
                "X-Upload-Content-Length": str(len(data)),
            },
            params={"uploadType": "resumable", "fields": "id,name,size,modifiedTime,webViewLink"},
            json=metadata,
        )
        if response.status_code not in {200, 201}:
            raise CloudProviderError(auth_expired=response.status_code in {401, 403})
        session_url = response.headers.get("location")
        if not session_url:
            raise CloudProviderError()
        session_url = _validate_upload_session_url(self.id, session_url)
        uploaded = await _http_request(
            "PUT",
            session_url,
            headers={"Content-Type": PDF_MIME, "Content-Length": str(len(data))},
            content=data,
        )
        payload = _json_or_provider_error(uploaded, {200, 201})
        return _normalize_written_item(payload, filename)

    async def replace_pdf(self, access_token: str, data: bytes, item_id: str) -> dict[str, Any]:
        metadata = await self._metadata(access_token, item_id)
        name = metadata.get("name") if isinstance(metadata.get("name"), str) else "solyan-cloud.pdf"
        _validate_filename(name)
        response = await _http_request(
            "PATCH",
            f"https://www.googleapis.com/upload/drive/v3/files/{quote(item_id, safe='')}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "X-Upload-Content-Type": PDF_MIME,
                "X-Upload-Content-Length": str(len(data)),
            },
            params={"uploadType": "resumable", "fields": "id,name,size,modifiedTime,webViewLink"},
            json={},
        )
        if response.status_code not in {200, 201}:
            raise CloudProviderError(auth_expired=response.status_code in {401, 403})
        session_url = response.headers.get("location")
        if not session_url:
            raise CloudProviderError()
        session_url = _validate_upload_session_url(self.id, session_url)
        uploaded = await _http_request(
            "PUT",
            session_url,
            headers={"Content-Type": PDF_MIME, "Content-Length": str(len(data))},
            content=data,
        )
        payload = _json_or_provider_error(uploaded, {200, 201})
        return _normalize_written_item(payload, name)


class OneDriveProvider(StorageProvider):
    id = "onedrive"
    label = "OneDrive"
    scopes = ("Files.ReadWrite", "offline_access")

    @property
    def configured(self) -> bool:
        return bool(os.getenv("ONEDRIVE_CLIENT_ID") and os.getenv("ONEDRIVE_CLIENT_SECRET"))

    @property
    def tenant(self) -> str:
        value = os.getenv("ONEDRIVE_TENANT", "common").strip()
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", value):
            return "common"
        return value

    @property
    def client_id(self) -> str:
        return os.getenv("ONEDRIVE_CLIENT_ID", "")

    @property
    def client_secret(self) -> str:
        return os.getenv("ONEDRIVE_CLIENT_SECRET", "")

    @property
    def authority(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0"

    def authorization_url(self, redirect_uri: str, state: str, challenge: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "response_mode": "query",
            "scope": " ".join(self.scopes),
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return f"{self.authority}/authorize?{urlencode(params)}"

    async def exchange_code(self, code: str, verifier: str, redirect_uri: str) -> OAuthToken:
        response = await _http_request(
            "POST",
            f"{self.authority}/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "code_verifier": verifier,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "scope": " ".join(self.scopes),
            },
        )
        return _token_from_payload(_json_or_provider_error(response))

    async def refresh(self, refresh_token: str) -> OAuthToken:
        response = await _http_request(
            "POST",
            f"{self.authority}/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
                "scope": " ".join(self.scopes),
            },
        )
        return _token_from_payload(_json_or_provider_error(response), refresh_token)

    async def list_files(self, access_token: str, folder_id: str) -> list[dict[str, Any]]:
        if folder_id == "root":
            url = "https://graph.microsoft.com/v1.0/me/drive/root/children"
        else:
            url = f"https://graph.microsoft.com/v1.0/me/drive/items/{quote(folder_id, safe='')}/children"
        response = await _http_request(
            "GET",
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "$top": "200",
                "$select": "id,name,size,lastModifiedDateTime,webUrl,folder,file,parentReference",
            },
        )
        payload = _json_or_provider_error(response)
        items: list[dict[str, Any]] = []
        for raw in payload.get("value", []):
            if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not isinstance(raw.get("name"), str):
                continue
            is_folder = isinstance(raw.get("folder"), dict)
            mime_type = raw.get("file", {}).get("mimeType") if isinstance(raw.get("file"), dict) else None
            if not is_folder and mime_type != PDF_MIME and not raw["name"].lower().endswith(".pdf"):
                continue
            items.append(
                {
                    "id": raw["id"],
                    "name": raw["name"],
                    "kind": "folder" if is_folder else "pdf",
                    "size": raw.get("size") if isinstance(raw.get("size"), int) else None,
                    "modified_at": raw.get("lastModifiedDateTime"),
                    "web_url": raw.get("webUrl"),
                }
            )
        return items

    async def _metadata(self, access_token: str, item_id: str) -> dict[str, Any]:
        response = await _http_request(
            "GET",
            f"https://graph.microsoft.com/v1.0/me/drive/items/{quote(item_id, safe='')}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"$select": "id,name,size,lastModifiedDateTime,webUrl,file,folder"},
        )
        return _json_or_provider_error(response)

    async def download_pdf(self, access_token: str, item_id: str) -> tuple[bytes, str]:
        metadata = await self._metadata(access_token, item_id)
        name = metadata.get("name") if isinstance(metadata.get("name"), str) else "solyan-cloud.pdf"
        file_data = metadata.get("file") if isinstance(metadata.get("file"), dict) else {}
        mime_type = file_data.get("mimeType")
        if mime_type != PDF_MIME and not name.lower().endswith(".pdf"):
            raise CloudProviderError("cloud item is not a PDF")
        response = await _http_request(
            "GET",
            f"https://graph.microsoft.com/v1.0/me/drive/items/{quote(item_id, safe='')}/content",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code != 200:
            raise CloudProviderError(auth_expired=response.status_code in {401, 403})
        data = response.content
        _validate_pdf_bytes(data)
        return data, _validate_filename(name)

    async def _upload_session(self, access_token: str, url: str, body: dict[str, Any]) -> str:
        response = await _http_request(
            "POST",
            url,
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=body,
        )
        payload = _json_or_provider_error(response, {200, 201})
        upload_url = payload.get("uploadUrl")
        if not isinstance(upload_url, str):
            raise CloudProviderError()
        return _validate_upload_session_url(self.id, upload_url)

    async def _send_chunks(self, upload_url: str, data: bytes, filename: str) -> dict[str, Any]:
        final_payload: dict[str, Any] | None = None
        total = len(data)
        for start in range(0, total, ONEDRIVE_CHUNK_SIZE):
            chunk = data[start : start + ONEDRIVE_CHUNK_SIZE]
            end = start + len(chunk) - 1
            response = await _http_request(
                "PUT",
                upload_url,
                headers={
                    "Content-Length": str(len(chunk)),
                    "Content-Range": f"bytes {start}-{end}/{total}",
                    "Content-Type": PDF_MIME,
                },
                content=chunk,
            )
            if response.status_code == 202:
                continue
            final_payload = _json_or_provider_error(response, {200, 201})
        if final_payload is None:
            raise CloudProviderError()
        return _normalize_written_item(final_payload, filename)

    async def upload_pdf(self, access_token: str, data: bytes, filename: str, folder_id: str) -> dict[str, Any]:
        encoded_name = quote(filename, safe="")
        if folder_id == "root":
            url = f"https://graph.microsoft.com/v1.0/me/drive/root:/{encoded_name}:/createUploadSession"
        else:
            url = (
                "https://graph.microsoft.com/v1.0/me/drive/items/"
                f"{quote(folder_id, safe='')}:/{encoded_name}:/createUploadSession"
            )
        upload_url = await self._upload_session(
            access_token,
            url,
            {"item": {"@microsoft.graph.conflictBehavior": "rename", "name": filename}},
        )
        return await self._send_chunks(upload_url, data, filename)

    async def replace_pdf(self, access_token: str, data: bytes, item_id: str) -> dict[str, Any]:
        metadata = await self._metadata(access_token, item_id)
        name = metadata.get("name") if isinstance(metadata.get("name"), str) else "solyan-cloud.pdf"
        _validate_filename(name)
        upload_url = await self._upload_session(
            access_token,
            f"https://graph.microsoft.com/v1.0/me/drive/items/{quote(item_id, safe='')}/createUploadSession",
            {"item": {"@microsoft.graph.conflictBehavior": "replace"}},
        )
        return await self._send_chunks(upload_url, data, name)


def _normalize_written_item(payload: dict[str, Any], fallback_name: str) -> dict[str, Any]:
    item_id = payload.get("id") if isinstance(payload.get("id"), str) else ""
    name = payload.get("name") if isinstance(payload.get("name"), str) else fallback_name
    size = payload.get("size")
    if isinstance(size, str) and size.isdigit():
        size = int(size)
    if not isinstance(size, int):
        size = None
    return {
        "id": item_id,
        "name": name,
        "kind": "pdf",
        "size": size,
        "modified_at": payload.get("modifiedTime") or payload.get("lastModifiedDateTime"),
        "web_url": payload.get("webViewLink") or payload.get("webUrl"),
    }


def _provider(provider_id: str) -> StorageProvider:
    if provider_id == "google":
        return GoogleDriveProvider()
    if provider_id == "onedrive":
        return OneDriveProvider()
    raise HTTPException(status_code=404, detail="Cloud storage provider is not supported")


def _provider_info(provider: StorageProvider, session_id: str | None) -> dict[str, Any]:
    token = _VAULT.get_token(session_id, provider.id) if session_id else None
    connected = bool(token and (token.expires_at > time.time() or token.refresh_token))
    info: dict[str, Any] = {
        "id": provider.id,
        "label": provider.label,
        "configured": provider.configured,
        "connected": connected,
        "scopes": list(provider.scopes),
        "supports": {"list": True, "download": True, "upload": True, "replace": True},
    }
    if isinstance(provider, GoogleDriveProvider):
        info["picker_configured"] = provider.picker_configured
        info["least_privilege_scope"] = "drive.file"
    return info


async def _fresh_token(session_id: str, provider: StorageProvider) -> OAuthToken:
    token = _VAULT.get_token(session_id, provider.id)
    if token is None:
        raise HTTPException(status_code=401, detail="Cloud storage provider is not connected")
    if token.expires_at > time.time() + 60:
        return token
    if not token.refresh_token:
        _VAULT.remove_provider(session_id, provider.id)
        raise HTTPException(status_code=401, detail="Cloud storage session expired; reconnect the provider")
    try:
        refreshed = await provider.refresh(token.refresh_token)
    except (CloudProviderError, httpx.HTTPError):
        _VAULT.remove_provider(session_id, provider.id)
        raise HTTPException(status_code=401, detail="Cloud storage session expired; reconnect the provider")
    _VAULT.set_token(session_id, provider.id, refreshed)
    return refreshed


def _handle_provider_error(session_id: str, provider_id: str, exc: Exception) -> None:
    if isinstance(exc, CloudProviderError) and exc.auth_expired:
        _VAULT.remove_provider(session_id, provider_id)
        raise HTTPException(status_code=401, detail="Cloud storage authorization expired; reconnect the provider") from exc
    if isinstance(exc, HTTPException):
        raise exc
    raise HTTPException(status_code=502, detail="Cloud storage provider request failed") from exc


async def _read_pdf_upload(file: UploadFile) -> tuple[bytes, str]:
    filename = _validate_filename(file.filename or "solyan-cloud.pdf")
    data = await file.read(_max_file_size() + 1)
    _validate_pdf_bytes(data)
    return data, filename


@router.get("/providers")
def providers(request: Request) -> JSONResponse:
    session_id = _session_id(request)
    payload = {
        "providers": [
            _provider_info(GoogleDriveProvider(), session_id),
            _provider_info(OneDriveProvider(), session_id),
        ],
        "max_file_size": _max_file_size(),
        "session_storage": "server-memory-ephemeral",
        "credentials_required_for_build": False,
    }
    return _no_store(JSONResponse(payload))  # type: ignore[return-value]


@router.get("/{provider_id}/auth/start")
def auth_start(
    provider_id: str,
    request: Request,
    return_path: str = Query(default="/cloud-storage", max_length=512),
) -> RedirectResponse:
    provider = _provider(provider_id)
    if not provider.configured:
        raise HTTPException(status_code=503, detail="Cloud storage provider is not configured")
    session_id = _session_id(request) or _new_session_id()
    verifier = _pkce_verifier()
    return_path = _safe_return_path(return_path)
    state = _VAULT.issue_state(provider.id, session_id, verifier, return_path)
    redirect_uri = f"{_callback_base()}/storage/{provider.id}/auth/callback"
    target = provider.authorization_url(redirect_uri, state, _pkce_challenge(verifier))
    response = RedirectResponse(target, status_code=307)
    _set_session_cookie(response, session_id)
    return _no_store(response)  # type: ignore[return-value]


@router.get("/{provider_id}/auth/callback")
async def auth_callback(
    provider_id: str,
    state: str = Query(..., min_length=16, max_length=256),
    code: str | None = Query(default=None, max_length=4096),
    error: str | None = Query(default=None, max_length=256),
) -> RedirectResponse:
    provider = _provider(provider_id)
    attempt = _VAULT.consume_state(provider.id, state)
    if error or not code:
        response = RedirectResponse(_frontend_redirect(attempt.return_path, provider.id, error="oauth_denied"), status_code=303)
        _set_session_cookie(response, attempt.session_id)
        return _no_store(response)  # type: ignore[return-value]
    redirect_uri = f"{_callback_base()}/storage/{provider.id}/auth/callback"
    try:
        token = await provider.exchange_code(code, attempt.verifier, redirect_uri)
    except (CloudProviderError, httpx.HTTPError):
        response = RedirectResponse(_frontend_redirect(attempt.return_path, provider.id, error="oauth_exchange_failed"), status_code=303)
        _set_session_cookie(response, attempt.session_id)
        return _no_store(response)  # type: ignore[return-value]
    _VAULT.set_token(attempt.session_id, provider.id, token)
    response = RedirectResponse(_frontend_redirect(attempt.return_path, provider.id, connected=True), status_code=303)
    _set_session_cookie(response, attempt.session_id)
    return _no_store(response)  # type: ignore[return-value]


@router.post("/{provider_id}/logout")
def logout(provider_id: str, request: Request) -> JSONResponse:
    _require_mutation_origin(request)
    provider = _provider(provider_id)
    session_id = _session_id(request)
    if session_id:
        _VAULT.remove_provider(session_id, provider.id)
    return _no_store(JSONResponse({"ok": True, "provider": provider.id}))  # type: ignore[return-value]


@router.get("/{provider_id}/files")
async def list_files(
    provider_id: str,
    request: Request,
    folder_id: str = Query(default="root", min_length=1, max_length=512),
) -> JSONResponse:
    provider = _provider(provider_id)
    session_id = _session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Cloud storage provider is not connected")
    folder_id = "root" if folder_id == "root" else _validate_item_id(folder_id)
    token = await _fresh_token(session_id, provider)
    try:
        items = await provider.list_files(token.access_token, folder_id)
    except (CloudProviderError, httpx.HTTPError, HTTPException) as exc:
        _handle_provider_error(session_id, provider.id, exc)
    return _no_store(JSONResponse({"provider": provider.id, "folder_id": folder_id, "items": items}))  # type: ignore[return-value]


@router.get("/{provider_id}/files/{item_id}")
async def download_file(provider_id: str, item_id: str, request: Request) -> Response:
    provider = _provider(provider_id)
    session_id = _session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Cloud storage provider is not connected")
    item_id = _validate_item_id(item_id)
    token = await _fresh_token(session_id, provider)
    try:
        data, filename = await provider.download_pdf(token.access_token, item_id)
    except (CloudProviderError, httpx.HTTPError, HTTPException) as exc:
        _handle_provider_error(session_id, provider.id, exc)
    response = Response(
        content=data,
        media_type=PDF_MIME,
        headers={"Content-Disposition": _download_disposition(filename), "Cache-Control": "no-store"},
    )
    return response


@router.post("/{provider_id}/files")
async def upload_file(
    provider_id: str,
    request: Request,
    file: UploadFile = File(...),
    folder_id: str = Form(default="root", min_length=1, max_length=512),
) -> JSONResponse:
    _require_mutation_origin(request)
    provider = _provider(provider_id)
    session_id = _session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Cloud storage provider is not connected")
    folder_id = "root" if folder_id == "root" else _validate_item_id(folder_id)
    data, filename = await _read_pdf_upload(file)
    token = await _fresh_token(session_id, provider)
    try:
        item = await provider.upload_pdf(token.access_token, data, filename, folder_id)
    except (CloudProviderError, httpx.HTTPError, HTTPException) as exc:
        _handle_provider_error(session_id, provider.id, exc)
    return _no_store(JSONResponse({"provider": provider.id, "item": item}, status_code=201))  # type: ignore[return-value]


@router.post("/{provider_id}/files/{item_id}/replace")
async def replace_file(
    provider_id: str,
    item_id: str,
    request: Request,
    file: UploadFile = File(...),
) -> JSONResponse:
    _require_mutation_origin(request)
    provider = _provider(provider_id)
    session_id = _session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Cloud storage provider is not connected")
    item_id = _validate_item_id(item_id)
    data, _ = await _read_pdf_upload(file)
    token = await _fresh_token(session_id, provider)
    try:
        item = await provider.replace_pdf(token.access_token, data, item_id)
    except (CloudProviderError, httpx.HTTPError, HTTPException) as exc:
        _handle_provider_error(session_id, provider.id, exc)
    return _no_store(JSONResponse({"provider": provider.id, "item": item}))  # type: ignore[return-value]


@router.get("/google/picker-token")
async def google_picker_token(request: Request) -> JSONResponse:
    provider = GoogleDriveProvider()
    if not provider.picker_configured:
        raise HTTPException(status_code=409, detail="Google Picker is not configured")
    session_id = _session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Google Drive is not connected")
    token = await _fresh_token(session_id, provider)
    payload = {
        "access_token": token.access_token,
        "expires_in": max(0, int(token.expires_at - time.time())),
        "api_key": os.getenv("GOOGLE_PICKER_API_KEY", ""),
        "app_id": os.getenv("GOOGLE_PICKER_APP_ID", ""),
        "scope": "drive.file",
        "browser_storage": "memory-only",
    }
    return _no_store(JSONResponse(payload))  # type: ignore[return-value]


# Explicit test hook used only by the deterministic mock-provider contract gate.
def _reset_for_tests() -> None:
    _VAULT.reset_for_tests()
