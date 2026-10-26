import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const p of ['translate.html','translate.js','tool.css','icons.js','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
for(const p of ['translate','file-pdf'])assets.set(`/icons/phosphor-duotone/${p}-duotone.svg`,await readFile(new URL(`icons/phosphor-duotone/${p}-duotone.svg`,ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.calls=[];window.__TAURI__={core:{invoke:async command=>{assertCommand(command);return 'http://127.0.0.1:44000\nlocal-token'}}};function assertCommand(command){if(command!=='desktop_core_session')throw Error(command)}window.fetch=async(url,init={})=>{window.calls.push({url:String(url),token:init.headers?.['X-SolYan-Desktop-Token'],method:init.method||'GET'});if(String(url).endsWith('/pdf/translate/capabilities'))return new Response(JSON.stringify({engine:'PDFMathTranslate-compatible HTTP adapter',service_configured:true,default_service:'argos',max_file_size:104857600,services:[{id:'argos',local:true,requires_operator_configuration:false}]}),{status:200,headers:{'Content-Type':'application/json'}});return new Response(new Blob(['%PDF-1.7\ntranslation output']),{status:200,headers:{'Content-Type':'application/pdf','X-SolYan-Translation-Local':'1','X-SolYan-Translation-Service':'argos'}})}});
 await page.goto(`http://127.0.0.1:${server.address().port}/translate.html`);
 assert.equal(await page.locator('#runBtn').isDisabled(),true);assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.locator('#sourceFile').setInputFiles({name:'Contract.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nsource')});
 await page.locator('#runBtn').click();await page.waitForFunction(()=>document.querySelector('.output-result'));
 assert.deepEqual(await page.evaluate(()=>window.calls.map(({url,token,method})=>({url,token,method}))),[
  {url:'http://127.0.0.1:44000/pdf/translate/capabilities',token:'local-token',method:'GET'},
  {url:'http://127.0.0.1:44000/pdf/translate',token:'local-token',method:'POST'}
 ]);
 assert.match(await page.locator('.output-result strong').textContent(),/^Contract-translated\.pdf$/);
 assert.match(await page.locator('#status').textContent(),/xử lý local/);
 console.log(JSON.stringify({tool:'translate',lazyCoreStart:'PASS',capabilities:'PASS',authenticatedSubmit:'PASS',sourceDerivedSaveName:'PASS',status:'PASS'}));
 await page.close();
}finally{await browser.close();server.close()}
