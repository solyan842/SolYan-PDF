import {test,expect} from '@playwright/test';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {qrFixture,qrPdf,qrMatches} from './reader-qr-fixture.mjs';
async function open(page){const pdf=await PDFDocument.create();for(let i=0;i<4;i++)pdf.addPage([600,800]).drawText('https://example.com/'+i,{x:40,y:650});const a=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[40,600,250,630],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of('https://example.com/link')}});pdf.getPage(0).node.set(PDFName.of('Annots'),pdf.context.obj([pdf.context.register(a)]));await page.goto('/reader.html');await page.locator('body[data-ready=true]').waitFor();await page.locator('#pdfFiles').setInputFiles({name:'Links.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.page canvas').first()).toBeVisible();}
test('PDF annotation and text links require native confirmation; Reader never navigates',async({page})=>{
 await page.addInitScript(()=>{window.__links=[];window.__TAURI__={core:{invoke:async(c,a)=>{if(c==='reader_open_pdf_link'){window.__links.push(a.address);return 'cancelled';}if(c==='reader_version')return '0.1.0';if(c==='reader_session_recent')return [];return null;}}};});
 await open(page);const before=page.url();const a=page.locator('.annotationLayer a[href="https://example.com/link"]').first();await expect(a).toBeAttached();await a.dispatchEvent('click');await expect.poll(()=>page.evaluate(()=>window.__links)).toContain('https://example.com/link');expect(page.url()).toBe(before);
 await expect(page.locator('.reader-detected-link').first()).toBeAttached();await page.locator('.reader-detected-link').first().dispatchEvent('auxclick',{button:1});await expect.poll(()=>page.evaluate(()=>window.__links.length)).toBe(2);expect(page.url()).toBe(before);await expect(page.locator('#status')).toContainText('Không mở');
});
test('preview, even reverse, four-up and booklet produce actual output sheets',async({page})=>{
 await page.addInitScript(()=>{window.print=()=>{window.__printed=true;};});await open(page);await page.keyboard.press('Control+p');await page.locator('#printParity').selectOption('even');await page.locator('#printReverse').check();await page.locator('#printPreviewButton').click();await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/2');expect(await page.locator('#readerPrintStage .reader-print-page').evaluateAll(p=>p.map(x=>x.dataset.page))).toEqual(['4','2']);await page.getByRole('button',{name:'Trang sau ›'}).click();await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 2/2');
 await page.locator('#printParity').selectOption('all');await page.locator('#printReverse').uncheck();await page.locator('#printPaper').selectOption('a4');await page.locator('#printLayout').selectOption('multiple');await page.locator('#printNup').selectOption('4');await page.locator('#printPreviewButton').click();await expect(page.locator('#readerPrintStage canvas')).toHaveCount(1);
 await page.locator('#printLayout').selectOption('booklet');await page.locator('#printOrientation').selectOption('landscape');await page.locator('#printPreviewButton').click();await expect(page.locator('#readerPrintStage canvas')).toHaveCount(2);expect(await page.locator('#readerPrintStage .reader-print-page').evaluateAll(p=>p.map(x=>x.dataset.page))).toEqual(['4,1','2,3']);await page.screenshot({path:'test-results/reader-advanced-print.png'});await page.locator('#printCancel').click();await expect(page.locator('#readerPrintStage')).toHaveCount(0);
});

for(const profile of [{name:'100% DPI',dpi:1},{name:'125% DPI',dpi:1.25},{name:'JS fallback',dpi:1,fallback:true}])test.describe(profile.name,()=>{
 test.use({deviceScaleFactor:profile.dpi});
 test('CCITT QR remains visible in the document and real print canvases',async({page})=>{
  const missing=[],warnings=[];
  page.on('response',r=>{if(r.status()===404)missing.push(r.url());});
  page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
  if(profile.fallback)await page.route('**/jbig2.wasm',route=>route.fulfill({status:404,body:'Synthetic decoder fallback test'}));
  await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.locator('#pdfFiles').setInputFiles({name:'synthetic-qr.pdf',mimeType:'application/pdf',buffer:await qrPdf()});
  const canvas=page.locator('.readerContainer:not([hidden]) .page canvas').first();await expect(canvas).toBeVisible();
  await expect.poll(()=>qrMatches(canvas)).toBe(qrFixture.modules.length**2);
  await page.keyboard.press('Control+p');await page.locator('#printPreviewButton').click();
  await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/1');
  await expect.poll(()=>qrMatches(page.locator('#readerPrintStage canvas').first())).toBe(qrFixture.modules.length**2);
  expect(missing.filter(url=>!profile.fallback||!url.endsWith('/jbig2.wasm'))).toEqual([]);
  expect(warnings.filter(w=>/Unable to decode image|JBig2 failed to initialize/.test(w))).toEqual([]);
 });
});
