"""Exercise production runner composition, including real Starlette CORS."""
import sys
import os
import types
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from desktop.backend import runner

ORIGIN='http://tauri.localhost'
TOKEN='test-only-core-token-0123456789abcdef'

class CoreCorsTests(unittest.TestCase):
    def setUp(self):
        backend=FastAPI()
        backend.add_middleware(CORSMiddleware,allow_origins=[ORIGIN],allow_methods=['*'],allow_headers=['*'])
        @backend.get('/health')
        def health():return {'ready':True}
        @backend.post('/pdf/test')
        def pdf():return {'result':'output'}
        # The runner starts no process here. Capture the actual app passed to
        # uvicorn, replacing only the heavyweight backend routes with a tiny API.
        with patch.dict(sys.modules,{'backend.app.main':types.SimpleNamespace(app=backend)}),patch.object(sys,'argv',['runner','--port','34567','--token',TOKEN]),patch.object(runner.uvicorn,'run') as serve:
            runner.main()
        self.client=TestClient(serve.call_args.args[0])

    def test_allowed_preflight_reaches_cors_without_a_secret(self):
        r=self.client.options('/pdf/test',headers={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-solyan-desktop-token'})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.headers['access-control-allow-origin'],ORIGIN)

    def test_authenticated_request_returns_output(self):
        r=self.client.post('/pdf/test',headers={'Origin':ORIGIN,'X-SolYan-Desktop-Token':TOKEN})
        self.assertEqual(r.status_code,200);self.assertEqual(r.json()['result'],'output')

    def test_desktop_cloud_sessions_allow_credentialed_cors(self):
        r=self.client.get('/health',headers={'Origin':ORIGIN,'X-SolYan-Desktop-Token':TOKEN,'Cookie':'solyan_storage_session=test'})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.headers.get('access-control-allow-credentials'),'true')
        self.assertEqual(os.environ['CLOUD_STORAGE_CALLBACK_BASE_URL'],'http://127.0.0.1:34567')
        self.assertEqual(os.environ['CLOUD_STORAGE_FRONTEND_BASE_URL'],ORIGIN)

    def test_missing_or_wrong_token_stays_401_and_is_readable_by_installed_ui(self):
        for value in ['', 'invalid']:
            r=self.client.get('/health',headers={'Origin':ORIGIN,'X-SolYan-Desktop-Token':value})
            self.assertEqual(r.status_code,401)
            self.assertEqual(r.headers.get('access-control-allow-origin'),ORIGIN)

    def test_other_origin_cannot_get_preflight_permission(self):
        r=self.client.options('/pdf/test',headers={'Origin':'https://untrusted.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-solyan-desktop-token'})
        self.assertNotEqual(r.status_code,200)
        self.assertNotIn('access-control-allow-origin',r.headers)

    def test_plain_options_is_not_an_auth_bypass(self):
        self.assertEqual(self.client.options('/pdf/test').status_code,401)

if __name__=='__main__':unittest.main()
