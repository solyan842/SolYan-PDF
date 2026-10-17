from __future__ import annotations

import base64
import os
import re
import secrets
import threading
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, unquote, urlparse

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response

router = APIRouter(prefix="/storage/webdav", tags=["cloud-storage"])

COOKIE_NAME = "solyan_webdav_session"
PDF_MIME = "application/pdf"
DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024
_SAFE_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{20,160}$")
_SESSIONS: dict[str, float] = {}
_LOCK = threading.RLock()


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _session_ttl() -> int:
    return _bounded_int("CLOUD_STORAGE_SESSION_TTL_SECONDS", 86400, 300, 604800)


def _max_file_size() -> int:
    return _bounded_int("CLOUD_STORAGE_MAX_FILE_SIZE", DEFAULT_MAX_FILE_SIZE, 1024, DEFAULT_MAX_FILE_SIZE)


def _http_timeout() -> float:
    try:
        value = float(os.getenv("CLOUD_STORAGE_HTTP_TIMEOUT_SECONDS", "45"))
    except ValueError:
        value = 45.0
    return max(5.0, min(300.0, value))


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


def _cookie_secure() -> bool:
    return os.getenv("CLOUD_STORAGE_COOKIE_SECURE", "0").strip().lower() in {"1", "true", "yes", "on"}


def _cookie_samesite() -> str:
    value = os.getenv("CLOUD_STORAGE_COOKIE_SAMESITE", "lax").strip().lower()
    return value if value in {"lax", "strict", "none"} else "lax"


def _configured() -> bool:
    return bool(
        os.getenv("WEBDAV_BASE_URL", "").strip()
        and os.getenv("WEBDAV_USERNAME", "").strip()
        and os.getenv("WEBDAV_PASSWORD", "")
    )


def _verify_tls() -> bool:
    return os.getenv("WEBDAV_VERIFY_TLS", "1").strip().lower() not in {"0", "false", "no", "off"}


def _allow_insecure_http() -> bool:
    return os.getenv("WEBDAV_ALLOW_INSECURE_HTTP", "0").strip().lower() in {"1", "true", "yes", "on"}


def _base_url() -> str:
    raw = os.getenv("WEBDAV_BASE_URL", "").strip()
    if not raw:
        raise HTTPException(status_code=503, detail="WebDAV is not configured")
    parsed = urlparse(raw)
    allowed = {"https", "http"} if _allow_insecure_http() else {"https"}
    if parsed.scheme not in allowed or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=503, detail="WebDAV base URL is invalid")
    path = unquote(parsed.path or "/")
    path = "/" + "/".join(segment for segment in path.split("/") if segment)
    if path != "/":
        path += "/"
    encoded_path = "/".join(quote(segment, safe="") for segment in path.split("/") if segment)
    encoded_path = f"/{encoded_path}/" if encoded_path else "/"
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{parsed.hostname}{port}{encoded_path}"


def _normalize_rel(path: str) -> str:
    path = unquote(path).strip("/")
    if not path:
        return ""
    parts = path.split("/")
    if any(not part or part in {".", ".."} or "\\" in part or "\x00" in part or "\r" in part or "\n" in part for part in parts):
        raise HTTPException(status_code=422, detail="Invalid WebDAV path")
    value = "/".join(parts)
    if len(value.encode("utf-8")) > 4096:
        raise HTTPException(status_code=422, detail="WebDAV path is too long")
    return value


def _encode_id(path: str) -> str:
    normalized = _normalize_rel(path)
    if not normalized:
        return "root"
    return base64.urlsafe_b64encode(normalized.encode("utf-8")).decode("ascii").rstrip("=")


def _decode_id(item_id: str) -> str:
    if item_id == "root":
        return ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,5500}", item_id):
        raise HTTPException(status_code=422, detail="Invalid WebDAV item id")
    try:
        padded = item_id + ("=" * (-len(item_id) % 4))
        value = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid WebDAV item id") from exc
    return _normalize_rel(value)


def _url_for(path: str, *, directory: bool = False) -> str:
    base = _base_url()
    rel = _normalize_rel(path)
    if not rel:
        return base
    encoded = "/".join(quote(part, safe="") for part in rel.split("/"))
    url = base + encoded
    if directory:
        url += "/"
    return url


def _relative_from_href(href: str) -> str:
    href_parsed = urlparse(href)
    base = urlparse(_base_url())
    if href_parsed.scheme or href_parsed.netloc:
        if href_parsed.scheme != base.scheme or href_parsed.hostname != base.hostname or href_parsed.port != base.port:
            raise HTTPException(status_code=502, detail="WebDAV response escaped configured server")
        raw_path = href_parsed.path
    else:
        raw_path = href
    decoded = unquote(raw_path)
    base_path = unquote(base.path)
    if not decoded.startswith(base_path):
        raise HTTPException(status_code=502, detail="WebDAV response escaped configured root")
    return _normalize_rel(decoded[len(base_path):])


def _cleanup_sessions() -> None:
    now = time.time()
    with _LOCK:
        stale = [key for key, expires_at in _SESSIONS.items() if expires_at <= now]
        for key in stale:
            _SESSIONS.pop(key, None)


def _session_id(request: Request) -> str | None:
    _cleanup_sessions()
    value = request.cookies.get(COOKIE_NAME)
    if not value or not _SAFE_SESSION_RE.fullmatch(value):
        return None
    with _LOCK:
        expires_at = _SESSIONS.get(value)
        if not expires_at or expires_at <= time.time():
            _SESSIONS.pop(value, None)
            return None
        _SESSIONS[value] = time.time() + _session_ttl()
    return value


def _require_session(request: Request) -> str:
    session_id = _session_id(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="WebDAV is not connected in this browser session")
    return session_id


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        max_age=_session_ttl(),
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),  # type: ignore[arg-type]
        path="/",
    )


def _no_store(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    return response


def _validate_filename(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 255 or any(char in value for char in "/\\\x00\r\n"):
        raise HTTPException(status_code=422, detail="Invalid filename")
    if not value.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="WebDAV storage accepts PDF files only")
    return value


def _validate_pdf_bytes(data: bytes) -> None:
    if len(data) > _max_file_size():
        raise HTTPException(status_code=413, detail="Cloud PDF exceeds configured size limit")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="Cloud object is not a PDF")


def _download_disposition(filename: str) -> str:
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._") or "solyan-webdav.pdf"
    if not ascii_name.lower().endswith(".pdf"):
        ascii_name += ".pdf"
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'


async def _read_pdf_upload(file: UploadFile) -> tuple[bytes, str]:
    filename = _validate_filename(file.filename or "solyan-webdav.pdf")
    data = await file.read(_max_file_size() + 1)
    _validate_pdf_bytes(data)
    return data, filename


async def _webdav_request(method: str, url: str, **kwargs: Any) -> httpx.Response:
    if not _configured():
        raise HTTPException(status_code=503, detail="WebDAV is not configured")
    auth = httpx.BasicAuth(os.getenv("WEBDAV_USERNAME", ""), os.getenv("WEBDAV_PASSWORD", ""))
    async with httpx.AsyncClient(
        timeout=_http_timeout(),
        follow_redirects=False,
        verify=_verify_tls(),
        auth=auth,
    ) as client:
        return await client.request(method, url, **kwargs)


def _provider_failure(response: httpx.Response) -> None:
    if response.status_code in {401, 403}:
        raise HTTPException(status_code=502, detail="WebDAV credentials were rejected by the configured server")
    raise HTTPException(status_code=502, detail="WebDAV provider request failed")


async def _exists(url: str) -> bool:
    response = await _webdav_request("PROPFIND", url, headers={"Depth": "0"})
    if response.status_code in {200, 207}:
        return True
    if response.status_code == 404:
        return False
    _provider_failure(response)
    return False


@dataclass(frozen=True)
class DavItem:
    path: str
    name: str
    kind: str
    size: int | None
    modified_at: str | None


def _parse_multistatus(data: bytes, requested_folder: str) -> list[DavItem]:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise HTTPException(status_code=502, detail="WebDAV returned invalid XML") from exc
    ns = {"d": "DAV:"}
    items: list[DavItem] = []
    requested = _normalize_rel(requested_folder)
    for response in root.findall("d:response", ns):
        href = response.findtext("d:href", default="", namespaces=ns)
        if not href:
            continue
        path = _relative_from_href(href)
        if path == requested:
            continue
        prop = None
        for propstat in response.findall("d:propstat", ns):
            status = propstat.findtext("d:status", default="", namespaces=ns)
            if " 200 " in status:
                prop = propstat.find("d:prop", ns)
                break
        if prop is None:
            continue
        resource_type = prop.find("d:resourcetype", ns)
        is_folder = resource_type is not None and resource_type.find("d:collection", ns) is not None
        name = prop.findtext("d:displayname", default="", namespaces=ns).strip() or path.rsplit("/", 1)[-1]
        if not is_folder:
            content_type = prop.findtext("d:getcontenttype", default="", namespaces=ns).split(";", 1)[0].strip().lower()
            if content_type != PDF_MIME and not name.lower().endswith(".pdf"):
                continue
        size_text = prop.findtext("d:getcontentlength", default="", namespaces=ns)
        size = int(size_text) if size_text.isdigit() else None
        modified = prop.findtext("d:getlastmodified", default="", namespaces=ns) or None
        items.append(DavItem(path=path, name=name, kind="folder" if is_folder else "pdf", size=size, modified_at=modified))
    items.sort(key=lambda item: (0 if item.kind == "folder" else 1, item.name.casefold()))
    return items


def _item_payload(item: DavItem) -> dict[str, Any]:
    return {
        "id": _encode_id(item.path),
        "name": item.name,
        "kind": item.kind,
        "size": item.size,
        "modified_at": item.modified_at,
        "web_url": None,
    }


@router.get("/status")
def status(request: Request) -> JSONResponse:
    payload = {
        "id": "webdav",
        "label": "WebDAV",
        "configured": _configured(),
        "connected": _session_id(request) is not None,
        "scopes": [],
        "auth_mode": "server-configured",
        "credentials_server_side": True,
        "supports": {"list": True, "download": True, "upload": True, "replace": True},
    }
    return _no_store(JSONResponse(payload))  # type: ignore[return-value]


@router.post("/connect")
def connect(request: Request) -> JSONResponse:
    _require_mutation_origin(request)
    if not _configured():
        raise HTTPException(status_code=503, detail="WebDAV is not configured")
    _base_url()
    session_id = secrets.token_urlsafe(32)
    with _LOCK:
        _SESSIONS[session_id] = time.time() + _session_ttl()
    response = JSONResponse({"ok": True, "provider": "webdav"})
    _set_session_cookie(response, session_id)
    return _no_store(response)  # type: ignore[return-value]


@router.post("/logout")
def logout(request: Request) -> JSONResponse:
    _require_mutation_origin(request)
    session_id = request.cookies.get(COOKIE_NAME)
    if session_id:
        with _LOCK:
            _SESSIONS.pop(session_id, None)
    response = JSONResponse({"ok": True, "provider": "webdav"})
    response.delete_cookie(COOKIE_NAME, path="/")
    return _no_store(response)  # type: ignore[return-value]


@router.get("/files")
async def list_files(
    request: Request,
    folder_id: str = Query(default="root", min_length=1, max_length=5500),
) -> JSONResponse:
    _require_session(request)
    folder = _decode_id(folder_id)
    try:
        response = await _webdav_request(
            "PROPFIND",
            _url_for(folder, directory=True),
            headers={"Depth": "1", "Content-Type": "application/xml; charset=utf-8"},
            content=(
                b'<?xml version="1.0" encoding="utf-8"?>'
                b'<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/>'
                b'<d:getcontentlength/><d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>'
            ),
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="WebDAV provider request failed") from exc
    if response.status_code not in {200, 207}:
        _provider_failure(response)
    items = [_item_payload(item) for item in _parse_multistatus(response.content, folder)]
    return _no_store(JSONResponse({"provider": "webdav", "folder_id": folder_id, "items": items}))  # type: ignore[return-value]


@router.get("/files/{item_id}")
async def download_file(item_id: str, request: Request) -> Response:
    _require_session(request)
    path = _decode_id(item_id)
    filename = _validate_filename(path.rsplit("/", 1)[-1])
    try:
        response = await _webdav_request("GET", _url_for(path))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="WebDAV provider request failed") from exc
    if response.status_code != 200:
        _provider_failure(response)
    _validate_pdf_bytes(response.content)
    return Response(
        content=response.content,
        media_type=PDF_MIME,
        headers={"Content-Disposition": _download_disposition(filename), "Cache-Control": "no-store"},
    )


@router.post("/files", status_code=201)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    folder_id: str = Form(default="root", min_length=1, max_length=5500),
) -> JSONResponse:
    _require_mutation_origin(request)
    _require_session(request)
    folder = _decode_id(folder_id)
    data, filename = await _read_pdf_upload(file)
    path = _normalize_rel(f"{folder}/{filename}" if folder else filename)
    url = _url_for(path)
    try:
        if await _exists(url):
            raise HTTPException(status_code=409, detail="A WebDAV file with this name already exists; use explicit replace")
        response = await _webdav_request(
            "PUT",
            url,
            headers={"Content-Type": PDF_MIME, "Content-Length": str(len(data)), "If-None-Match": "*"},
            content=data,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="WebDAV provider request failed") from exc
    if response.status_code == 412:
        raise HTTPException(status_code=409, detail="A WebDAV file with this name already exists; use explicit replace")
    if response.status_code not in {200, 201, 204}:
        _provider_failure(response)
    item = DavItem(path=path, name=filename, kind="pdf", size=len(data), modified_at=None)
    return _no_store(JSONResponse({"provider": "webdav", "item": _item_payload(item)}, status_code=201))  # type: ignore[return-value]


@router.post("/files/{item_id}/replace")
async def replace_file(item_id: str, request: Request, file: UploadFile = File(...)) -> JSONResponse:
    _require_mutation_origin(request)
    _require_session(request)
    path = _decode_id(item_id)
    filename = _validate_filename(path.rsplit("/", 1)[-1])
    data, _ = await _read_pdf_upload(file)
    url = _url_for(path)
    try:
        if not await _exists(url):
            raise HTTPException(status_code=404, detail="WebDAV file was not found")
        response = await _webdav_request(
            "PUT",
            url,
            headers={"Content-Type": PDF_MIME, "Content-Length": str(len(data))},
            content=data,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="WebDAV provider request failed") from exc
    if response.status_code not in {200, 201, 204}:
        _provider_failure(response)
    item = DavItem(path=path, name=filename, kind="pdf", size=len(data), modified_at=None)
    return _no_store(JSONResponse({"provider": "webdav", "item": _item_payload(item)}))  # type: ignore[return-value]


def _reset_for_tests() -> None:
    with _LOCK:
        _SESSIONS.clear()
