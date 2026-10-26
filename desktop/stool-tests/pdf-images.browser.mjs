import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const p of ['poppler-convert.html','poppler-convert.js','tool.css','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();
 await page.addInitScript(({port})=>{window.saved=[];window.calls=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='desktop_core_session')return 'http://127.0.0.1:'+port+'\nlocal-token';if(command==='stool_save_output'){window.saved.push(args);return 'C:\\QA\\'+args.name}throw Error(command)}}};window.fetch=async(url,init)=>{const file=init.body.get('file');window.calls.push({url:String(url),token:init.headers['X-SolYan-Desktop-Token'],file:file.name,first:init.body.get('first_page'),last:init.body.get('last_page'),dpi:init.body.get('dpi')});return new Response(new Uint8Array([0x50,0x4b,0x03,0x04,0x50,0x4e,0x47]),{status:200,headers:{'Content-Type':'application/zip'}})}},{port:server.address().port});
 await page.goto('http://127.0.0.1:'+server.address().port+'/poppler-convert.html?tool=images');
 assert.equal(await page.locator('#toolName').textContent(),'PDF sang ảnh');
 const bytes=Buffer.from('%PDF-1.7 source fixture');
 await page.locator('#fileInput').setInputFiles({name:'Tài liệu.pdf',mimeType:'application/pdf',buffer:bytes});
 await page.locator('#firstPage').fill('2');await page.locator('#lastPage').fill('4');await page.locator('#dpi').fill('200');
 await page.locator('#runBtn').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);
 await page.waitForFunction(()=>document.querySelector('#output-results .output-result'));
 assert.equal(await page.locator('#output-results strong').textContent(),'Tài liệu-images.zip');
 await page.locator('.output-save-as').click();await page.waitForFunction(()=>window.saved.length===1);
 const result=await page.evaluate(()=>({saved:window.saved[0],call:window.calls[0]}));
 assert.equal(result.call.url.endsWith('/pdf/to-cbz'),true);assert.equal(result.call.token,'local-token');assert.equal(result.call.file,'Tài liệu.pdf');
 assert.deepEqual([result.call.first,result.call.last,result.call.dpi],['2','4','200']);
 assert.deepEqual(Buffer.from(result.saved.bytes),Buffer.from([0x50,0x4b,0x03,0x04,0x50,0x4e,0x47]));assert.equal(result.saved.name,'Tài liệu-images.zip');assert.equal(result.saved.saveAs,true);
 assert.ok(result.saved.sourceHashes.includes(createHash('sha256').update(bytes).digest('hex')));
 console.log(JSON.stringify({tool:'pdf-images',route:'/pdf/to-cbz',filename:'Tài liệu-images.zip',saveAs:'PASS',sourceSha256Unchanged:true}));await page.close();
}finally{await browser.close();server.close()}

