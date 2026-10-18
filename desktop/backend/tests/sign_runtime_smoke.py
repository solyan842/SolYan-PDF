"""Real PKCS#12 signing and offline validation through the frozen Windows sidecar."""
from __future__ import annotations

import argparse
import io
import json
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from pypdf import PdfWriter

TOKEN = "local-sign-ci-token-0123456789abcdef"
PASSWORD = b"CI-only-testing-passphrase"
AUTH = {"X-SolYan-Desktop-Token": TOKEN}


def make_fixtures():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SolYan PDF Test Only")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    credential = pkcs12.serialize_key_and_certificates(
        b"solyan-ci", key, cert, None, serialization.BestAvailableEncryption(PASSWORD)
    )
    result = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer.write(result)
    return result.getvalue(), credential


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", required=True)
    parser.add_argument("--output", default="artifacts")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    pdf, credential = make_fixtures()

    # Do not write ephemeral certificate, private key or P12 to diagnostics.
    with (output / "sign-sidecar.stdout.log").open("w", encoding="utf-8") as stdout:
        with (output / "sign-sidecar.stderr.log").open("w", encoding="utf-8") as stderr:
            proc = subprocess.Popen(
                [str(Path(args.exe).resolve()), "--port", str(port), "--token", TOKEN],
                stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
            )
            try:
                with httpx.Client(trust_env=False, timeout=60.0) as client:
                    for _ in range(180):
                        if proc.poll() is not None:
                            raise RuntimeError(f"Signing executable exited before health: {proc.returncode}")
                        try:
                            ready = client.get(f"{base}/health", headers=AUTH, timeout=2.0)
                            if ready.status_code == 200:
                                break
                        except httpx.HTTPError:
                            pass
                        time.sleep(0.5)
                    else:
                        raise RuntimeError("Signing sidecar health timeout")
                    assert ready.json().get("engine") == "pyHanko", ready.text
                    assert client.get(f"{base}/health").status_code == 401
                    assert client.get(f"{base}/health", headers={"X-SolYan-Desktop-Token": "bad"}).status_code == 401
                    files = {
                        "file": ("test.pdf", pdf, "application/pdf"),
                        "certificate": ("test.p12", credential, "application/x-pkcs12"),
                    }
                    unauthorized = client.post(f"{base}/sign/pkcs12", files=files)
                    assert unauthorized.status_code == 401, unauthorized.text
                    invalid = client.post(
                        f"{base}/sign/pkcs12", files=files, headers=AUTH,
                        data={"passphrase": "wrong-password"},
                    )
                    assert invalid.status_code == 422, invalid.text
                    signed = client.post(
                        f"{base}/sign/pkcs12", files=files, headers=AUTH,
                        data={"passphrase": PASSWORD.decode(), "field_name": "Signature1"},
                    )
                    assert signed.status_code == 200, signed.text[:2000]
                    assert signed.content.startswith(b"%PDF-")
                    assert b"/ByteRange" in signed.content
                    validated = client.post(
                        f"{base}/validate", headers=AUTH,
                        files={"file": ("signed.pdf", signed.content, "application/pdf")},
                        timeout=120.0,
                    )
                    assert validated.status_code == 200, validated.text[:2000]
                    payload = validated.json()
                    assert payload["signature_count"] == 1, payload
                    assert payload["all_cryptographically_valid"] is True, payload
                    assert payload["network_fetching"] is False, payload
                    # A self-signed test cert must NOT be presented as trusted.
                    assert payload["all_trusted"] is False, payload
                    sanitized = {
                        "engine": ready.json()["engine"],
                        "unauthorized_health": 401,
                        "unauthorized_sign": unauthorized.status_code,
                        "wrong_passphrase": invalid.status_code,
                        "signed_pdf_bytes": len(signed.content),
                        "signature_count": payload["signature_count"],
                        "cryptographically_valid": payload["all_cryptographically_valid"],
                        "trusted": payload["all_trusted"],
                        "network_fetching": payload["network_fetching"],
                    }
                    (output / "sign-smoke-result.json").write_text(
                        json.dumps(sanitized, indent=2) + "\n", encoding="utf-8"
                    )
                    print(json.dumps(sanitized))
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=5)


if __name__ == "__main__":
    main()
