import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=resolve(fileURLToPath(new URL('../ui/',import.meta.url))),app=await readFile(resolve(ui,'app.js'),'utf8');
assert.ok(app.includes("'edit-pdf': './editor.html'"),'Sửa PDF route must point to the real editor page');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.bcmap':'application/octet-stream','.wasm':'application/wasm','.pfb':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(ui,'.'+pathname);if(!file.startsWith(ui+sep))throw Error('path');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'"});res.end(body)}catch{res.writeHead(404);res.end('not found')}});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();await page.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>window.PDFLib?.PDFDocument);
 const fixture=Buffer.from(await page.evaluate(async()=>{const doc=await PDFLib.PDFDocument.create();for(let i=0;i<2;i++){const p=doc.addPage([240,320]);p.drawText(`SOURCE PAGE ${i+1}`,{x:20,y:280,size:14})}return Array.from(new Uint8Array(await doc.save()))}));
 const sourceHash=createHash('sha256').update(fixture).digest('hex');
 await page.locator('#fileInput').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:fixture});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Đã mở'));
 await page.locator('#coordX').fill('35');await page.locator('#coordY').fill('130');await page.locator('#textValue').fill('EDITED TEXT');await page.locator('#exportButton').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);
 await page.locator('.output-save').first().click();await page.waitForFunction(()=>window.saved.length===1);
 let saved=await page.evaluate(()=>window.saved[0]);assert.equal(saved.name,'source-edited.pdf');assert.ok(saved.sourceHashes.includes(sourceHash));
 const textCheck=await page.evaluate(async bytes=>{const pdfjs=await import('./vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',location.href).toString();const task=pdfjs.getDocument({data:new Uint8Array(bytes)});try{const doc=await task.promise,content=await(await doc.getPage(1)).getTextContent();return{pages:doc.numPages,text:content.items.map(i=>i.str).join(' ')}}finally{await task.destroy()}},saved.bytes);assert.equal(textCheck.pages,2);assert.match(textCheck.text,/EDITED TEXT/);
 await page.locator('#toolSelect').selectOption('redact');await page.locator('#coordX').fill('20');await page.locator('#coordY').fill('260');await page.locator('#coordWidth').fill('150');await page.locator('#coordHeight').fill('35');await page.locator('#exportButton').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===2);
 await page.locator('.output-save').nth(1).click();await page.waitForFunction(()=>window.saved.length===2);saved=await page.evaluate(()=>window.saved[1]);assert.ok(saved.sourceHashes.includes(sourceHash));
 const redacted=await page.evaluate(async bytes=>{const pdfjs=await import('./vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',location.href).toString();const task=pdfjs.getDocument({data:new Uint8Array(bytes)});try{const doc=await task.promise,p1=await(await doc.getPage(1)).getTextContent(),p2=await(await doc.getPage(2)).getTextContent();return{pages:doc.numPages,p1:p1.items.map(i=>i.str).join(' '),p2:p2.items.map(i=>i.str).join(' ')}}finally{await task.destroy()}},saved.bytes);assert.equal(redacted.pages,2);assert.equal(redacted.p1,'');assert.match(redacted.p2,/SOURCE PAGE 2/);
 console.log(JSON.stringify({tool:'edit-pdf',status:'PASS',textEdit:true,secureRedaction:true,sourceHashPreserved:true,redactedPageIsRasterized:true}));await page.close();
}finally{await browser.close();server.close()}
