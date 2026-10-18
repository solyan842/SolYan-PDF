"""End-to-end frozen Windows PDF/A sidecar and token isolation smoke."""
from __future__ import annotations

import argparse
import io
import json
import socket
import subprocess
import time
from pathlib import Path

import httpx
import pikepdf
from pypdf import PdfWriter

from frozen_smoke_process import stop_frozen_sidecar

TOKEN = "solyan-archive-ci-token-0123456789abcdef"
HEADERS = {"X-SolYan-Desktop-Token": TOKEN}


def port_available() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", required=True)
    parser.add_argument("--output", default="artifacts")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    original = io.BytesIO()
    writer.write(original)

    port = port_available()
    url = f"http://127.0.0.1:{port}"
    with (output / "pdfa-sidecar.stdout.log").open("w", encoding="utf-8") as stdout:
        with (output / "pdfa-sidecar.stderr.log").open("w", encoding="utf-8") as stderr:
            proc = subprocess.Popen(
                [str(Path(args.exe).resolve()), "--port", str(port), "--token", TOKEN],
                stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
            )
            try:
                with httpx.Client(trust_env=False, timeout=120) as client:
                    for _ in range(100):
                        if proc.poll() is not None:
                            raise RuntimeError(f"Archive process exited before health: {proc.returncode}")
                        try:
                            health = client.get(f"{url}/health", headers=HEADERS, timeout=2.0)
                            if health.status_code == 200:
                                break
                        except httpx.HTTPError:
                            pass
                        time.sleep(0.5)
                    else:
                        raise RuntimeError("Frozen archive sidecar did not become healthy")
                    assert health.json()["engine"] == "OCRmyPDF", health.text
                    unauthenticated = client.get(f"{url}/health")
                    assert unauthenticated.status_code == 401
                    payload = {"file": ("source.pdf", original.getvalue(), "application/pdf")}
                    assert client.post(f"{url}/pdfa/internal", files=payload).status_code == 401
                    response = client.post(f"{url}/pdfa/internal", headers=HEADERS, files=payload, timeout=280)
                    assert response.status_code == 200, response.text[:2500]
                    assert response.content.startswith(b"%PDF-")
                    with pikepdf.open(io.BytesIO(response.content)) as pdf:
                        assert len(pdf.pages) == 1
                        assert "/Metadata" in pdf.Root
                        assert "/OutputIntents" in pdf.Root
                    result = {
                        "frozen_sidecar": "PASS",
                        "unauthorized_health": unauthenticated.status_code,
                        "pdfa_pages": 1,
                        "pdfa_output_bytes": len(response.content),
                        "ghostscript_fallback": False,
                    }
                    (output / "pdfa-frozen-smoke.json").write_text(
                        json.dumps(result, indent=2) + "\n", encoding="utf-8"
                    )
                    print(json.dumps(result))
            finally:
                stop_frozen_sidecar(proc, port)


if __name__ == "__main__":
    main()
