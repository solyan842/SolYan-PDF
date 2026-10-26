import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const p of ['ocr.html','ocr.js','ocr.css','tool.css','icons.js','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
assets.set('/icons/phosphor-duotone/file-arrow-up-duotone.svg',await readFile(new URL('icons/phosphor-duotone/file-arrow-up-duotone.svg',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.addInitScript(({port})=>{window.saved=[];window.calls=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='desktop_service_ready')return true;if(command==='desktop_core_session')return 'http://127.0.0.1:'+port+'\nlocal-token';if(command==='stool_save_output'){window.saved.push(args);return 'C:\\QA\\'+args.name}throw Error(command)}}};window.fetch=async(url,init)=>{window.calls.push({url:String(url),token:init.headers['X-SolYan-Desktop-Token'],name:init.body.get('file').name});return new Response(JSON.stringify({text:'SOL YAN OCR TEST',engine:'mock-local'}),{status:200,headers:{'Content-Type':'application/json'}})}},{port:server.address().port});
 await page.goto('http://127.0.0.1:'+server.address().port+'/ocr.html?tool=ocr-export');
 await page.waitForFunction(()=>Boolean(document.querySelector('#toolIcon img')?.getAttribute('src'))).catch(()=>{throw new Error('OCR page script did not render its icon: '+pageErrors.join('; '))});
 assert.ok((await page.locator('#toolIcon img').getAttribute('src')).includes('file-arrow-up'));
 const iconResponse=await page.request.get(new URL(await page.locator('#toolIcon img').getAttribute('src'),page.url()).href);
 assert.equal(iconResponse.status(),200,'OCR Phosphor icon asset must be served under production CSP');
 assert.equal(await page.locator('#ocrTitle').textContent(),'Xuất kết quả OCR');
 const bytes=Buffer.from('%PDF-1.7 source fixture');
 await page.locator('#fileInput').setInputFiles({name:'Báo cáo Scan.pdf',mimeType:'application/pdf',buffer:bytes});
 await page.locator('#runOcr').click();await page.waitForFunction(()=>document.querySelector('#resultPanel')&&!document.querySelector('#resultPanel').hidden);
 assert.equal(await page.locator('#outputPreview').inputValue(),'SOL YAN OCR TEST');
 await page.locator('#downloadTxt').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);
 assert.equal(await page.locator('#output-results strong').textContent(),'Báo cáo Scan-ocr.txt');
 await page.locator('.output-save').click();await page.waitForFunction(()=>window.saved.length===1);
 const result=await page.evaluate(()=>({saved:window.saved[0],call:window.calls[0]}));
 assert.equal(Buffer.from(result.saved.bytes).toString(),'SOL YAN OCR TEST');assert.equal(result.call.url.endsWith('/ocr/text'),true);assert.equal(result.call.token,'local-token');assert.equal(result.call.name,'Báo cáo Scan.pdf');
 assert.ok(result.saved.sourceHashes.includes(createHash('sha256').update(bytes).digest('hex')));
 await page.goto('http://127.0.0.1:'+server.address().port+'/ocr.html?tool=auto-rename');
 await page.locator('#fileInput').setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:bytes});
 await page.locator('#runOcr').click();await page.waitForFunction(()=>document.querySelector('#resultPanel')&&!document.querySelector('#resultPanel').hidden);
 await page.locator('#downloadTxt').click();await page.waitForFunction(()=>document.querySelector('#output-results .output-result'));
 assert.equal(await page.locator('#output-results strong').textContent(),'SOL YAN OCR TEST.pdf');
 await page.locator('.output-save').click();await page.waitForFunction(()=>window.saved.length===1);
 const renamed=await page.evaluate(()=>window.saved[0]);
 assert.deepEqual(Buffer.from(renamed.bytes),bytes);
 assert.ok(renamed.sourceHashes.includes(createHash('sha256').update(bytes).digest('hex')));
 console.log(JSON.stringify({tool:'ocr-export',route:'/ocr/text',filename:'Báo cáo Scan-ocr.txt',autoRename:'SOL YAN OCR TEST.pdf',saveControl:'PASS',sourceSha256Unchanged:true}));await page.close();
}finally{await browser.close();server.close()}

