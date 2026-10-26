import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';import {createServer} from 'node:http';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const path of ['image-to-pdf.html','image-to-pdf.js','tool.css','output-name.js','output-save.js'])assets.set('/'+path,await readFile(new URL(path,ui)));
assets.set('/vendor/pdf-lib.min.js',await readFile(new URL('vendor/pdf-lib.min.js',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
const page=await browser.newPage();await page.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});
await page.goto('http://127.0.0.1:'+server.address().port+'/image-to-pdf.html');
const images=await page.evaluate(async()=>{const make=(w,h,color)=>new Promise(resolve=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,w,h);canvas.toBlob(blob=>{const reader=new FileReader();reader.onload=()=>resolve(Array.from(new Uint8Array(reader.result)));reader.readAsArrayBuffer(blob)},'image/png')});return [await make(40,20,'red'),await make(20,40,'blue')]});
const buffers=images.map(bytes=>Buffer.from(bytes)),hashes=buffers.map(bytes=>createHash('sha256').update(bytes).digest('hex'));
await page.locator('#fileInput').setInputFiles(buffers.map((buffer,index)=>({name:index?'second.png':'scan.png',mimeType:'image/png',buffer})));
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Sẵn sàng tạo PDF')||document.querySelector('#status').textContent.includes('Sẵn sàng tạo PDF'));
await page.locator('#runBtn').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);
const row=page.locator('#output-results .output-result');assert.equal(await row.locator('strong').textContent(),'scan-converted.pdf');await row.locator('.output-save').click();await page.waitForFunction(()=>window.saved.length===1);
const output=await page.evaluate(()=>window.saved[0]);assert.equal(output.name,'scan-converted.pdf');
const pdf=await page.evaluate(async bytes=>{const doc=await PDFLib.PDFDocument.load(new Uint8Array(bytes));return doc.getPages().map(page=>page.getSize())},output.bytes);
assert.equal(pdf.length,2);assert.ok(Math.abs(pdf[0].width/pdf[0].height-2)<.001);assert.ok(Math.abs(pdf[1].width/pdf[1].height-.5)<.001);
const after=await page.locator('#fileInput').evaluate(async element=>Promise.all(Array.from(element.files,file=>file.arrayBuffer()).map(async promise=>Array.from(new Uint8Array(await promise)))));
assert.deepEqual(after.map(bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex')),hashes);
console.log(JSON.stringify({tool:'image-pdf',status:'PASS',output:output.name,pages:pdf.length,sourceImagesUnchanged:true}));
}finally{await browser.close();server.close()}

