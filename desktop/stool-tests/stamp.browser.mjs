import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
const appSource=await readFile(new URL('../ui/app.js',ui),'utf8');assert.ok(appSource.includes("'edit-pdf': './editor.html'"),'Sửa PDF must open its dedicated editor');
for(const p of ['stamp.html','stamp.js','tool.css','icons.js','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
for(const slug of ['drop','stamp','pencil-simple'])assets.set('/icons/phosphor-duotone/'+slug+'-duotone.svg',await readFile(new URL('icons/phosphor-duotone/'+slug+'-duotone.svg',ui)));
assets.set('/vendor/pdf-lib.min.js',await readFile(new URL('vendor/pdf-lib.min.js',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const setup=await browser.newPage();await setup.goto('http://127.0.0.1:'+server.address().port+'/stamp.html?tool=watermark');await setup.waitForFunction(()=>window.PDFLib?.PDFDocument);
 const fixture=Buffer.from(await setup.evaluate(async()=>{const d=await PDFLib.PDFDocument.create();for(const [i,[w,h]] of [[100,110],[150,160]].entries()){const p=d.addPage([w,h]);p.drawText('Original page '+(i+1),{x:8,y:20})}return Array.from(new Uint8Array(await d.save()))}));
 const image=Buffer.from(await setup.evaluate(async()=>{const c=document.createElement('canvas');c.width=4;c.height=4;const x=c.getContext('2d');x.fillStyle='#e12b42';x.fillRect(0,0,4,4);const b=await new Promise(r=>c.toBlob(r,'image/png'));return Array.from(new Uint8Array(await b.arrayBuffer()))}));await setup.close();
 const sourceHash=createHash('sha256').update(fixture).digest('hex');
 const cases=[
  {tool:'watermark',kind:'text',pages:'',text:'@filename @page/@pages',slug:'drop',count:2},
  {tool:'stamp',kind:'image',pages:'1',slug:'stamp',count:2},
  {tool:'stamp',kind:'text',pages:'2',text:'APPROVED',slug:'stamp',count:2}
 ];
 for(const test of cases){const page=await browser.newPage();await page.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});await page.goto('http://127.0.0.1:'+server.address().port+'/stamp.html?tool='+test.tool);await page.waitForFunction(()=>window.PDFLib?.PDFDocument);await page.waitForFunction(()=>document.querySelector('#toolIcon img')?.complete&&document.querySelector('#toolIcon img')?.naturalWidth>0);assert.equal(await page.locator('#toolIcon img').getAttribute('src'),'./icons/phosphor-duotone/'+test.slug+'-duotone.svg');await page.locator('#fileInput').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:fixture});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Sẵn sàng xử lý'));await page.locator('#kind').selectOption(test.kind);await page.locator('#pages').fill(test.pages);if(test.kind==='text')await page.locator('#text').fill(test.text);else await page.locator('#imageInput').setInputFiles({name:'mark.png',mimeType:'image/png',buffer:image});await page.locator('#run').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);if(test.outputName)assert.equal(await page.locator('#output-results .output-result > strong').textContent(),test.outputName);await page.locator('.output-save').click();await page.waitForFunction(()=>window.saved.length===1);const saved=await page.evaluate(()=>window.saved[0]);assert.ok(saved.sourceHashes.includes(sourceHash));const result=await page.evaluate(async b=>{const doc=await PDFLib.PDFDocument.load(new Uint8Array(b));return{pages:doc.getPageCount(),first:doc.getPages()[0].getSize()}},saved.bytes);assert.equal(result.pages,test.count);assert.ok(saved.bytes.length>fixture.length,'marking should produce a changed PDF');console.log(JSON.stringify({tool:test.tool,kind:test.kind,scope:test.pages||'all pages',status:'PASS',sourceSha256Unchanged:true}));await page.close()}
}finally{await browser.close();server.close()}

