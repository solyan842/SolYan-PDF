from __future__ import annotations

import ipaddress
import os
import socket


def ping_command(host: str, *, windows: bool | None = None) -> list[str]:
    use_windows = os.name == "nt" if windows is None else windows
    if use_windows:
        return ["ping", "-n", "4", "-w", "2000", host]
    return ["ping", "-c", "4", "-W", "2", host]


def local_ip_addresses(hostname: str | None = None) -> list[str]:
    name = hostname or socket.gethostname()
    try:
        records = socket.getaddrinfo(name, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return []
    addresses: set[str] = set()
    for record in records:
        raw = str(record[4][0]).split("%", 1)[0]
        try:
            address = ipaddress.ip_address(raw)
        except ValueError:
            continue
        if not address.is_loopback and not address.is_unspecified and not address.is_multicast:
            addresses.add(str(address))
    return sorted(addresses)

