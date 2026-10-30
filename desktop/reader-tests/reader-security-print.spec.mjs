import {test,expect} from '@playwright/test';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {qrFixture,qrPdf,qrMatches} from './reader-qr-fixture.mjs';
async function open(page,count=4,size=[600,800]){const pdf=await PDFDocument.create();for(let i=0;i<count;i++)pdf.addPage(size).drawText('https://example.com/'+i,{x:40,y:Math.min(650,size[1]-80)});const a=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[40,600,250,630],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of('https://example.com/link')}});pdf.getPage(0).node.set(PDFName.of('Annots'),pdf.context.obj([pdf.context.register(a)]));await page.goto('/reader.html');await page.locator('body[data-ready=true]').waitFor();await page.locator('#pdfFiles').setInputFiles({name:'Links.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await expect(page.locator('.page canvas').first()).toBeVisible();}
test('PDF annotation and text links require native confirmation; Reader never navigates',async({page})=>{
 await page.addInitScript(()=>{window.__links=[];window.__TAURI__={core:{invoke:async(c,a)=>{if(c==='reader_open_pdf_link'){window.__links.push(a.address);return 'cancelled';}if(c==='reader_version')return '0.1.0';if(c==='reader_session_recent')return [];return null;}}};});
 await open(page);const before=page.url();const a=page.locator('.annotationLayer a[href="https://example.com/link"]').first();await expect(a).toBeAttached();await a.dispatchEvent('click');await expect.poll(()=>page.evaluate(()=>window.__links)).toContain('https://example.com/link');expect(page.url()).toBe(before);
 await expect(page.locator('.reader-detected-link').first()).toBeAttached();await page.locator('.reader-detected-link').first().dispatchEvent('auxclick',{button:1});await expect.poll(()=>page.evaluate(()=>window.__links.length)).toBe(2);expect(page.url()).toBe(before);await expect(page.locator('#status')).toContainText('Không mở');
});
test('Windows print workspace selects a printer, opens its Properties and submits copies to that printer',async({page})=>{
 await page.addInitScript(()=>{window.__printerProperties=[];window.__submittedPrint=null;window.print=()=>{window.__browserPrint=true;};window.__TAURI__={core:{invoke:async(command,args)=>{
  if(command==='reader_list_printers')return[{name:'Default Laser',is_default:true},{name:'Office Printer',is_default:false}];
  if(command==='reader_open_printer_properties'){window.__printerProperties.push(args.printerName);return null;}
  if(command==='reader_print'){window.__submittedPrint=args;return null;}
  if(command==='reader_version')return'0.1.0';
  if(command==='reader_session_recent')return[];
  return null;
 }}};});
 await open(page);await page.keyboard.press('Control+p');await expect(page.locator('#readerPrintDialog')).toHaveAttribute('open','');
 await expect(page.locator('#printPrinter option')).toHaveCount(2);await expect(page.locator('#printPrinter')).toHaveValue('Default Laser');
 await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/4');await expect.poll(()=>page.locator('.reader-print-settings').evaluate(e=>e.inert)).toBe(false);
 const boxes=await Promise.all(['#printPrinter','#printPrinterProperties','#printCopies'].map(s=>page.locator(s).boundingBox()));expect(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))).toBeLessThanOrEqual(1);expect(boxes[0].x+boxes[0].width).toBeLessThanOrEqual(boxes[1].x+1);expect(boxes[1].x+boxes[1].width).toBeLessThanOrEqual(boxes[2].x+1);
 await page.locator('#printPrinter').selectOption('Office Printer');await page.locator('#printCopies').fill('2');await expect(page.locator('#printCopies')).toHaveValue('2');await page.locator('#printPrinterProperties').click();
 await expect.poll(()=>page.evaluate(()=>window.__printerProperties)).toEqual(['Office Printer']);
 await page.locator('#printStart').click();await expect.poll(()=>page.evaluate(()=>window.__submittedPrint)).toEqual({printerName:'Office Printer',copies:2,duplex:'default'});
 expect(await page.evaluate(()=>window.__browserPrint)).toBeUndefined();
});
test('English print dialog applies scale options to preview and routes duplex to WebView2',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('sreader.language','en');window.__submittedPrint=null;window.print=()=>{};window.__TAURI__={core:{invoke:async(command,args)=>{if(command==='reader_list_printers')return[{name:'Default Laser',is_default:true}];if(command==='reader_print'){window.__submittedPrint=args;return null;}if(command==='reader_version')return'0.1.0';if(command==='reader_session_recent')return[];return null;}}};});
 await open(page,1,[300,400]);await page.keyboard.press('Control+p');
 await expect(page.locator('#readerPrintDialog h2')).toContainText('Print');
 await expect(page.locator('.reader-print-group h3').first()).toHaveText('Printer');
 await expect(page.locator('#printSubset option[value="all"]')).toHaveText('All');
 await expect(page.locator('#printScale option[value="fit"]')).toHaveText('Fit to printable area');
 await expect(page.locator('#printDuplex option[value="long-edge"]')).toHaveText('Two-sided · flip on long edge');
 const ink=()=>page.locator('#readerPrintStage canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<220||d[i+1]<220||d[i+2]<220)n++;return n;});
 await page.locator('#printPaper').selectOption('a4');const fitInk=await ink();
 await page.locator('#printScale').selectOption('actual');await expect.poll(ink).not.toBe(fitInk);const actualInk=await ink();
 await page.locator('#printScale').selectOption('reduce');await expect.poll(ink).toBe(actualInk);
 await page.locator('#printScale').selectOption('fit');await expect.poll(ink).toBe(fitInk);
 await page.locator('#printDuplex').selectOption('long-edge');await page.locator('#printStart').click();
 await expect.poll(()=>page.evaluate(()=>window.__submittedPrint)).toEqual({printerName:'Default Laser',copies:1,duplex:'long-edge'});
});
test('Ctrl+P opens the centered in-app preview before the browser fallback print interface',async({page})=>{
 await page.addInitScript(()=>{window.print=()=>{window.__printed=true;};});await open(page);await page.keyboard.press('Control+p');
 await expect(page.locator('#readerPrintDialog')).toHaveAttribute('open','');await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/4');await expect(page.locator('#printPreviewZoomIn')).toHaveCount(0);await expect(page.locator('#printPreviewZoomOut')).toHaveCount(0);await expect(page.locator('#printPreviewZoomFit')).toHaveCount(0);await page.locator('#printStart').click();await expect.poll(()=>page.evaluate(()=>window.__printed)).toBe(true);await expect(page.locator('#readerPrintDialog')).not.toHaveAttribute('open','');
 await expect(page.locator('#readerPrintStage .reader-print-page')).toHaveCount(4);
});
test('documents over 50 pages still show a safe first-sheet preview',async({page})=>{
 await open(page,51);await page.locator('#readerMenu').click();await page.locator('#printLayoutOptions').click();await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/51');await expect(page.locator('#readerPrintStage canvas')).toHaveCount(1);await expect(page.locator('#printStatus')).toContainText('Chọn tối đa 50 trang');await expect(page.locator('#printPreviewZoomIn')).toHaveCount(0);await expect(page.locator('#printPreviewZoomOut')).toHaveCount(0);await expect(page.locator('#printPreviewZoomFit')).toHaveCount(0);await page.getByRole('button',{name:'Trang sau ›'}).click();await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 2/51');expect(await page.locator('#readerPrintStage .reader-print-page').evaluate(e=>e.dataset.page)).toBe('2');
 await page.locator('#printRange').fill('51');await page.locator('#printRange').press('Tab');await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/1');expect(await page.locator('#readerPrintStage .reader-print-page').evaluate(e=>e.dataset.page)).toBe('51');await page.locator('#printCancel').click();
});
test('preview, even reverse, four-up and booklet produce actual output sheets',async({page})=>{
 await page.addInitScript(()=>{window.print=()=>{window.__printed=true;};});await open(page);await page.locator('#readerMenu').click();await page.locator('#printLayoutOptions').click();await expect(page.locator('.reader-print-logo')).toHaveAttribute('src','./vendor/sReader_PDF.png');await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/4');await page.locator('#printParity').selectOption('even');await page.locator('#printReverse').check();await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/2');expect(await page.locator('#readerPrintStage .reader-print-page').evaluateAll(p=>p.map(x=>x.dataset.page))).toEqual(['4','2']);
 const outputSize=await page.locator('#readerPrintStage canvas').first().evaluate(c=>[c.width,c.height]);await expect(page.locator('#printPreviewZoomOut')).toHaveCount(0);await expect(page.locator('#printPreviewZoomLevel')).toHaveText('100%');expect(await page.locator('#readerPrintStage canvas').first().evaluate(c=>[c.width,c.height])).toEqual(outputSize);await page.getByRole('button',{name:'Trang sau ›'}).click();await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 2/2');
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
  await page.locator('#readerMenu').click();await page.locator('#printLayoutOptions').click();await page.locator('#printPreviewButton').click();
  await expect(page.locator('#printPreviewPage')).toHaveText('Tờ 1/1');
  await expect.poll(()=>qrMatches(page.locator('#readerPrintStage canvas').first())).toBe(qrFixture.modules.length**2);
  expect(missing.filter(url=>!profile.fallback||!url.endsWith('/jbig2.wasm'))).toEqual([]);
  expect(warnings.filter(w=>/Unable to decode image|JBig2 failed to initialize/.test(w))).toEqual([]);
 });
});
