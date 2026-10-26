// Actual merge UI + shared Save shelf; native dialog transport is mocked here.
import {chromium,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const assets=new Map();
for(const path of ['merge.html','merge.js','tool.css','output-name.js','output-save.js','vendor/pdf-lib.min.js'])assets.set('/'+path,await readFile(new URL('../ui/'+path,import.meta.url)));
const server=createServer((req,res)=>{const body=assets.get(req.url);res.writeHead(body?200:404,{'Content-Type':req.url.endsWith('.html')?'text/html':req.url.endsWith('.css')?'text/css':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*"});res.end(body||'not found');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
  const page=await browser.newPage();let downloads=0;page.on('download',()=>downloads++);
  await page.addInitScript(()=>{
    window.saveCalls=[];window.nextSave=null;
    window.__TAURI__={core:{invoke:async(command,args)=>{
      if(command!=='stool_save_output')throw Error('Unexpected native command');
      window.saveCalls.push(args);
      if(window.nextSave==='error')throw Error('Fixture disk error');
      return window.nextSave;
    }}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/merge.html`);
  const pdf=await page.evaluate(async()=>{const p=await PDFLib.PDFDocument.create();p.addPage([200,300]).drawText('PUBLIC SAVE UI FIXTURE');return Array.from(await p.save());});
  const input=Buffer.from(pdf),hash=createHash('sha256').update(input).digest('hex');
  await page.locator('#fileInput').setInputFiles(['one.pdf','two.pdf'].map(name=>({name,mimeType:'application/pdf',buffer:input})));
  await expect(page.locator('#outputName')).toHaveValue('one-merged.pdf');
  await page.locator('#mergeBtn').click();
  await expect(page.locator('.output-save')).toBeVisible();await expect(page.locator('.output-save-as')).toBeVisible();
  await expect(page.locator('.output-result [role=status]')).toContainText('Chưa lưu');assert.equal(downloads,0);
  for(const width of [1024,1200,1440]){
    await page.setViewportSize({width,height:850});
    await page.locator('#output-results').scrollIntoViewIfNeeded();
    const layout=await page.evaluate(()=>{
      const card=document.querySelector('#output-results').getBoundingClientRect();
      const content=document.querySelector('.merge-layout').getBoundingClientRect();
      const actions=document.querySelector('.output-result-actions').getBoundingClientRect();
      const name=document.querySelector('.output-result>strong').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        cardOffset:Math.abs(card.left-content.left),inset:name.left-card.left,
        rightInset:card.right-actions.right};
    });
    assert.ok(layout.overflow<=1,`No horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
    assert.ok(layout.cardOffset<=1,'Result card follows the tool content gutter');
    assert.ok(layout.inset>=20&&layout.rightInset>=20,'Filename and Save controls stay inset from card borders');
    if(process.env.STOOL_SAVE_SCREENSHOT_PREFIX)await page.screenshot({path:process.env.STOOL_SAVE_SCREENSHOT_PREFIX+'-'+width+'.png',fullPage:true});
  }
  // Cancel must retain the result and never display "saved".
  await page.locator('.output-save').click();await expect(page.locator('.output-result [role=status]')).toContainText('Đã hủy lưu');
  await page.evaluate(()=>window.nextSave='C:\\QA\\chosen.pdf');await page.locator('.output-save').click();
  await expect(page.locator('.output-result [role=status]')).toContainText('Đã lưu: C:\\QA\\chosen.pdf');
  await page.locator('.output-save').click();await expect(page.locator('.output-save')).toBeEnabled();
  await page.evaluate(()=>window.nextSave='C:\\QA\\different.pdf');await page.locator('.output-save-as').click();
  await expect(page.locator('.output-result [role=status]')).toContainText('different.pdf');
  const calls=await page.evaluate(()=>window.saveCalls);
  assert.deepEqual(calls.map(c=>c.saveAs),[false,false,false,true]);assert.equal(new Set(calls.map(c=>c.id)).size,1);
  for(const call of calls)assert.deepEqual(call.sourceHashes,[hash]);
  assert.equal(await page.evaluate(async bytes=>(await PDFLib.PDFDocument.load(new Uint8Array(bytes))).getPageCount(),calls[0].bytes),2);
  await page.evaluate(()=>window.nextSave='error');await page.locator('.output-save').click();
  await expect(page.locator('.output-result [role=status]')).toContainText('Fixture disk error');await expect(page.locator('.output-save')).toBeEnabled();
  await page.evaluate(()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['fixture'],{type:'application/pdf'}));a.href=url;a.download='solyan-sanitized.pdf';document.body.append(a);a.click();a.remove();});
  await expect(page.locator('.output-result').last().locator('strong')).toHaveText('one-sanitized.pdf');
  await expect(page.locator('.output-result').last().locator('.output-save-as')).toBeVisible();
  await page.evaluate(()=>{const picker=document.createElement('input');picker.type='file';picker.accept='.docx';Object.defineProperty(picker,'files',{value:[new File(['fixture'],'Agreement.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})]});document.body.append(picker);picker.dispatchEvent(new Event('change',{bubbles:true}));const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['fixture']));a.href=url;a.download='solyan-converted.pdf';document.body.append(a);a.click();a.remove();picker.remove();});
  await expect(page.locator('.output-result').last().locator('strong')).toHaveText('Agreement-converted.pdf');
  assert.equal(downloads,0);console.log('Actual merge -> visible Save/Save As, Cancel/retry, PDF bytes, source hash and errors PASS (native transport mocked)');
}finally{await browser.close();await new Promise(r=>server.close(r));}
