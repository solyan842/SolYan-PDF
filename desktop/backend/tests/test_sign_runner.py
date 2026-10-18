"""Contract tests that do not need a user certificate or network access."""
from __future__ import annotations

import unittest
from fastapi.testclient import TestClient

from desktop.backend.runner import DesktopTokenMiddleware
from desktop.backend.sign_runner import _bootstrap_sign_service

TOKEN = "solyan-sign-ci-token-0123456789abcdef"
HEADERS = {"X-SolYan-Desktop-Token": TOKEN}


class SignSidecarContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(DesktopTokenMiddleware(_bootstrap_sign_service(), TOKEN))

    def test_health_requires_token(self):
        self.assertEqual(self.client.get("/health").status_code, 401)
        self.assertEqual(self.client.get("/health", headers={"X-SolYan-Desktop-Token": "bad"}).status_code, 401)
        response = self.client.get("/health", headers=HEADERS)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json().get("engine"), "pyHanko")

    def test_sign_requires_token(self):
        response = self.client.post("/sign/pkcs12")
        self.assertEqual(response.status_code, 401)
        # An invalid payload must be rejected without exposing the sidecar.
        response = self.client.post("/sign/pkcs12", headers=HEADERS)
        self.assertEqual(response.status_code, 422)

    def test_validate_requires_token(self):
        response = self.client.post("/validate")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
