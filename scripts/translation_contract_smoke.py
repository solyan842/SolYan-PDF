from __future__ import annotations

import asyncio
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ["TRANSLATION_SERVICE_URL"] = "http://127.0.0.1:11008"
os.environ["TRANSLATION_DEFAULT_SERVICE"] = "argos"
os.environ["TRANSLATION_ALLOWED_SERVICES"] = "argos,ollama,openai,deepl,google,bing"
os.environ["TRANSLATION_LOCAL_SERVICES"] = "argos,ollama"
os.environ["TRANSLATION_TIMEOUT_SECONDS"] = "10"
os.environ["TRANSLATION_POLL_INTERVAL_SECONDS"] = "0.01"

import httpx

from backend.app.main import app


MOCK_PDF = b"%PDF-1.4\n% SolYan translation mock\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


class FakeTranslationHandler(BaseHTTPRequestHandler):
    submitted_payloads: list[dict] = []
    deleted_tasks: list[str] = []

    def log_message(self, format: str, *args: object) -> None:
        return

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_pdf(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(MOCK_PDF)))
        self.end_headers()
        self.wfile.write(MOCK_PDF)

    def do_POST(self) -> None:
        if self.path != "/v1/translate":
            self._send_json(404, {"detail": "not found"})
            return

        content_type = self.headers.get("Content-Type", "")
        boundary_marker = "boundary="
        if boundary_marker not in content_type:
            self._send_json(400, {"detail": "multipart required"})
            return
        boundary = content_type.split(boundary_marker, 1)[1].strip().strip('"').encode("ascii")
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)

        payload = None
        for part in body.split(b"--" + boundary):
            if b'name="data"' not in part:
                continue
            _, _, value = part.partition(b"\r\n\r\n")
            value = value.rsplit(b"\r\n", 1)[0]
            payload = json.loads(value.decode("utf-8"))
            break
        if not isinstance(payload, dict):
            self._send_json(400, {"detail": "missing data"})
            return

        self.submitted_payloads.append(payload)
        self._send_json(200, {"id": f"task-{len(self.submitted_payloads)}"})

    def do_GET(self) -> None:
        if self.path.endswith("/mono") or self.path.endswith("/dual"):
            self._send_pdf()
            return
        if self.path.startswith("/v1/translate/task-"):
            self._send_json(200, {"state": "SUCCESS"})
            return
        self._send_json(404, {"detail": "not found"})

    def do_DELETE(self) -> None:
        if self.path.startswith("/v1/translate/task-"):
            self.deleted_tasks.append(self.path.rsplit("/", 1)[-1])
            self._send_json(200, {"ok": True})
            return
        self._send_json(404, {"detail": "not found"})


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {response.status_code}: {response.text[:1000]}")


async def run_contract() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://solyan.test") as client:
        capabilities = await client.get("/pdf/translate/capabilities")
        assert_status(capabilities, 200, "capabilities")
        caps = capabilities.json()
        assert caps["default_service"] == "argos"
        assert caps["privacy"]["api_keys_are_not_accepted_from_browser"] is True
        assert "local_classification_is_operator_configured" in caps["privacy"]
        services = {item["id"]: item for item in caps["services"]}
        assert services["argos"]["local"] is True
        assert services["argos"]["requires_operator_configuration"] is True
        assert services["argos"]["requires_credentials"] is False
        assert services["openai"]["local"] is False
        assert services["openai"]["requires_credentials"] is True

        translated = await client.post(
            "/pdf/translate",
            files={"file": ("input.pdf", MOCK_PDF, "application/pdf")},
            data={
                "source_language": "en",
                "target_language": "vi",
                "service": "argos",
                "output_mode": "translated",
                "thread_count": "3",
            },
        )
        assert_status(translated, 200, "translated PDF")
        assert translated.content.startswith(b"%PDF-")
        assert translated.headers["x-solyan-translation-service"] == "argos"
        assert translated.headers["x-solyan-translation-mode"] == "translated"
        assert translated.headers["x-solyan-translation-local"] == "1"

        bilingual = await client.post(
            "/pdf/translate",
            files={"file": ("input.pdf", MOCK_PDF, "application/pdf")},
            data={
                "source_language": "vi",
                "target_language": "en",
                "service": "openai",
                "output_mode": "bilingual",
                "thread_count": "2",
            },
        )
        assert_status(bilingual, 200, "bilingual PDF")
        assert bilingual.content.startswith(b"%PDF-")
        assert bilingual.headers["x-solyan-translation-service"] == "openai"
        assert bilingual.headers["x-solyan-translation-mode"] == "bilingual"
        assert bilingual.headers["x-solyan-translation-local"] == "0"

        same_language = await client.post(
            "/pdf/translate",
            files={"file": ("input.pdf", MOCK_PDF, "application/pdf")},
            data={"source_language": "vi", "target_language": "vi", "service": "argos"},
        )
        assert_status(same_language, 422, "same-language rejection")

        unknown_service = await client.post(
            "/pdf/translate",
            files={"file": ("input.pdf", MOCK_PDF, "application/pdf")},
            data={"source_language": "en", "target_language": "vi", "service": "not-allowed"},
        )
        assert_status(unknown_service, 422, "service allow-list")

        non_pdf = await client.post(
            "/pdf/translate",
            files={"file": ("input.txt", b"not a pdf", "text/plain")},
            data={"source_language": "en", "target_language": "vi", "service": "argos"},
        )
        assert_status(non_pdf, 400, "non-PDF rejection")

    assert len(FakeTranslationHandler.submitted_payloads) == 2
    assert FakeTranslationHandler.submitted_payloads[0] == {
        "lang_in": "en",
        "lang_out": "vi",
        "service": "argos",
        "thread": 3,
    }
    assert FakeTranslationHandler.submitted_payloads[1] == {
        "lang_in": "vi",
        "lang_out": "en",
        "service": "openai",
        "thread": 2,
    }
    assert len(FakeTranslationHandler.deleted_tasks) == 2
    print("translation contract smoke: PASS")
    print("validated: capabilities, mono, dual, payload, cleanup, privacy classification, input rejection")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 11008), FakeTranslationHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        asyncio.run(run_contract())
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
