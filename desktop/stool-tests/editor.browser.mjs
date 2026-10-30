import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=resolve(fileURLToPath(new URL('../ui/',import.meta.url))),app=await readFile(resolve(ui,'app.js'),'utf8');
assert.ok(app.includes("'edit-pdf': './editor.html'"),'Edit PDF route must point to the dedicated editor');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.bcmap':'application/octet-stream','.wasm':'application/wasm','.pfb':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(ui,'.'+pathname);if(!file.startsWith(ui+sep))throw Error('path');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'"});res.end(body)}catch{res.writeHead(404);res.end('not found')}});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>window.PDFLib?.PDFDocument);
 const fixture=Buffer.from(await page.evaluate(async()=>{const doc=await PDFLib.PDFDocument.create();for(let i=0;i<2;i++){const p=doc.addPage([240,320]);p.drawText(`SOURCE PAGE ${i+1}`,{x:20,y:280,size:14})}return Array.from(new Uint8Array(await doc.save()))}));
 const sourceHash=createHash('sha256').update(fixture).digest('hex');
 await page.locator('#fileInput').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:fixture});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Đã mở'));
 const add=()=>page.locator('#addEditButton').click();
 const coords=async(x,y,w,h)=>{await page.locator('#coordX').fill(String(x));await page.locator('#coordY').fill(String(y));await page.locator('#coordWidth').fill(String(w));await page.locator('#coordHeight').fill(String(h))};
 await page.locator('#toolSelect').selectOption('text');await coords(35,130,120,24);await page.locator('#textValue').fill('EDITED TEXT');await add();
 await page.locator('#toolSelect').selectOption('highlight');await coords(10,160,100,30);await add();
 await page.locator('#toolSelect').selectOption('image');
 const imageBytes=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=4;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1]}),'base64');
 await page.locator('#imageInput').setInputFiles({name:'red.png',mimeType:'image/png',buffer:imageBytes});await coords(130,150,40,40);await add();
 await page.locator('#toolSelect').selectOption('replace-text');await page.locator('#overlayCanvas').click({position:{x:55,y:58}});await page.waitForFunction(()=>document.querySelector('#textValue').value.includes('SOURCE PAGE 1'));await page.locator('#textValue').fill('REPLACED TEXT');await add();
 await page.locator('#next').click();await page.locator('#toolSelect').selectOption('rectangle');await coords(50,150,130,50);await add();
 await page.locator('#toolSelect').selectOption('redact');await coords(20,260,150,35);await add();
 await assertQueue(page,6);
 await page.locator('#toolSelect').selectOption('text');await page.locator('#textValue').fill('TEMP REMOVE');await add();await assertQueue(page,7);await page.locator('#editList li:last-child button').click();await assertQueue(page,6);
 await page.locator('#exportButton').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);
 await page.locator('.output-save').first().click();await page.waitForFunction(()=>window.saved.length===1);
 const saved=await page.evaluate(()=>window.saved[0]);assert.equal(saved.name,'source-edited.pdf');assert.ok(saved.sourceHashes.includes(sourceHash));
 const result=await page.evaluate(async bytes=>{const pdfjs=await import('./vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',location.href).toString();const task=pdfjs.getDocument({data:new Uint8Array(bytes)});try{
  const doc=await task.promise,inspect=async n=>{const p=await doc.getPage(n),text=await p.getTextContent(),ops=await p.getOperatorList(),vp=p.getViewport({scale:1}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;const x=c.getContext('2d');await p.render({canvasContext:x,viewport:vp,background:'#fff'}).promise;return{page:p,text:text.items.map(i=>i.str).join(' '),image:ops.fnArray.includes(pdfjs.OPS.paintImageXObject),pixels:x.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height}};
  const p1=await inspect(1),p2=await inspect(2),count=(p,rect,test)=>{let n=0;for(let y=rect[1];y<rect[3];y++)for(let x=rect[0];x<rect[2];x++){const i=(y*p.width+x)*4;if(test(p.pixels[i],p.pixels[i+1],p.pixels[i+2]))n++}return n};
  return{pages:doc.numPages,text1:p1.text,text2:p2.text,image1:p1.image,image2:p2.image,replacementVisible:count(p1,[20,20,160,65],(r,g,b)=>r<110&&g<110&&b<110)>8,insertedTextVisible:count(p1,[30,170,170,205],(r,g,b)=>r<100&&g<100&&b<100)>8,highlightVisible:count(p1,[10,130,110,160],(r,g,b)=>r>210&&g>190&&b<220)>30,imageVisible:count(p1,[130,130,170,170],(r,g,b)=>r>220&&g<100&&b<100)>30,rectangleVisible:count(p2,[48,118,184,172],(r,g,b)=>b>100&&b>r*1.2)>15,redactionBlack:count(p2,[25,27,165,58],(r,g,b)=>r<30&&g<30&&b<30)>100};
 }finally{await task.destroy()}},saved.bytes);
 assert.equal(result.pages,2);assert.equal(result.text1,'');assert.equal(result.text2,'');assert.ok(result.image1&&result.image2,'security edits rasterize only affected pages');assert.ok(result.replacementVisible,'replacement text is visible');assert.ok(result.insertedTextVisible,'inserted text survives replacement rasterization');assert.ok(result.highlightVisible,'highlight survives in the final PDF');assert.ok(result.imageVisible,'inserted image survives in the final PDF');assert.ok(result.rectangleVisible,'rectangle survives in the final PDF');assert.ok(result.redactionBlack,'redacted source area is black and no text remains selectable');
 const sourceAgain=createHash('sha256').update(fixture).digest('hex');assert.equal(sourceAgain,sourceHash,'source fixture remains unchanged');
 console.log(JSON.stringify({tool:'edit-pdf',status:'PASS',queuedEdits:6,addText:true,replaceText:true,insertImage:true,highlight:true,rectangle:true,secureRedaction:true,sourceHashPreserved:true}));await page.close();
}finally{await browser.close();server.close()}
async function assertQueue(page,count){await page.waitForFunction(n=>document.querySelectorAll('#editList li').length===n,count)}
