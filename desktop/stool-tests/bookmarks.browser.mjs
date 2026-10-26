import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
const htmlFiles=['bookmarks.html','split-bookmarks.html'];
const sourceFiles=['bookmarks.js','bookmarks-core.js','split-bookmarks.js','bookmark-tools.css','tool.css','output-name.js','output-save.js'];
for(const name of [...htmlFiles,...sourceFiles,'app.js'])assets.set('/'+name,await readFile(new URL(name,ui)));
for(const name of ['vendor/pdf-lib.min.js','icons/phosphor-duotone/bookmarks-duotone.svg','icons/phosphor-duotone/arrows-split-duotone.svg','icons/phosphor-duotone/file-arrow-up-duotone.svg'])assets.set('/'+name,await readFile(new URL(name,ui)));
const app=String(assets.get('/app.js'));
assert.match(app,/'bookmarks':\s*'\.\/bookmarks\.html'/,'Bookmarks catalog route must open its editor');
assert.match(app,/'split-bookmark':\s*'\.\/split-bookmarks\.html'/,'Split-by-bookmark catalog route must open its tool');
const server=createServer((request,response)=>{const pathname=new URL(request.url,'http://localhost').pathname,body=assets.get(pathname);response.writeHead(body?200:404,{'Content-Type':pathname.endsWith('.html')?'text/html':pathname.endsWith('.css')?'text/css':pathname.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});response.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 const fixturePage=await browser.newPage();await fixturePage.goto(origin+'/bookmarks.html');await fixturePage.waitForFunction(()=>window.SOLYAN_BOOKMARKS&&window.PDFLib);
 const fixture=Buffer.from(await fixturePage.evaluate(async()=>{const document=await PDFLib.PDFDocument.create();for(let index=0;index<6;index++){const page=document.addPage([300+index,400+index]);page.drawText('page '+(index+1),{x:12,y:20})}const bytes=await document.save();return Array.from(await SOLYAN_BOOKMARKS.write(bytes,[{title:'Mở đầu',pageNumber:1,children:[{title:'Giới thiệu tiếng Việt',pageNumber:2,children:[]}]},{title:'Chương 2 / Phần A',pageNumber:4,children:[]},{title:'Phụ lục?',pageNumber:7,children:[]}]))}));
 const sourceHash=hash(fixture);await fixturePage.close();
 const editor=await browser.newPage();await editor.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});
 await editor.goto(origin+'/bookmarks.html');await editor.locator('#fileInput').setInputFiles({name:'annual-report.pdf',mimeType:'application/pdf',buffer:fixture});await editor.waitForFunction(()=>document.querySelector('#status').textContent.includes('Đã đọc bookmark'));
 await editor.locator('[aria-label="Tiêu đề bookmark"]').first().fill('Mở đầu đã sửa');await editor.locator('#save').click();await editor.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);await editor.locator('.output-save').click();await editor.waitForFunction(()=>window.saved.length===1);
 const saved=await editor.evaluate(()=>window.saved[0]);assert.equal(saved.name,'annual-report-bookmarks.pdf');assert.ok(saved.sourceHashes.includes(sourceHash));const outline=await editor.evaluate(async bytes=>await SOLYAN_BOOKMARKS.extract(new Uint8Array(bytes)),saved.bytes);assert.equal(outline[0].title,'Mở đầu đã sửa');assert.equal(outline[0].children[0].title,'Giới thiệu tiếng Việt');assert.equal(await editor.evaluate(async bytes=>(await PDFLib.PDFDocument.load(new Uint8Array(bytes))).getPageCount(),saved.bytes),6);
 console.log(JSON.stringify({tool:'bookmarks',status:'PASS',nestedUnicodeRoundTrip:true,sourceDerivedOutputName:saved.name,sourceHashPreserved:true}));await editor.close();
 const splitter=await browser.newPage();await splitter.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});
 await splitter.goto(origin+'/split-bookmarks.html');await splitter.locator('#fileInput').setInputFiles({name:'annual-report.pdf',mimeType:'application/pdf',buffer:fixture});await splitter.waitForFunction(()=>document.querySelector('#status').textContent.includes('Sẵn sàng tách 3 chương'));await splitter.locator('#run').click();await splitter.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===3);
 const names=['annual-report-01 Mở đầu.pdf','annual-report-02 Chương 2 - Phần A.pdf','annual-report-03 Phụ lục-.pdf'],counts=[3,2,1];
 for(let index=0;index<3;index++){await splitter.locator('.output-result').nth(index).locator('.output-save').click();await splitter.waitForFunction(count=>window.saved.length===count,index+1);const item=await splitter.evaluate(index=>window.saved[index],index);assert.equal(item.name,names[index]);assert.ok(item.sourceHashes.includes(sourceHash));assert.equal(await splitter.evaluate(async bytes=>(await PDFLib.PDFDocument.load(new Uint8Array(bytes))).getPageCount(),item.bytes),counts[index]);}
 console.log(JSON.stringify({tool:'split-bookmark',status:'PASS',chapterCount:3,pageCounts:counts,sourceNamePrefix:'annual-report',sourceHashPreserved:true}));await splitter.close();
}finally{await browser.close();server.close();}
