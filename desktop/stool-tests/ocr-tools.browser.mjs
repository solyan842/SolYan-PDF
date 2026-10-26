import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const p of ['ocr-tools.html','ocr-tools.js','tool.css','icons.js','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
for(const slug of ['arrows-clockwise','qr-code'])assets.set('/icons/phosphor-duotone/'+slug+'-duotone.svg',await readFile(new URL('icons/phosphor-duotone/'+slug+'-duotone.svg',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const cases=[
  {tool:'auto-rotate',route:'/ocr/auto-rotate',name:'Hồ sơ scan-auto-rotated.pdf',type:'application/pdf',header:'attachment; filename="solyan-auto-rotated.pdf"',suffix:'auto-rotated'},
  {tool:'qr-split',route:'/ocr/auto-split',name:'Hồ sơ scan-qr-split.zip',type:'application/zip',header:'attachment; filename="solyan-auto-split.zip"',suffix:'qr-split'}
 ];
 for(const item of cases){
  const page=await browser.newPage();
  await page.addInitScript(({port,type,header})=>{window.saved=[];window.calls=[];window.invocations=[];window.__TAURI__={core:{invoke:async(command,args)=>{window.invocations.push(command);if(command==='desktop_service_ready')return true;if(command==='desktop_core_session')return 'http://127.0.0.1:'+port+'\nlocal-token';if(command==='stool_save_output'){window.saved.push(args);return 'C:\\QA\\'+args.name}throw Error(command)}}};window.fetch=async(url,init)=>{window.calls.push({url:String(url),token:init.headers['X-SolYan-Desktop-Token'],form:Array.from(init.body.entries()).map(([key,value])=>[key,typeof value==='string'?value:value.name])});return new Response(new Blob(['engine-output']),{status:200,headers:{'Content-Type':type,'Content-Disposition':header,'X-SolYan-Auto-Split-Parts':'2'}})}},{port:server.address().port,type:item.type,header:item.header});
  await page.goto('http://127.0.0.1:'+server.address().port+'/ocr-tools.html?tool='+item.tool);
  await page.waitForFunction(()=>document.querySelector('#toolIcon img')?.complete&&document.querySelector('#toolIcon img')?.naturalWidth>0);
  assert.ok((await page.locator('#toolIcon img').getAttribute('src')).includes(item.tool==='qr-split'?'qr-code':'arrows-clockwise'));
  await page.locator('#fileInput').setInputFiles({name:'Hồ sơ scan.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 source fixture')});
  await page.locator('#runTool').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);
  assert.equal(await page.locator('#output-results strong').textContent(),item.name);
  await page.locator('.output-save').click();await page.waitForFunction(()=>window.saved.length===1);
  const result=await page.evaluate(()=>({saved:window.saved[0],call:window.calls[0],invocations:window.invocations}));
  assert.equal(Buffer.from(result.saved.bytes).toString(),'engine-output');assert.equal(result.call.url.endsWith(item.route),true);assert.equal(result.call.token,'local-token');
  assert.deepEqual(result.call.form.find(pair=>pair[0]==='file'),['file','Hồ sơ scan.pdf']);assert.ok(result.saved.sourceHashes.includes(createHash('sha256').update(Buffer.from('%PDF-1.7 source fixture')).digest('hex')));
  if(item.tool==='auto-rotate'){assert.deepEqual(result.call.form.filter(pair=>pair[0]!=='file'),[['confidence_threshold','14'],['infer_undetected','false']])}else{assert.deepEqual(result.call.form.filter(pair=>pair[0]!=='file'),[['duplex','false']])}
  assert.deepEqual(result.invocations,['desktop_service_ready','desktop_core_session','stool_save_output']);
  console.log(JSON.stringify({tool:item.tool,route:item.route,filename:item.name,saveControl:'PASS',sourceSha256Unchanged:true}));await page.close();
 }
}finally{await browser.close();server.close()}
