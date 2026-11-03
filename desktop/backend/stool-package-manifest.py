#!/usr/bin/env python3
"""Write immutable checksum and source identity for a Windows sTool installer."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path


REPOSITORY = "solyan842/SolYan-PDF"
MANIFEST_NAME = "stool-package.json"
CHECKSUM_NAME = "sTool-PDF-Windows-x64.sha256"


def atomic_write(path: Path, content: str, *, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding=encoding, newline="\n", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as stream:
            temp_name = stream.name
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def create_package_manifest(installer_path: Path, output_dir: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise ValueError("GITHUB_SHA must be a full 40-character lowercase commit SHA")

    installer = installer_path.expanduser().resolve(strict=True)
    if not installer.is_file() or installer.suffix.lower() != ".exe":
        raise ValueError("installer path must point to a Windows .exe file")
    size = installer.stat().st_size
    if size <= 0:
        raise ValueError("installer file is empty")

    digest = hashlib.sha256()
    with installer.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    sha256 = digest.hexdigest()

    manifest: dict[str, object] = {
        "repo": REPOSITORY,
        "source_commit": source_commit,
        "installer_name": installer.name,
        "installer_bytes": size,
        "installer_sha256": sha256,
    }
    output = output_dir.expanduser().resolve()
    atomic_write(output / MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    atomic_write(output / CHECKSUM_NAME, f"{sha256} *{installer.name}\n", encoding="ascii")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", type=Path, help="path to the single packaged NSIS installer")
    parser.add_argument("--output-directory", type=Path, default=Path("artifacts"))
    args = parser.parse_args()
    try:
        manifest = create_package_manifest(args.installer, args.output_directory, os.environ.get("GITHUB_SHA", ""))
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
