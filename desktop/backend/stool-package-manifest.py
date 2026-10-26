"""Identify an NSIS candidate without claiming functional/release acceptance."""
import argparse
import hashlib
import json
import os
from pathlib import Path


def manifest(installer: Path, commit: str) -> dict:
    if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
        raise ValueError("Exact source commit required")
    with installer.open("rb") as stream:
        if stream.read(2) != b"MZ":
            raise ValueError("Installer is not a Windows executable")
        stream.seek(0)
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"schema": 1, "repo": "solyan842/SolYan-PDF", "source_commit": commit,
            "installer_name": installer.name, "installer_bytes": installer.stat().st_size,
            "installer_sha256": digest, "scope": "packaging-only",
            "functional_acceptance": "not-run", "release_accepted": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("installer", type=Path)
    parser.add_argument("--commit", default=os.environ.get("GITHUB_SHA", ""))
    parser.add_argument("--output", type=Path, default=Path("artifacts"))
    args = parser.parse_args()
    result = manifest(args.installer, args.commit)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "stool-package.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    (args.output / "sTool-PDF-Windows-x64.sha256").write_text(
        f"{result['installer_sha256']} *{args.installer.name}\n", encoding="ascii")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
