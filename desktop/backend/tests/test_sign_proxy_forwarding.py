"""Ensure Windows proxy forwards only per-launch signing token, no web regression."""
from __future__ import annotations

import io
import unittest
from unittest.mock import Mock, patch

from fastapi import UploadFile
from backend.app import sign_proxy


def pdf_upload() -> UploadFile:
    return UploadFile(filename="sample.pdf", file=io.BytesIO(b"%PDF-1.4\n1 0 obj\n"))


def credential_upload() -> UploadFile:
    return UploadFile(filename="sample.p12", file=io.BytesIO(b"private dummy test"))


class SignProxyForwarding(unittest.TestCase):
    def test_no_header_for_normal_web_backend(self) -> None:
        with patch.object(sign_proxy, "SIGN_SERVICE_TOKEN", ""):
            self.assertEqual(sign_proxy._sign_auth_headers(), {})

    def test_per_launch_token_is_used_for_health(self) -> None:
        with patch.object(sign_proxy, "SIGN_SERVICE_TOKEN", "runtime-signing-test-token"):
            with patch.object(sign_proxy.httpx, "get") as get:
                result = Mock()
                result.json.return_value = {"status": "ok", "engine": "pyHanko"}
                get.return_value = result
                self.assertEqual(sign_proxy.sign_health()["engine"], "pyHanko")
                self.assertEqual(get.call_args.kwargs["headers"],
                                 {"X-SolYan-Desktop-Token": "runtime-signing-test-token"})

    def test_token_reaches_both_sign_and_validate(self) -> None:
        with patch.object(sign_proxy, "SIGN_SERVICE_TOKEN", "runtime-signing-test-token"):
            with patch.object(sign_proxy.httpx, "Client") as client_factory:
                client = client_factory.return_value.__enter__.return_value
                response = Mock()
                response.status_code = 200
                response.content = b"%PDF-1.4\nsigned"
                response.json.return_value = {"signature_count": 1}
                client.post.return_value = response
                out = sign_proxy.sign_pkcs12(
                    file=pdf_upload(), certificate=credential_upload(), passphrase="test",
                    field_name="Signature1", reason="", location="", certify=False,
                    docmdp_permission="fill_forms"
                )
                self.assertTrue(out.body.startswith(b"%PDF-"))
                self.assertEqual(client.post.call_args.kwargs["headers"],
                                 {"X-SolYan-Desktop-Token": "runtime-signing-test-token"})
                out = sign_proxy.validate_pdf_signatures(file=pdf_upload())
                self.assertIn(b"signature_count", out.body)
                self.assertEqual(client.post.call_args.kwargs["headers"],
                                 {"X-SolYan-Desktop-Token": "runtime-signing-test-token"})


if __name__ == "__main__":
    unittest.main()
