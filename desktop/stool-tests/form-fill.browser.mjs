import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';import {createServer} from 'node:http';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const ui=new URL('../ui/',import.meta.url),assets=new Map();for(const path of ['form-fill.html','form-fill.js','tool.css','output-name.js','output-save.js'])assets.set('/'+path,await readFile(new URL(path,ui)));assets.set('/vendor/pdf-lib.min.js',await readFile(new URL('vendor/pdf-lib.min.js',ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
const page=await browser.newPage();await page.addInitScript(()=>{window.saved=[];window.__TAURI__={core:{invoke:async(command,args)=>{if(command!=='stool_save_output')throw Error(command);window.saved.push(args);return 'C:\\QA\\'+args.name}}}});
await page.goto('http://127.0.0.1:'+server.address().port+'/form-fill.html');
const fixture=await page.evaluate(async()=>{const doc=await PDFLib.PDFDocument.create(),page=doc.addPage([300,300]),font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),form=doc.getForm();form.createTextField('person.name').addToPage(page,{x:20,y:250,width:120,height:20,font});form.createCheckBox('consent').addToPage(page,{x:20,y:210,width:14,height:14});const choice=form.createDropdown('choice');choice.addOptions(['A','B']);choice.addToPage(page,{x:20,y:170,width:100,height:20,font});return Array.from(new Uint8Array(await doc.save()))});
const hash=createHash('sha256').update(Buffer.from(fixture)).digest('hex');await page.locator('#fileInput').setInputFiles({name:'application.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture)});await page.waitForFunction(()=>document.querySelectorAll('#fields [data-index]').length===3);
await page.locator('[data-kind="text"]').fill('SolYan form');await page.locator('[data-kind="checkbox"]').check();await page.locator('[data-kind="dropdown"]').selectOption('B');await page.locator('#saveForm').click();await page.waitForFunction(()=>document.querySelectorAll('#output-results .output-result').length===1);
const row=page.locator('#output-results .output-result');assert.equal(await row.locator('strong').textContent(),'application-filled.pdf');await row.locator('.output-save').click();await page.waitForFunction(()=>window.saved.length===1);
const saved=await page.evaluate(()=>window.saved[0]);assert.equal(saved.sourceHashes.includes(hash),true);const values=await page.evaluate(async bytes=>{const doc=await PDFLib.PDFDocument.load(new Uint8Array(bytes));const f=doc.getForm();return {name:f.getTextField('person.name').getText(),checked:f.getCheckBox('consent').isChecked(),choice:f.getDropdown('choice').getSelected()};},saved.bytes);
assert.equal(values.name,'SolYan form');assert.equal(values.checked,true);assert.deepEqual(values.choice,['B']);
const after=await page.locator('#fileInput').evaluate(async e=>Array.from(new Uint8Array(await e.files[0].arrayBuffer())));assert.equal(createHash('sha256').update(Buffer.from(after)).digest('hex'),hash);
console.log(JSON.stringify({tool:'fill-form',status:'PASS',values,sourceUnchanged:true}));
}finally{await browser.close();server.close()}


