import { test,expect } from '@playwright/test';
import { PDFDocument,degrees,PDFName,PDFString } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile,writeFile } from 'node:fs/promises';
import os from 'node:os';
for(const deviceScaleFactor of [1,1.25])test.describe(`zoom at ${deviceScaleFactor*100}% DPI`,()=>{
  test.use({deviceScaleFactor});
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
  await stamp.scrollIntoViewIfNeeded();await expect(stamp).toBeInViewport();
  const before=await stamp.boundingBox();expect(before).not.toBeNull();
  // Hold raster drawing so fast local machines cannot hide the reset-to-render gap.
  // The overlay must use the new viewport before PDF.js finishes its async draw.
  const zoomState=await page.evaluate(async()=>{
    const {PDFPageView}=await import('/vendor/pdfjs/web/pdf_viewer.mjs');
    const originalDraw=PDFPageView.prototype.draw;let release;
    const pending=new Promise(resolve=>{release=resolve;});
    window.zoomRenderDone=false;
    PDFPageView.prototype.draw=async function(...args){await pending;const result=await originalDraw.apply(this,args);if(this.id===window.zoomSignaturePage)window.zoomRenderDone=true;return result;};
    window.releaseZoomDraw=()=>{PDFPageView.prototype.draw=originalDraw;release();};
    const signature=document.querySelector('.signature.selected'),pdfPage=signature.closest('.page');window.zoomSignaturePage=Number(pdfPage.dataset.pageNumber);
    const relative=()=>{const node=document.querySelector('.signature.selected');if(!node)return null;const r=node.getBoundingClientRect(),p=pdfPage.getBoundingClientRect(),scale=Number.parseFloat(getComputedStyle(pdfPage).getPropertyValue('--scale-factor'));return{x:(r.x-p.x)/(600*scale),y:(r.y-p.y)/(800*scale),w:r.width/(600*scale),h:r.height/(800*scale),width:r.width,height:r.height,scale:Number.parseFloat(getComputedStyle(pdfPage).getPropertyValue('--scale-factor')),pageWidth:p.width,pageHeight:p.height,pageNumber:pdfPage.dataset.pageNumber,id:node.dataset.signature};};
    const before=relative();const zoom=document.getElementById('zoom');zoom.value='1.5';zoom.dispatchEvent(new Event('change',{bubbles:true}));
    return{before,during:relative()};
  });
  // PDF.js rounds raster/CSS page bounds down at fractional DPI. Compare
  // in the fixture's 600x800 PDF viewport, retaining the existing precision.
  console.log('Zoom geometry '+JSON.stringify(zoomState));
  try {
    expect(zoomState.during,'signature survives page reset while raster rendering is pending').not.toBeNull();
    await expect(stamp).toBeVisible();
    expect(zoomState.during.id).toBe(zoomState.before.id);
    for(const axis of ['x','y','w','h'])expect(zoomState.during[axis]).toBeCloseTo(zoomState.before[axis],3);
    expect(Math.round(zoomState.during.width)).not.toBe(Math.round(before.width));
    expect(zoomState.during.pageWidth).toBeCloseTo(1200,0);expect(zoomState.during.pageHeight).toBeCloseTo(1600,0);
    expect(zoomState.during.width).toBeGreaterThan(0);expect(zoomState.during.height).toBeGreaterThan(0);
    await expect.poll(async()=>{const box=await stamp.boundingBox();return box?Math.round(box.width):null;}).toBe(Math.round(zoomState.during.width));
  } finally {await page.evaluate(()=>window.releaseZoomDraw());}
  // Assert again after the actual asynchronous page render and overlay rebuild.
  await expect.poll(()=>page.evaluate(()=>window.zoomRenderDone)).toBe(true);
  await expect(page.locator(`.page[data-page-number="${zoomState.before.pageNumber}"]`)).toHaveAttribute('data-loaded','true');
  await expect(stamp).toBeVisible();await expect(stamp).toHaveAttribute('data-signature',zoomState.before.id);
  const after=await stamp.evaluate(node=>{const pdfPage=node.closest('.page'),r=node.getBoundingClientRect(),p=pdfPage.getBoundingClientRect(),scale=Number.parseFloat(getComputedStyle(pdfPage).getPropertyValue('--scale-factor'));return{x:(r.x-p.x)/(600*scale),y:(r.y-p.y)/(800*scale),w:r.width/(600*scale),h:r.height/(800*scale),width:r.width,height:r.height};});
  for(const axis of ['x','y','w','h'])expect(after[axis]).toBeCloseTo(zoomState.before[axis],3);
  expect(after.width).toBeCloseTo(zoomState.during.width,1);expect(after.height).toBeCloseTo(zoomState.during.height,1);
  await page.locator('#applyScope').selectOption('all');await page.locator('#apply').click();await expect(page.locator('.signature')).toHaveCount(3);
  const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('Reader-da-ky.pdf');
  const saved=new Uint8Array(await readFile(await download.path()));const reopened=await getDocument({data:saved.slice()}).promise;expect(reopened.numPages).toBe(3);for(let i=1;i<=3;i++)expect((await(await reopened.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ')).toContain('SOLYAN Reader search text');await reopened.loadingTask.destroy();
  await page.locator('#pdfFiles').setInputFiles({name:'Saved.pdf',mimeType:'application/pdf',buffer:Buffer.from(saved)});await expect(page.locator('#tabs .tab')).toHaveCount(2);await expect(page.locator('.readerContainer:not([hidden]) .page canvas').first()).toBeVisible();
  await page.locator('#tabs .title').first().click();await expect(page.locator('.signature')).toHaveCount(3);
  await page.locator('.signature.selected').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/reader-signed.png'});expect(errors).toEqual([]);
});

});

test('100-page document uses lazy canvases and remains navigable offline',async({page})=>{
  const external=[];page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1:4179/'))external.push(request.url());});
  const pdf=await PDFDocument.create();for(let i=0;i<100;i++)pdf.addPage([600,800]).drawText(`Reader page ${i+1}`);
  await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');const started=Date.now();await page.locator('#pdfFiles').setInputFiles({name:'100-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.pdfViewer .page canvas').first()).toBeVisible();
  const firstPageMs=Date.now()-started;expect(await page.locator('.pdfViewer .page canvas').count()).toBeLessThan(30);
  const jumpStarted=Date.now();await page.locator('#pageNumber').fill('100');await page.locator('#pageNumber').press('Tab');await expect(page.locator('.page[data-page-number="100"] canvas').first()).toBeVisible();expect(await page.locator('.pdfViewer .page canvas').count()).toBeLessThan(30);expect(external).toEqual([]);
  const measured={fixture:'100 generated text pages; synthetic, not a real corpus',os:os.platform()+' '+os.release(),cpu:os.cpus()[0]?.model,ramBytes:os.totalmem(),firstPageMs,jumpToPage100Ms:Date.now()-jumpStarted,pageCanvasCount:await page.locator('.pdfViewer .page canvas').count(),memoryScope:'No native process/peak RAM measurement',browser:await page.context().browser().version()};await writeFile('test-results/reader-performance.json',JSON.stringify(measured,null,2));console.log('Reader measurements '+JSON.stringify(measured));
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
test('signature library survives reload and reuses artwork across PDFs',async({page})=>{
 const pdf=await PDFDocument.create();pdf.addPage([500,700]).drawText('Reusable signature source');const buffer=Buffer.from(await pdf.save());
 await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await page.locator('#pdfFiles').setInputFiles({name:'First.pdf',mimeType:'application/pdf',buffer});await expect(page.locator('.page canvas').first()).toBeVisible();
 await page.locator('#sign').click();await page.locator('#signatureName').fill('Reusable');await page.locator('#typeName').click();await page.locator('#useSign').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sreader.signatures.v1')).length)).toBe(1);
 await page.reload();await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await page.locator('#pdfFiles').setInputFiles({name:'Second.pdf',mimeType:'application/pdf',buffer});await expect(page.locator('.page canvas').first()).toBeVisible();
 await page.locator('[data-ribbon=sign]').click();await page.locator('#signatureLibrary').click();await expect(page.locator('.signature-library-row img')).toBeVisible();
 page.once('dialog',d=>d.accept('My signature'));await page.getByRole('button',{name:'Đổi tên',exact:true}).click();
 await page.getByRole('button',{name:'My signature',exact:true}).click();await expect(page.locator('.signature')).toHaveCount(1);
 const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;
 const reopened=await getDocument({data:new Uint8Array(await readFile(await download.path()))}).promise;expect(reopened.numPages).toBe(1);expect((await(await reopened.getPage(1)).getTextContent()).items.map(x=>x.str).join(' ')).toContain('Reusable signature source');await reopened.loadingTask.destroy();
 await page.locator('#signatureLibrary').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Xóa',exact:true}).click();await expect(page.locator('.signature-library-row')).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sreader.signatures.v1')))).toEqual([]);
});
test('annotation tools, undo/redo and native PDF save roundtrip',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const pdf=await PDFDocument.create();pdf.addPage([600,800]).drawText('Annotation source stays searchable',{x:50,y:700});
 await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#pdfFiles').setInputFiles({name:'Annotated.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.page canvas').first()).toBeVisible();
 await page.locator('[data-ribbon=comment]').click();
 for(const [index,kind]of ['highlight','underline','strike','note','ink','rectangle','ellipse','line','arrow'].entries()){
  await page.locator(`#annot-${kind}`).click();const box=await page.locator('.page').first().boundingBox(),x=box.x+box.width*(.15+(index%3)*.23),y=box.y+box.height*(.12+Math.floor(index/3)*.08);
  if(kind==='note')page.once('dialog',d=>d.accept('Ghi chú tiếng Việt'));
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+25,{steps:5});await page.mouse.up();await expect(page.locator('.signature.annotation')).toHaveCount(index+1);
 }
 await page.locator('[data-ribbon=home]').click();await page.locator('#undo').click();await expect(page.locator('.signature.annotation')).toHaveCount(8);await page.locator('#redo').click();await expect(page.locator('.signature.annotation')).toHaveCount(9);
 await page.locator('[data-ribbon=view]').click();await page.locator('#rotateView').click();await expect(page.locator('.signature.annotation')).toHaveCount(9);await page.locator('#theme').click();
 const pending=page.waitForEvent('download');await page.locator('#save').click();const output=await pending;const bytes=new Uint8Array(await readFile(await output.path())),reopened=await getDocument({data:bytes}).promise;
 expect((await(await reopened.getPage(1)).getAnnotations()).length).toBe(9);expect((await(await reopened.getPage(1)).getTextContent()).items.map(x=>x.str).join(' ')).toContain('Annotation source stays searchable');await reopened.loadingTask.destroy();await page.screenshot({path:'test-results/reader-r2-annotations.png'});expect(errors).toEqual([]);
});
test('selected text creates a native highlight with Unicode note editing',async({page})=>{
 const pdf=await PDFDocument.create();pdf.addPage([500,700]).drawText('Select this searchable text',{x:50,y:600});
 await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#pdfFiles').setInputFiles({name:'Selection.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.textLayer span').first()).toBeVisible();await page.locator('[data-ribbon=comment]').click();
 await page.locator('.textLayer span').first().evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(range);});await page.locator('#annot-highlight').click();await expect(page.locator('.signature.annotation[data-kind=highlight]')).toHaveCount(1);
 await page.locator('#annot-note').click();const b=await page.locator('.page').first().boundingBox();page.once('dialog',d=>d.accept('Ghi chú ban đầu'));await page.mouse.click(b.x+100,b.y+100);await expect(page.locator('#annotationNote')).toBeVisible();await page.locator('#annotationNote').fill('Đã sửa ghi chú');await page.locator('#annotationNote').press('Tab');
 const pending=page.waitForEvent('download');await page.locator('#save').click();const output=await pending;const reopened=await getDocument({data:new Uint8Array(await readFile(await output.path()))}).promise;const annots=await(await reopened.getPage(1)).getAnnotations();expect(annots.some(a=>a.subtype==='Highlight'&&a.quadPoints?.length)).toBeTruthy();expect(annots.some(a=>a.contentsObj.str==='Đã sửa ghi chú')).toBeTruthy();await reopened.loadingTask.destroy();
});

test('Fill & Sign text date check and cross roundtrip without rasterizing page',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const pdf=await PDFDocument.create();pdf.addPage([595,842]).drawText('ORIGINAL SEARCHABLE CONTENT',{x:45,y:740});
 await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await page.locator('#pdfFiles').setInputFiles({name:'Form.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 await expect(page.locator('.page canvas').first()).toBeVisible();await page.locator('[data-ribbon=sign]').click();
 await page.locator('#fillText').click();await page.locator('#fillTextInput').fill('Nguyễn Văn An');
 await page.getByRole('button',{name:'Đặt vào trang',exact:true}).click();
 await expect(page.locator('.signature img[alt="Văn bản"]')).toHaveCount(1);
 for(const id of ['fillDate','fillCheck','fillCross'])await page.locator('#'+id).click();
 await expect(page.locator('.signature')).toHaveCount(4);
 const stamp=page.locator('.signature').first(),b=await stamp.boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
 await page.mouse.move(b.x+b.width/2+15,b.y+b.height/2+9,{steps:4});await page.mouse.up();
 const download=page.waitForEvent('download');await page.locator('#save').click();const saved=await download;
 expect(saved.suggestedFilename()).toBe('Form-da-dien.pdf');
 const opened=await getDocument({data:new Uint8Array(await readFile(await saved.path()))}).promise;
 const page1=await opened.getPage(1);expect((await page1.getTextContent()).items.map(x=>x.str).join(' ')).toContain('ORIGINAL SEARCHABLE CONTENT');
 const ops=await page1.getOperatorList();expect(ops.fnArray.filter(x=>x===85).length).toBeGreaterThanOrEqual(4);
 await opened.loadingTask.destroy();expect(errors).toEqual([]);
});
