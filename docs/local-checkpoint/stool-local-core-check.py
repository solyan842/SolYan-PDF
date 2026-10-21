"""Real production Core runner + pinned native qpdf on this Windows PC."""
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import httpx
from pypdf import PdfReader
from reportlab.pdfgen import canvas

work=Path(__file__).parent
repo=work/'SolYan-PDF'
sys.path.insert(0,str(repo/'desktop/backend/tests'))
from frozen_smoke_process import stop_frozen_sidecar
frozen=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else None
out=work/('stool-local-frozen-core-results' if frozen else 'stool-local-core-results')
out.mkdir(exist_ok=True)
source=out/'source.pdf'
canvas_=canvas.Canvas(str(source),pagesize=(595,842))
for n in range(1,4):
    canvas_.drawString(50,750,f'SOLYAN LOCAL CORE TEST PAGE {n}')
    canvas_.showPage()
canvas_.save()
original=source.read_bytes()
digest=hashlib.sha256(original).hexdigest()
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0))
    port=sock.getsockname()[1]
token='local-core-test-only-token-0123456789abcdef'
origin='http://tauri.localhost'
report={'scope':('Windows frozen Core executable' if frozen else 'Windows production Core source runner')+' + pinned qpdf 12.4.2; not full installed UI acceptance','cases':[]}
with (out/'core.log').open('w',encoding='utf-8') as log:
    command=[str(frozen)] if frozen else [sys.executable,str(repo/'desktop/backend/runner.py')]
    child=subprocess.Popen(command+['--port',str(port),'--token',token],cwd=repo,stdout=log,stderr=log,env=os.environ.copy())
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{port}',headers={'Origin':origin,'X-SolYan-Desktop-Token':token},timeout=30,trust_env=False) as client:
            deadline=time.monotonic()+20
            while True:
                assert child.poll() is None,'Core exited during startup'
                try:
                    response=client.get('/health')
                    if response.status_code==200:break
                except httpx.ConnectError:pass
                assert time.monotonic()<deadline,'Core did not reach qpdf health'
                time.sleep(.1)
            assert response.json()=={'status':'ok','engine':'qpdf'}
            report['cases'].append('real production health confirms qpdf')
            for value in ['', 'wrong']:
                r=client.get('/health',headers={'X-SolYan-Desktop-Token':value})
                assert r.status_code==401 and r.headers['access-control-allow-origin']==origin
            r=client.options('/pdf/compress',headers={'X-SolYan-Desktop-Token':'','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-solyan-desktop-token'})
            assert r.status_code==200 and r.headers['access-control-allow-origin']==origin
            report['cases'].append('actual production preflight and token enforcement')
            def transform(endpoint,name):
                r=client.post(endpoint,files={'file':('source.pdf',original,'application/pdf')})
                assert r.status_code==200,(endpoint,r.status_code,r.text[:500])
                target=out/name
                target.write_bytes(r.content)
                pdf=PdfReader(io.BytesIO(r.content))
                assert len(pdf.pages)==3
                for n,page in enumerate(pdf.pages,1):
                    assert f'SOLYAN LOCAL CORE TEST PAGE {n}' in page.extract_text()
                    assert tuple(page.mediabox)==(0,0,595,842)
                subprocess.run(['qpdf','--check',str(target)],check=True,capture_output=True)
                return r.status_code
            for endpoint in ['compress','decompress','flatten','compress-images']:
                transform('/pdf/'+endpoint,endpoint+'.pdf')
                report['cases'].append(endpoint+': real PDF saved, qpdf check, all page text and size preserved')
            r=client.post('/pdf/compress',files={'file':('broken.pdf',b'not a PDF','application/pdf')})
            assert r.status_code==400
            transform('/pdf/compress','after-invalid.pdf')
            report['cases'].append('bad PDF rejected; valid retry succeeds')
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                results=list(pool.map(lambda n:transform('/pdf/compress',f'parallel-{n}.pdf'),range(8)))
            assert results==[200]*8
            report['cases'].append('8 simultaneous real PDF operations and independently checked outputs')
            assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
            report['sourceSha256']=digest
            report['cases'].append('source PDF bytes unchanged')
            report['result']='PASS'
    finally:
        try:
            stop_frozen_sidecar(child,port)
            report['processTreeCleanupVerified']=True
        except Exception as error:
            report['processTreeCleanupVerified']=False
            report['cleanupError']=str(error)
            report['result']='FUNCTIONAL_PASS; CLEANUP_FAIL' if report.get('result')=='PASS' else 'FAIL'
            raise
        finally:
            report['ownedCoreExited']=child.poll() is not None
            (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))

