"""Local Windows socket verification of production Core auth/CORS composition.

Uses a tiny backend route, not packaged qpdf/OCR/Office integration.
"""
import concurrent.futures
import json
import socket
import sys
import threading
import time
import types
from pathlib import Path
from unittest.mock import patch

import httpx
import uvicorn
from fastapi import FastAPI

repo = Path(__file__).parent / 'SolYan-PDF'
sys.path.insert(0, str(repo))
from desktop.backend import runner

origin = 'http://tauri.localhost'
token = 'local-test-token-0123456789abcdef'
backend = FastAPI()
@backend.post('/local-probe')
def probe():
    return {'ready': True}

with patch.dict(sys.modules, {'backend.app.main': types.SimpleNamespace(app=backend)}), patch.object(sys, 'argv', ['runner', '--port', '34567', '--token', token]), patch.object(runner.uvicorn, 'run') as capture:
    runner.main()
app = capture.call_args.args[0]
sock = socket.socket()
sock.bind(('127.0.0.1', 0))
port = sock.getsockname()[1]
server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, log_level='error', access_log=False))
thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]})
thread.start()
cases = []
try:
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(.02)
    assert server.started, 'HTTP server startup failed'
    with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=3, trust_env=False) as client:
        preflight = {'Origin': origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-solyan-desktop-token'}
        response = client.options('/local-probe', headers=preflight)
        assert response.status_code == 200 and response.headers['access-control-allow-origin'] == origin
        cases.append('real socket approved preflight without token')
        response = client.post('/local-probe', headers={'Origin': origin, 'X-SolYan-Desktop-Token': token})
        assert response.status_code == 200 and response.json() == {'ready': True}
        cases.append('authenticated real socket POST')
        for secret in ['', 'wrong']:
            response = client.post('/local-probe', headers={'Origin': origin, 'X-SolYan-Desktop-Token': secret})
            assert response.status_code == 401 and response.headers['access-control-allow-origin'] == origin
        cases.append('missing and wrong credentials remain 401')
        response = client.options('/local-probe', headers={**preflight, 'Origin': 'https://untrusted.example'})
        assert response.status_code == 400 and 'access-control-allow-origin' not in response.headers
        cases.append('foreign origin preflight denied')
        assert client.options('/local-probe').status_code == 401
        cases.append('plain OPTIONS requires token')
        def request(_):
            return client.post('/local-probe', headers={'Origin': origin, 'X-SolYan-Desktop-Token': token}).status_code
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            assert list(pool.map(request, range(32))) == [200] * 32
        cases.append('32 concurrent authenticated requests succeed')
finally:
    server.should_exit = True
    thread.join(timeout=10)
    sock.close()
    assert not thread.is_alive(), 'HTTP server did not stop'
cases.append('owned HTTP server closes cleanly')
report = {'scope': 'Windows local TCP, real uvicorn, production runner composition, synthetic route; not packaged engine acceptance', 'result': 'PASS', 'cases': cases}
Path(__file__).with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
