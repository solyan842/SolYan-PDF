import { test,expect } from '@playwright/test';
import { PDFDocument,degrees,PDFName,PDFString } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
test('open, tabs, find, zoom, all resize handles, apply, Save As and reopen preserve text',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pdf=await PDFDocument.create();for(let i=0;i<3;i++){const p=pdf.addPage([600,800]);p.drawText('SOLYAN Reader search text',{x:60,y:650});if(i===1)p.setRotation(degrees(90));}
  const outline=pdf.context.obj({Type:'Outlines',Count:1});const ref=pdf.context.register(outline);const entry=pdf.context.register(pdf.context.obj({Title:PDFString.of('Chuong 3'),Parent:ref,Dest:[pdf.getPage(2).ref,PDFName.of('Fit')]}));outline.set(PDFName.of('First'),entry);outline.set(PDFName.of('Last'),entry);pdf.catalog.set(PDFName.of('Outlines'),ref);
  const bytes=await pdf.save();const fixture={name:'Reader.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)};
  await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#pdfFiles').setInputFiles(fixture);await expect(page.locator('.page canvas').first()).toBeVisible();
  await expect(page.locator('.thumbnail canvas').first()).toBeVisible();
  await page.locator('#showOutline').click();await page.getByRole('button',{name:'Chuong 3',exact:true}).click();await expect(page.locator('#pageNumber')).toHaveValue('3');await page.locator('#pageNumber').fill('1');await page.locator('#pageNumber').press('Tab');await page.locator('#showThumbs').click();
  await page.locator('#query').fill('SOLYAN');await page.locator('#query').press('Enter');await expect(page.locator('#matches')).toHaveText(/\d+\/3/);
  await page.locator('#sign').click();await page.locator('#signatureName').fill('SolYan');await page.locator('#typeName').click();await page.locator('#useSign').click();
  let stamp=page.locator('.signature.selected');await expect(stamp).toBeVisible();
  const drag=async(locator,dx,dy)=>{const box=await locator.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:6});await page.mouse.up();};
  await drag(stamp,40,-40);
  for(const handle of ['nw','n','ne','e','se','s','sw','w']){await drag(stamp.locator(`[data-h=${handle}]`),handle.includes('w')?-4:4,handle.includes('n')?-3:3);}
  const before=await stamp.boundingBox();await page.locator('#zoom').selectOption('1.5');await expect.poll(async()=>Math.round((await stamp.boundingBox()).width)).not.toBe(Math.round(before.width));
  await page.locator('#applyScope').selectOption('all');await page.locator('#apply').click();await expect(page.locator('.signature')).toHaveCount(3);
  const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('Reader-da-ky.pdf');
  const saved=new Uint8Array(await readFile(await download.path()));const reopened=await getDocument({data:saved.slice()}).promise;expect(reopened.numPages).toBe(3);for(let i=1;i<=3;i++)expect((await(await reopened.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ')).toContain('SOLYAN Reader search text');await reopened.loadingTask.destroy();
  await page.locator('#pdfFiles').setInputFiles({name:'Saved.pdf',mimeType:'application/pdf',buffer:Buffer.from(saved)});await expect(page.locator('#tabs .tab')).toHaveCount(2);await expect(page.locator('.readerContainer:not([hidden]) .page canvas').first()).toBeVisible();
  await page.locator('#tabs .title').first().click();await expect(page.locator('.signature')).toHaveCount(3);
  await page.locator('.signature.selected').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/reader-signed.png'});expect(errors).toEqual([]);
});

test('100-page document uses lazy canvases and remains navigable offline',async({page})=>{
  const external=[];page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1:4179/'))external.push(request.url());});
  const pdf=await PDFDocument.create();for(let i=0;i<100;i++)pdf.addPage([600,800]).drawText(`Reader page ${i+1}`);
  await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#pdfFiles').setInputFiles({name:'100-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.pdfViewer .page canvas').first()).toBeVisible();
  expect(await page.locator('.pdfViewer .page canvas').count()).toBeLessThan(30);
  await page.locator('#pageNumber').fill('100');await page.locator('#pageNumber').press('Tab');await expect(page.locator('.page[data-page-number="100"] canvas').first()).toBeVisible();expect(await page.locator('.pdfViewer .page canvas').count()).toBeLessThan(30);expect(external).toEqual([]);
});

test('mouse and image signatures, selected range, native Save As cancel/success bridge',async({page})=>{
  await page.addInitScript(()=>{window.__saveCalls=[];window.__savePath=null;window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='reader_save_as'){window.__saveCalls.push(args);return window.__savePath;}return null;}}};});
  const pdf=await PDFDocument.create();for(let i=0;i<3;i++)pdf.addPage([500,700]).drawText('Preserve this source');
  await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#pdfFiles').setInputFiles({name:'Mouse.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.page canvas').first()).toBeVisible();
  await page.locator('#sign').click();const ink=await page.locator('#ink').boundingBox();await page.mouse.move(ink.x+40,ink.y+60);await page.mouse.down();await page.mouse.move(ink.x+180,ink.y+100,{steps:12});await page.mouse.up();await page.locator('#useSign').click();await expect(page.locator('.signature')).toHaveCount(1);
  await page.locator('#applyScope').selectOption('range');await page.locator('#range').fill('1,3');await page.locator('#apply').click();await expect(page.locator('.signature')).toHaveCount(2);
  await page.locator('#sign').click();await page.locator('#signatureFile').setInputFiles({name:'stamp.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=40;const x=c.getContext('2d');x.fillStyle='blue';x.fillRect(5,5,100,25);return c.toDataURL().split(',')[1];}),'base64')});await page.locator('#useSign').click();await expect(page.locator('.signature')).toHaveCount(3);
  await page.locator('#save').click();await expect(page.locator('#status')).toContainText('Đã hủy lưu');await expect(page.locator('#tabs .title')).toContainText('●');
  await page.evaluate(()=>{window.__savePath='C:/Saved/Mouse-da-ky.pdf';});await page.locator('#save').click();await expect(page.locator('#status')).toContainText('Đã lưu bản PDF mới');await expect(page.locator('#tabs .title')).not.toContainText('●');
  const saved=await page.evaluate(()=>window.__saveCalls.at(-1));expect(saved.name).toBe('Mouse-da-ky.pdf');const reopened=await PDFDocument.load(Uint8Array.from(saved.bytes));expect(reopened.getPageCount()).toBe(3);
});
