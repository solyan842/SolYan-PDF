// Focused UI/driver regression with a mocked local signing transport.
// This does not replace native pyHanko or installed frozen-engine acceptance.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {downloadOutput} from './tool-download.mjs';

const out=await mkdtemp(join(tmpdir(),'stool-sign-retry-'));
const browser=await chromium.launch();
try{
  const page=await browser.newPage();
  const html=await readFile(new URL('../ui/sign.html',import.meta.url),'utf8');
  await page.setContent(html.replace(/<script[^>]+src="\.\/sign\.js"><\/script>/,''));
  await page.evaluate(()=>{
    window.signAttempts=[];
    window.__TAURI__={core:{invoke:async command=>command==='desktop_core_session'?'http://127.0.0.1:54321\nfixture-token':true}};
    window.fetch=async(_url,options)=>{
      const passphrase=options.body.get('passphrase');window.signAttempts.push(passphrase);
      return passphrase==='fixture-only-password'
        ?new Response(new Blob(['PUBLIC SIGNING OUTPUT FIXTURE'],{type:'application/pdf'}),{status:200})
        :new Response(JSON.stringify({detail:'Fixture PKCS12 password rejected'}),{status:400,headers:{'Content-Type':'application/json'}});
    };
  });
  await page.addScriptTag({path:fileURLToPath(new URL('../ui/sign.js',import.meta.url))});
  await page.locator('#pdfInput').setInputFiles({name:'public-source.pdf',mimeType:'application/pdf',buffer:Buffer.from('public test input')});
  await page.locator('#certInput').setInputFiles({name:'fixture.p12',mimeType:'application/x-pkcs12',buffer:Buffer.from('mock transport only')});
  // Verify the common download helper exposes the actual error promptly.
  await page.locator('#certPassword').fill('wrong');
  const before=performance.now();
  await assert.rejects(downloadOutput(page,'#runBtn',join(out,'must-not-exist.pdf'),10000),/Fixture PKCS12 password rejected/);
  assert.ok(performance.now()-before<5000,'tool errors must fail before the download deadline');
  await expect(page.locator('#certPassword')).toHaveValue('');
  for(const name of ['first.pdf','retry.pdf']){
    await page.locator('#certPassword').fill('fixture-only-password');
    await downloadOutput(page,'#runBtn',join(out,name),10000);
    await expect(page.locator('#certPassword')).toHaveValue('');
    assert.equal(await readFile(join(out,name),'utf8'),'PUBLIC SIGNING OUTPUT FIXTURE');
  }
  assert.deepEqual(await page.evaluate(()=>window.signAttempts),['wrong','fixture-only-password','fixture-only-password']);
  console.log('Signing UI password clearing, explicit retry, two downloads and fail-fast error PASS (mock transport only)');
}finally{await browser.close();await rm(out,{recursive:true,force:true});}
