from __future__ import annotations

import ipaddress
import os
import re
import socket
import subprocess
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/net", tags=["Vietnamese Utilities"])

HOST_RE = re.compile(r"^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$")


class HostRequest(BaseModel):
    host: str = Field(min_length=1, max_length=253)


class KeywordRequest(BaseModel):
    keyword: str = Field(min_length=1, max_length=200)
    domain: str = Field(min_length=1, max_length=253)


class DomainRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=253)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def normalize_host(value: str) -> str:
    raw = value.strip().lower().rstrip(".")
    if "://" in raw:
        raw = urlparse(raw).hostname or ""
    try:
        ipaddress.ip_address(raw)
        return raw
    except ValueError:
        pass
    if not HOST_RE.fullmatch(raw):
        raise HTTPException(status_code=400, detail="Host/domain không hợp lệ")
    return raw


def _is_public_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return ip.is_global


def _guard_ping_target(host: str) -> None:
    if _env_bool("ALLOW_PRIVATE_NETWORK_UTILITIES", False):
        return

    try:
        direct = ipaddress.ip_address(host)
    except ValueError:
        direct = None
    if direct is not None:
        if not direct.is_global:
            raise HTTPException(status_code=403, detail="Ping tới IP private/loopback/reserved bị chặn")
        return

    try:
        resolved = {item[4][0] for item in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        raise HTTPException(status_code=422, detail="Không phân giải được host") from exc
    if not resolved:
        raise HTTPException(status_code=422, detail="Không phân giải được host")
    if any(not _is_public_address(address) for address in resolved):
        raise HTTPException(status_code=403, detail="Host phân giải tới mạng private/loopback/reserved nên bị chặn")


@router.get("/ip")
def public_ip(request: Request) -> dict[str, str]:
    if _env_bool("TRUST_PROXY_HEADERS", False):
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            try:
                ipaddress.ip_address(forwarded)
                return {"ip": forwarded}
            except ValueError:
                pass
    return {"ip": request.client.host if request.client else "unknown"}


def _ping_command(host: str, *, windows: bool | None = None) -> list[str]:
    use_windows = os.name == "nt" if windows is None else windows
    if use_windows:
        return ["ping", "-n", "4", "-w", "2000", host]
    return ["ping", "-c", "4", "-W", "2", host]


@router.post("/ping")
def ping(payload: HostRequest) -> dict[str, object]:
    host = normalize_host(payload.host)
    _guard_ping_target(host)
    try:
        result = subprocess.run(
            _ping_command(host),
            capture_output=True,
            text=True,
            timeout=12,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=503, detail="Ping engine không khả dụng") from exc
    output = (result.stdout or result.stderr).strip()
    return {"host": host, "reachable": result.returncode == 0, "output": output[-3000:]}


@router.post("/keyword-position")
def keyword_position(payload: KeywordRequest) -> dict[str, object]:
    api_key = os.getenv("GOOGLE_CSE_API_KEY")
    cx = os.getenv("GOOGLE_CSE_CX")
    if not api_key or not cx:
        raise HTTPException(status_code=503, detail="Chưa cấu hình GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX")

    domain = normalize_host(payload.domain)
    position = 0
    with httpx.Client(timeout=12.0) as client:
        for start in range(1, 92, 10):
            response = client.get(
                "https://customsearch.googleapis.com/customsearch/v1",
                params={"key": api_key, "cx": cx, "q": payload.keyword, "start": start, "num": 10},
            )
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Google CSE error HTTP {response.status_code}")
            items = response.json().get("items", [])
            for offset, item in enumerate(items):
                position = start + offset
                found_host = (urlparse(item.get("link", "")).hostname or "").lower()
                if found_host == domain or found_host.endswith(f".{domain}"):
                    return {"keyword": payload.keyword, "domain": domain, "position": position, "url": item.get("link")}
            if len(items) < 10:
                break
    return {"keyword": payload.keyword, "domain": domain, "position": None, "checked": min(position, 100)}


@router.post("/site-rank")
def site_rank(payload: DomainRequest) -> dict[str, object]:
    domain = normalize_host(payload.domain)
    template = os.getenv("SITE_RANK_API_TEMPLATE", "https://tranco-list.eu/api/ranks/domain/{domain}")
    url = template.format(domain=domain)
    try:
        response = httpx.get(url, timeout=12.0)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Không lấy được dữ liệu xếp hạng website") from exc

    ranks = data.get("ranks") if isinstance(data, dict) else None
    latest = ranks[0] if isinstance(ranks, list) and ranks else None
    return {"domain": domain, "provider": "Tranco-compatible", "latest": latest, "raw": data if latest is None else None}
