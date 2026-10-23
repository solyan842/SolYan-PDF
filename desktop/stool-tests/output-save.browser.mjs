// Actual merge UI + shared Save shelf; native dialog transport is mocked here.
import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const assets=new Map();
for(const path of ['merge.html','merge.js','tool.css','vendor/pdf-lib.min.js'])assets.set('/'+path,await readFile(new URL('../ui/'+path,import.meta.url)));
const server=createServer((req,res)=>{const body=assets.get(req.url);res.writeHead(body?200:404,{'Content-Type':req.url.endsWith('.html')?'text/html':req.url.endsWith('.css')?'text/css':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*"});res.end(body||'not found');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
  const page=await browser.newPage();let downloads=0;page.on('download',()=>downloads++);
  await page.addInitScript({path:fileURLToPath(new URL('../ui/output-save.js',import.meta.url))});
  await page.addInitScript(()=>{
    window.saveCalls=[];window.nextSave=null;
    window.__TAURI__={core:{invoke:async(command,args)=>{
      if(command!=='stool_save_output')throw Error('Unexpected native command');
      window.saveCalls.push(args);
      if(window.nextSave==='error')throw Error('Fixture disk error');
      return window.nextSave;
    }}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/merge.html`);
  const pdf=await page.evaluate(async()=>{const p=await PDFLib.PDFDocument.create();p.addPage([200,300]).drawText('PUBLIC SAVE UI FIXTURE');return Array.from(await p.save());});
  const input=Buffer.from(pdf),hash=createHash('sha256').update(input).digest('hex');
  await page.locator('#fileInput').setInputFiles(['one.pdf','two.pdf'].map(name=>({name,mimeType:'application/pdf',buffer:input})));
  await page.locator('#mergeBtn').click();
  await expect(page.locator('.output-save')).toBeVisible();await expect(page.locator('.output-save-as')).toBeVisible();
  await expect(page.locator('.output-result [role=status]')).toContainText('Chưa lưu');assert.equal(downloads,0);
  // Cancel must retain the result and never display "saved".
  await page.locator('.output-save').click();await expect(page.locator('.output-result [role=status]')).toContainText('Đã hủy lưu');
  await page.evaluate(()=>window.nextSave='C:\\QA\\chosen.pdf');await page.locator('.output-save').click();
  await expect(page.locator('.output-result [role=status]')).toContainText('Đã lưu: C:\\QA\\chosen.pdf');
  await page.locator('.output-save').click();await expect(page.locator('.output-save')).toBeEnabled();
  await page.evaluate(()=>window.nextSave='C:\\QA\\different.pdf');await page.locator('.output-save-as').click();
  await expect(page.locator('.output-result [role=status]')).toContainText('different.pdf');
  const calls=await page.evaluate(()=>window.saveCalls);
  assert.deepEqual(calls.map(c=>c.saveAs),[false,false,false,true]);assert.equal(new Set(calls.map(c=>c.id)).size,1);
  for(const call of calls)assert.deepEqual(call.sourceHashes,[hash]);
  assert.equal(await page.evaluate(async bytes=>(await PDFLib.PDFDocument.load(new Uint8Array(bytes))).getPageCount(),calls[0].bytes),2);
  await page.evaluate(()=>window.nextSave='error');await page.locator('.output-save').click();
  await expect(page.locator('.output-result [role=status]')).toContainText('Fixture disk error');await expect(page.locator('.output-save')).toBeEnabled();
  assert.equal(downloads,0);console.log('Actual merge -> visible Save/Save As, Cancel/retry, PDF bytes, source hash and errors PASS (native transport mocked)');
}finally{await browser.close();await new Promise(r=>server.close(r));}
