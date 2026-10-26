import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const path of ['page-layout.html','page-layout.js','tool.css','output-name.js','output-save.js'])assets.set('/'+path,await readFile(new URL(path,ui)));
const iconNames=['arrows-split','grid-four','resize','article','squares-four','book-open'];
assets.set('/icons.js',await readFile(new URL('icons.js',ui)));
for(const name of iconNames)assets.set('/icons/phosphor-duotone/'+name+'-duotone.svg',await readFile(new URL('icons/phosphor-duotone/'+name+'-duotone.svg',ui)));
assets.set('/vendor/pdf-lib.min.js',await readFile(new URL('vendor/pdf-lib.min.js',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const fixturePage=await browser.newPage();await fixturePage.goto('http://127.0.0.1:'+server.address().port+'/page-layout.html?tool=resize');await fixturePage.waitForFunction(()=>window.PDFLib?.PDFDocument);
 const fixtures=Buffer.from(await fixturePage.evaluate(async()=>{const d=await PDFLib.PDFDocument.create();for(const [i,[w,h]] of [[100,110],[150,160],[200,210]].entries()){const p=d.addPage([w,h]);p.drawText('page '+(i+1),{x:5,y:5})}return Array.from(new Uint8Array(await d.save()))}));await fixturePage.close();
 const sourceHash=createHash('sha256').update(fixtures).digest('hex');
 const cases=[
  {tool:'advanced-split',configure:async p=>{await p.locator('#pagesPerPart').fill('2')},expectedCount:2,pages:[2,1]},
  {tool:'advanced-split',configure:async p=>{await p.locator('#splitMode').selectOption('size');await p.locator('#targetMb').fill('0.1')},expectedCount:1,pages:[3]},
  {tool:'advanced-split',configure:async p=>{await p.locator('#splitMode').selectOption('manual');await p.locator('#ranges').fill('1-2;3')},expectedCount:2,pages:[2,1]},
  {tool:'split-sections',configure:async p=>{await p.locator('#sectionOutputMode').selectOption('merged')},expectedCount:1,pages:[12],size:[50,55]},
  {tool:'resize',configure:async p=>{await p.locator('#pageSize').selectOption('A4');await p.locator('#orientation').selectOption('landscape');await p.locator('#scalePercent').fill('80')},expectedCount:1,pages:[3],size:[841.89,595.28]},
  {tool:'long-page',configure:async()=>{},expectedCount:1,pages:[1],size:[236,540]},
  {tool:'nup',configure:async p=>{},expectedCount:1,pages:[1],size:[841.89,595.28]},
  {tool:'booklet',configure:async()=>{},expectedCount:1,pages:[2],size:[110,100]}
 ];
 for(const test of cases){
  console.log(JSON.stringify({tool:test.tool,phase:'start'}));
  const page=await browser.newPage();await page.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});
  await page.goto('http://127.0.0.1:'+server.address().port+'/page-layout.html?tool='+test.tool);await page.waitForFunction(()=>window.PDFLib?.PDFDocument);
  const slug={ 'advanced-split':'arrows-split','split-sections':'grid-four',resize:'resize','long-page':'article',nup:'squares-four',booklet:'book-open'}[test.tool];await page.waitForFunction(()=>document.querySelector('#toolIcon img')?.complete&&document.querySelector('#toolIcon img')?.naturalWidth>0);assert.equal(await page.locator('#toolIcon img').getAttribute('src'),'./icons/phosphor-duotone/'+slug+'-duotone.svg');
  await page.locator('#fileInput').setInputFiles({name:'layout.pdf',mimeType:'application/pdf',buffer:fixtures});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Sẵn sàng xử lý'));
  await test.configure(page);await page.locator('#run').click();try{await page.waitForFunction(n=>document.querySelectorAll('#output-results .output-result').length===n,test.expectedCount,{timeout:10000})}catch(error){throw Error(test.tool+' did not create results; status='+await page.locator('#status').textContent()+': '+error.message)}
  const outputs=[];for(let i=0;i<test.expectedCount;i++){await page.locator('.output-result').nth(i).locator('.output-save').click();await page.waitForFunction(n=>window.saved.length===n,i+1);outputs.push(await page.evaluate(i=>window.saved[i],i))}
  for(let i=0;i<outputs.length;i++){assert.ok(outputs[i].sourceHashes.includes(sourceHash),test.tool+' must retain source fingerprint');const info=await page.evaluate(async bytes=>{const d=await PDFLib.PDFDocument.load(new Uint8Array(bytes));return{count:d.getPageCount(),size:d.getPages()[0].getSize()}},outputs[i].bytes);assert.equal(info.count,test.pages[i]);if(test.size)for(const [actual,expected] of [[info.size.width,test.size[0]],[info.size.height,test.size[1]]])assert.ok(Math.abs(actual-expected)<0.05,`${test.tool} size mismatch: ${actual} != ${expected}`)}
  console.log(JSON.stringify({tool:test.tool,mode:outputs.length>1?'multi-output':'single-output',status:'PASS',outputFiles:outputs.length,sourceSha256Unchanged:true}));await page.close();
 }
}finally{await browser.close();server.close()}

