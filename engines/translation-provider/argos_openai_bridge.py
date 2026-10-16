from __future__ import annotations

import argparse
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import argostranslate.translate

SOURCE_MARKER = "Source Text: "
RESULT_MARKER = "\n\nTranslated Text:"
MAX_REQUEST_BYTES = 2 * 1024 * 1024


def _extract_source(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if str(message.get("role", "")) != "user":
            continue
        content = message.get("content", "")
        if not isinstance(content, str):
            continue
        start = content.rfind(SOURCE_MARKER)
        if start < 0:
            continue
        source = content[start + len(SOURCE_MARKER) :]
        end = source.rfind(RESULT_MARKER)
        if end >= 0:
            source = source[:end]
        source = source.strip()
        if source:
            return source
    raise ValueError("OpenAI-compatible request does not contain PDFMathTranslate source text")


def _completion(model: str, translated: str) -> bytes:
    payload = {
        "id": "solyan-argos-local",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": translated},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class ArgosOpenAIHandler(BaseHTTPRequestHandler):
    source_language = "en"
    target_language = "vi"

    def log_message(self, format: str, *args: object) -> None:
        return

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.rstrip("/")
        if path == "/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "provider": "argos",
                    "source_language": self.source_language,
                    "target_language": self.target_language,
                },
            )
            return
        if path == "/v1/models":
            self._send_json(
                200,
                {
                    "object": "list",
                    "data": [
                        {
                            "id": f"argos-{self.source_language}-{self.target_language}",
                            "object": "model",
                            "owned_by": "local",
                        }
                    ],
                },
            )
            return
        self._send_json(404, {"error": {"message": "not found", "type": "not_found"}})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/v1/chat/completions":
            self._send_json(404, {"error": {"message": "not found", "type": "not_found"}})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("invalid request size")
            request = json.loads(self.rfile.read(length).decode("utf-8"))
            if request.get("stream"):
                raise ValueError("streaming is not supported by the local Argos bridge")
            messages = request.get("messages")
            if not isinstance(messages, list):
                raise ValueError("messages must be a list")
            source = _extract_source(messages)
            translated = argostranslate.translate.translate(
                source,
                self.source_language,
                self.target_language,
            ).strip()
            if not translated:
                raise ValueError("Argos returned an empty translation")
            body = _completion(str(request.get("model") or "argos-local"), translated)
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json(400, {"error": {"message": str(exc), "type": "invalid_request"}})
            return
        except Exception:
            self._send_json(500, {"error": {"message": "local translation failed", "type": "server_error"}})
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local Argos OpenAI-compatible translation bridge")
    parser.add_argument("--host", default=os.getenv("ARGOS_BRIDGE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("ARGOS_BRIDGE_PORT", "18080")))
    parser.add_argument("--source-language", default=os.getenv("ARGOS_SOURCE_LANGUAGE", "en"))
    parser.add_argument("--target-language", default=os.getenv("ARGOS_TARGET_LANGUAGE", "vi"))
    args = parser.parse_args()

    loopback_hosts = {"127.0.0.1", "::1", "localhost"}
    if args.host not in loopback_hosts and os.getenv("ARGOS_BRIDGE_ALLOW_NETWORK", "0") != "1":
        raise SystemExit(
            "Non-loopback bind refused. Set ARGOS_BRIDGE_ALLOW_NETWORK=1 only on a trusted private service network."
        )

    ArgosOpenAIHandler.source_language = args.source_language
    ArgosOpenAIHandler.target_language = args.target_language
    server = ThreadingHTTPServer((args.host, args.port), ArgosOpenAIHandler)
    print(
        f"Argos OpenAI-compatible bridge listening on {args.host}:{args.port} "
        f"for {args.source_language}->{args.target_language}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
