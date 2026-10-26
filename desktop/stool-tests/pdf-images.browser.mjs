import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const p of ['poppler-convert.html','poppler-convert.js','tool.css','icons.js','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
const iconSlugs=['file-image','file-code','file-svg','file-text','file-html','file-zip'];
for(const slug of iconSlugs)assets.set('/icons/phosphor-duotone/'+slug+'-duotone.svg',await readFile(new URL('icons/phosphor-duotone/'+slug+'-duotone.svg',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
const cases=[
 {tool:'text',route:'/pdf/to-text',name:'Tài liệu.txt',response:'solyan-pdf.txt',bytes:'text output',fields:{pages:['2','4']}},
 {tool:'html',route:'/pdf/to-html',name:'Tài liệu.html',response:'solyan-pdf.html',bytes:'<p>html</p>',fields:{pages:['2','4']}},
 {tool:'xml',route:'/pdf/to-xml',name:'Tài liệu.xml',response:'solyan-pdf.xml',bytes:'<doc/>',fields:{pages:['2','4']}},
 {tool:'cbz',route:'/pdf/to-cbz',name:'Tài liệu.cbz',response:'solyan-pdf.cbz',bytes:'cbz output',fields:{pages:['2','4'],dpi:'200'}},
 {tool:'images',route:'/pdf/to-cbz',name:'Tài liệu-images.zip',response:'solyan-images.zip',bytes:'image zip',fields:{pages:['2','4'],dpi:'200'}},
 {tool:'svg',route:'/pdf/to-svg',name:'Tài liệu-svg.zip',response:'solyan-pdf-svg.zip',bytes:'svg zip',fields:{pages:['2','4'],raster_dpi:'200'}},
 {tool:'ps',route:'/pdf/to-postscript',name:'Tài liệu.ps',response:'solyan-pdf.ps',bytes:'%!PS',fields:{pages:['2','4'],level:'3',output_format:'ps'}},
 {tool:'eps',route:'/pdf/to-postscript',name:'Tài liệu.eps',response:'solyan-pdf.eps',bytes:'%!PS-Adobe EPSF',fields:{singlePage:['3'],level:'3',output_format:'eps'}}
];
const source=Buffer.from('%PDF-1.7 source fixture');
try{
 for(const item of cases){
  const page=await browser.newPage();
  await page.addInitScript(({port,cases})=>{window.saved=[];window.calls=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='desktop_core_session')return 'http://127.0.0.1:'+port+'\nlocal-token';if(command==='stool_save_output'){window.saved.push(args);return 'C:\\QA\\'+args.name}throw Error(command)}}};window.fetch=async(url,init)=>{const tool=new URL(location.href).searchParams.get('tool'),scenario=cases.find(x=>x.tool===tool),body=init.body,file=body.get('file');window.calls.push({url:String(url),token:init.headers['X-SolYan-Desktop-Token'],file:file.name,fields:Object.fromEntries(Array.from(body.entries()).filter(([key,value])=>typeof value==='string').map(([key,value])=>[key,value]))});return new Response(new TextEncoder().encode(scenario.bytes),{status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+scenario.response+'"' ,'X-SolYan-CBZ-Pages':'3','X-SolYan-CBZ-DPI':'200','X-SolYan-PostScript-Format':scenario.fields.output_format||'','X-SolYan-PostScript-Level':'3'}})}},{port:server.address().port,cases});
  await page.goto('http://127.0.0.1:'+server.address().port+'/poppler-convert.html?tool='+item.tool);
  assert.equal((await page.locator('#toolName').textContent()).trim()!=='' ,true,item.tool+' title');
  const expectedTitles={text:'PDF sang TXT',html:'PDF sang HTML',xml:'PDF sang XML',cbz:'PDF sang CBZ',images:'PDF sang ảnh',svg:'PDF sang SVG',ps:'PDF sang PostScript',eps:'PDF sang EPS'};
  assert.equal(await page.locator('#toolName').textContent(),expectedTitles[item.tool],item.tool+' route title');
  await page.locator('#fileInput').setInputFiles({name:'Tài liệu.pdf',mimeType:'application/pdf',buffer:source});
  if(item.fields.pages){await page.locator('#firstPage').fill(item.fields.pages[0]);await page.locator('#lastPage').fill(item.fields.pages[1]);}
  if(item.fields.singlePage)await page.locator('#singlePage').fill(item.fields.singlePage[0]);
  if(item.fields.dpi)await page.locator('#dpi').fill(item.fields.dpi);
  if(item.fields.raster_dpi)await page.locator('#dpi').fill(item.fields.raster_dpi);
  if(item.fields.level)await page.locator('#level').selectOption(item.fields.level);
  await page.locator('#runBtn').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);await page.waitForFunction(()=>document.querySelector('#output-results .output-result'));
  assert.equal(await page.locator('#output-results strong').textContent(),item.name,item.tool+' derived filename');
  await page.locator('.output-save-as').click();await page.waitForFunction(()=>window.saved.length===1);
  const saved=await page.evaluate(()=>window.saved[0]),call=await page.evaluate(()=>window.calls[0]);
  assert.equal(call.url.endsWith(item.route),true,item.tool+' engine route');assert.equal(call.token,'local-token');assert.equal(call.file,'Tài liệu.pdf');
  for(const [key,value] of Object.entries(item.fields)){if(key==='pages'){assert.equal(call.fields.first_page,value[0]);assert.equal(call.fields.last_page,value[1]);}else if(key==='singlePage'){assert.equal(call.fields.first_page,value[0]);assert.equal(call.fields.last_page,value[0]);}else assert.equal(call.fields[key],value, item.tool+' '+key);}
  assert.equal(Buffer.from(saved.bytes).toString(),item.bytes);assert.equal(saved.name,item.name);assert.equal(saved.saveAs,true);assert.ok(saved.sourceHashes.includes(createHash('sha256').update(source).digest('hex')));
  console.log(JSON.stringify({tool:item.tool,route:item.route,filename:item.name,saveAs:'PASS',sourceSha256Unchanged:true}));await page.close();
 }
}finally{await browser.close();server.close()}
