import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';import {createServer} from 'node:http';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const ui=new URL('../ui/',import.meta.url),assets=new Map();for(const p of ['overlay.html','overlay.js','tool.css','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));assets.set('/vendor/pdf-lib.min.js',await readFile(new URL('vendor/pdf-lib.min.js',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
const page=await browser.newPage();await page.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});await page.goto('http://127.0.0.1:'+server.address().port+'/overlay.html');
const fixtures=await page.evaluate(async()=>{const base=await PDFLib.PDFDocument.create();base.addPage([200,300]).drawText('BASE ONE');base.addPage([300,200]).drawText('BASE TWO');const mark=await PDFLib.PDFDocument.create();mark.addPage([60,40]).drawText('OVERLAY QA');return {base:Array.from(new Uint8Array(await base.save())),overlay:Array.from(new Uint8Array(await mark.save()))}});
const base=Buffer.from(fixtures.base),overlay=Buffer.from(fixtures.overlay),hashes=[base,overlay].map(value=>createHash('sha256').update(value).digest('hex'));
await page.locator('#baseInput').setInputFiles({name:'contract.pdf',mimeType:'application/pdf',buffer:base});await page.locator('#overlayInput').setInputFiles({name:'watermark.pdf',mimeType:'application/pdf',buffer:overlay});await page.locator('#run').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);
const row=page.locator('#output-results .output-result');assert.equal(await row.locator('strong').textContent(),'contract-overlay.pdf');await row.locator('.output-save').click();await page.waitForFunction(()=>window.saved.length===1);
const saved=await page.evaluate(()=>window.saved[0]);assert.ok(saved.bytes.length>base.length,'PDF overlay content is included in output');assert.equal(saved.sourceHashes.length,2);for(const hash of hashes)assert.ok(saved.sourceHashes.includes(hash));
const result=await page.evaluate(async bytes=>{const doc=await PDFLib.PDFDocument.load(new Uint8Array(bytes));return doc.getPages().map(page=>page.getSize())},saved.bytes);assert.equal(result.length,2);assert.deepEqual(result.map(x=>[x.width,x.height]),[[200,300],[300,200]]);
const after=await Promise.all(['#baseInput','#overlayInput'].map(sel=>page.locator(sel).evaluate(async el=>Array.from(new Uint8Array(await el.files[0].arrayBuffer())))));assert.deepEqual(after.map(data=>createHash('sha256').update(Buffer.from(data)).digest('hex')),hashes);
console.log(JSON.stringify({tool:'overlay',status:'PASS',output:saved.name,pages:result.length,bothSourcesUnchanged:true}));
}finally{await browser.close();server.close()}


