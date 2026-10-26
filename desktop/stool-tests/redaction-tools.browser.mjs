import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const uiRoot=fileURLToPath(new URL('../ui/',import.meta.url));
const mime=p=>p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':p.endsWith('.wasm')?'application/wasm':p.endsWith('.bcmap')?'application/octet-stream':'text/javascript';
const server=createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/,''),file=path.resolve(uiRoot,rel);if(file!==uiRoot&&!file.startsWith(uiRoot))throw Error('invalid path');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime(file),'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'"});res.end(body)}catch{res.writeHead(404);res.end('not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const fixturePage=await browser.newPage();await fixturePage.goto(`http://127.0.0.1:${server.address().port}/redaction-tools.html?tool=highlight`);const pdf=Buffer.from(await fixturePage.evaluate(async()=>{const p=await PDFLib.PDFDocument.create();p.addPage([300,400]).drawText('AUTO-SECRET-12345',{x:20,y:250,size:18});p.addPage([300,400]).drawText('SAFE PAGE',{x:20,y:250,size:18});return Array.from(await p.save())}));await fixturePage.close();
 const sourceHash=createHash('sha256').update(pdf).digest('hex');
 for(const item of [
  {mode:'highlight',name:'Đánh dấu nội dung',suffix:'highlighted',text:'AUTO-SECRET-12345',secure:false,drag:[15,115,220,160]},
  {mode:'manual-redact',name:'Che nội dung thủ công',suffix:'redacted',text:'AUTO-SECRET-12345',secure:true,drag:[15,115,220,160]},
  {mode:'auto-redact',name:'Tự động che văn bản',suffix:'redacted',text:'AUTO-SECRET-12345',secure:true},
 ]){
  const page=await browser.newPage();await page.addInitScript(()=>{window.saveCalls=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error('Unexpected native command');window.saveCalls.push(args);return 'C:\\QA\\redaction.pdf'}}}});
  await page.goto(`http://127.0.0.1:${server.address().port}/redaction-tools.html?tool=${item.mode}`);
  await expect(page.locator('#title')).toHaveText(item.name);
  await page.locator('#fileInput').setInputFiles({name:'contract-secret.pdf',mimeType:'application/pdf',buffer:pdf});
  await expect(page.locator('#status')).toContainText('2 trang');
  if(item.mode==='auto-redact')await page.locator('#terms').fill('AUTO-SECRET-12345');
  else {const [x1,y1,x2,y2]=item.drag,overlay=page.locator('#selection');await overlay.scrollIntoViewIfNeeded();const box=await overlay.boundingBox(),hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x:box.x+x1,y:box.y+y1});assert.equal(hit,'selection',`selection overlay receives input, got ${hit}; box=${JSON.stringify(box)}`);await page.mouse.move(box.x+x1,box.y+y1);await page.mouse.down();await page.mouse.move(box.x+x2,box.y+y2,{steps:4});await page.mouse.up();await expect(page.locator('#status')).toContainText('Đã chọn vùng')}
  await page.locator('#runBtn').click();await expect(page.locator('#status')).toContainText('Chọn Lưu hoặc Lưu thành',{timeout:30000});
  await expect(page.locator('#output-results .output-result > strong')).toHaveText(`contract-secret-${item.suffix}.pdf`);
  await page.locator('.output-save').click();await expect(page.locator('.output-result [role=status]')).toContainText('Đã lưu: C:\\QA\\redaction.pdf');
  const call=(await page.evaluate(()=>window.saveCalls))[0];assert.deepEqual(call.sourceHashes,[sourceHash]);assert.equal(call.sourceHashes[0],createHash('sha256').update(pdf).digest('hex'));
  const checks=await page.evaluate(async({bytes,needle})=>{const lib=await import('/vendor/pdfjs/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';const task=lib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}),doc=await task.promise,pages=doc.numPages,texts=[];for(let i=1;i<=pages;i++)texts.push((await(await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(''));await task.destroy();return {pages,texts,matchVisible:texts.join('\n').includes(needle)}},{bytes:call.bytes,needle:item.text});
  assert.equal(checks.pages,2);assert.equal(checks.texts[1].includes('SAFE PAGE'),true);assert.equal(checks.matchVisible,!item.secure,`${item.mode} security content behavior`);
  if(item.secure)assert.notDeepEqual(Buffer.from(call.bytes),pdf);
  await page.close();console.log(`${item.mode}: browser preview/selection, output name and Save; ${item.secure?'secure page raster replacement':'PDF text retained under highlight'} PASS`);
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
