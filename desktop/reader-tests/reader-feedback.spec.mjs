import {test,expect} from '@playwright/test';
import {PDFDocument,degrees} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {readFile} from 'node:fs/promises';
import {command} from './reader-command.mjs';
async function open(page,{navigate=true}={}){const pdf=await PDFDocument.create();for(const [i,size]of [[600,800],[800,600],[14400,14400]].entries()){const p=pdf.addPage(size);p.drawText('Ghi chú SOURCE '+(i+1),{x:60,y:size[1]-100});if(i===1)p.setRotation(degrees(90));}const buffer=Buffer.from(await pdf.save());if(navigate){await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');}await page.locator('#pdfFiles').setInputFiles({name:'Mở PDF.pdf',mimeType:'application/pdf',buffer});await expect(page.locator('.page canvas').first()).toBeVisible();return buffer;}
async function stamp(page){await page.locator('#sign').click();await page.locator('#signatureName').fill('SolYan');await page.locator('#typeName').click();await page.locator('#useSign').click();await expect(page.locator('.signature.selected')).toBeVisible();}
for(const deviceScaleFactor of [1,1.25])test.describe(`refined selection ${deviceScaleFactor}`,()=>{test.use({deviceScaleFactor});test('small handles, transparent artwork, Delete guard, fixed file buttons and Ctrl-wheel',async({page})=>{
  await page.goto('/reader.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  // Compare the same WebView document before and after opening the PDF. The
  // old helper navigated a SECOND time, making its zero-tolerance header
  // measurement depend on asynchronous Windows font initialization.
  await page.evaluate(()=>document.fonts.ready);
  const before=await page.locator('#open').boundingBox();
  await open(page,{navigate:false});
  // Keep EXACT toolbar geometry acceptance, with font loading settled.
  await expect.poll(async()=>{
    await page.evaluate(()=>document.fonts.ready);
    return (await page.locator('#open').boundingBox()).x;
  },{message:'PDF opening must not shift the Open button'}).toBe(before.x);
  await expect(page.locator('header #saveCurrent')).toBeVisible();await expect(page.locator('header #save')).toBeVisible();await expect(page.locator('header #tools')).toBeVisible();
  await stamp(page);await page.locator('#zoom').selectOption('1.5');const mark=page.locator('.signature.selected'),id=await mark.getAttribute('data-signature');
  // PDF.js rebuilds the signature overlay during zoom. A Locator.all() array
  // can hold eight handles from an obsolete DOM generation; boundingBox()
  // correctly returns null for those detached nodes. Sample everything from
  // ONE connected generation and poll until PDF.js finishes the redraw.
  // All original checks are retained: same signature ID, transparent artwork,
  // exactly eight visible handles, each 14px wide (toBeCloseTo(14, 0) tolerance).
  await expect.poll(() => page.evaluate(() => {
    const node = document.querySelector('.readerContainer:not([hidden]) .signature.selected');
    if (!node?.isConnected || !node.closest('.page')?.isConnected) return null;
    const handles = [...node.querySelectorAll('.handle:not([hidden])')];
    const widths = handles.map(handle => handle.getBoundingClientRect().width);
    return {
      id: node.dataset.signature,
      background: getComputedStyle(node).backgroundColor,
      handleCount: handles.length,
      handles14px: widths.length === 8 && widths.every(width =>
        Number.isFinite(width) && Math.abs(width - 14) < 0.5
      )
    };
  }), {message: 'stable selected signature with eight 14px handles after zoom redraw'})
    .toEqual({id, background: 'rgba(0, 0, 0, 0)', handleCount: 8, handles14px: true});
  await page.locator('#query').fill('keep');await page.locator('#query').press('Delete');await expect(mark).toHaveAttribute('data-signature',id);
  await page.locator('#readerMenu').focus();await page.keyboard.press('Delete');await expect(page.locator('.signature')).toHaveCount(0);await command(page,'undo');await expect(page.locator('.signature')).toHaveCount(1);
  const canvas=page.locator('.readerContainer:not([hidden]) .page').first(),box=await canvas.boundingBox(),container=await page.locator('.readerContainer:not([hidden])').boundingBox();const point={x:Math.max(box.x,container.x)+100,y:Math.max(box.y,container.y)+100};
  const relative=b=>({x:(point.x-b.x)/b.width,y:(point.y-b.y)/b.height}),origin=relative(box),oldScale=await canvas.evaluate(el=>parseFloat(getComputedStyle(el).getPropertyValue('--scale-factor')));
  await page.mouse.move(point.x,point.y);await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');
  await expect.poll(()=>canvas.evaluate(el=>parseFloat(getComputedStyle(el).getPropertyValue('--scale-factor')))).toBeGreaterThan(oldScale);
  const after=relative(await canvas.boundingBox());expect(after.x).toBeCloseTo(origin.x,2);expect(after.y).toBeCloseTo(origin.y,2);await expect(page.locator('.signature')).toHaveAttribute('data-signature',id);
  const footer=await page.locator('#readerFooter').boundingBox(),main=await page.locator('main').boundingBox();expect(footer.y).toBeGreaterThanOrEqual(main.y+main.height);await page.locator('.signature').click({position:{x:25,y:15}});await page.screenshot({path:`test-results/reader-refined-${deviceScaleFactor}.png`});
});});
test('F11 fits one page on black, renders pending marks, navigates mixed pages and restores editor',async({page})=>{
  await open(page);await page.locator('#pageNumber').fill('2');await page.locator('#pageNumber').press('Tab');await command(page,'fillCheck');await page.locator('#zoom').selectOption('1.5');
  const before=await page.evaluate(()=>{const c=document.querySelector('.readerContainer:not([hidden])');return {top:c.scrollTop,left:c.scrollLeft,page:document.getElementById('pageNumber').value,id:document.querySelector('.signature.selected').dataset.signature,zoom:document.getElementById('zoom').value};});
  await page.keyboard.press('F11');await expect(page.locator('#presentationStage')).toBeVisible();await expect(page.locator('#presentationStage')).toHaveAttribute('data-page','2');await expect(page.locator('.toolbar')).toBeHidden();await expect(page.locator('.presentation-mark')).toHaveCount(1);
  expect(await page.evaluate(()=>document.fullscreenElement?.id)).toBe('presentationStage');
  await page.keyboard.press('ArrowRight');await expect(page.locator('#presentationStage')).toHaveAttribute('data-page','3');
  const geometry=await page.locator('.presentation-paper').evaluate(el=>{const r=el.getBoundingClientRect(),c=el.querySelector('canvas');return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,pixels:c.width*c.height,w:innerWidth,h:innerHeight};});expect(geometry.x).toBeGreaterThanOrEqual(0);expect(geometry.y).toBeGreaterThanOrEqual(0);expect(geometry.right).toBeLessThanOrEqual(geometry.w);expect(geometry.bottom).toBeLessThanOrEqual(geometry.h);expect(geometry.pixels).toBeLessThanOrEqual(12_000_000);
  await page.screenshot({path:'test-results/reader-presentation-F11.png'});await page.keyboard.press('Home');await expect(page.locator('#presentationStage')).toHaveAttribute('data-page','1');await page.keyboard.press('Escape');await expect(page.locator('#presentationStage')).toBeHidden();
  const after=await page.evaluate(()=>{const c=document.querySelector('.readerContainer:not([hidden])');return {top:c.scrollTop,left:c.scrollLeft,page:document.getElementById('pageNumber').value,id:document.querySelector('.signature.selected').dataset.signature,zoom:document.getElementById('zoom').value};});expect(after).toEqual(before);await expect(page.locator('#tabs .title')).toContainText('●');
});
test('English UI, About, colored marks and three-font searchable typewriter output',async({page})=>{
  await open(page);await command(page,'settings');await page.locator('#readerLanguage').selectOption('en');await expect(page.locator('html')).toHaveAttribute('lang','en');await page.keyboard.press('Escape');await expect(page.locator('#saveCurrent')).toHaveAttribute('title','Save (Ctrl+S)');await expect(page.locator('#tabs .title')).toHaveText('Mở PDF.pdf');await expect(page.locator('.textLayer').first()).toContainText('Ghi chú SOURCE');
  await command(page,'about');await expect(page.locator('#readerAbout')).toContainText('Hoang Minh Anh / SolYan84');await expect(page.locator('#readerAbout')).toContainText('yansign841@gmail.com');await expect(page.locator('#aboutVersion')).toHaveText('0.1.0');await expect(page.locator('#readerAbout a[href="https://www.youtube.com/@SolYan-Music"]')).toBeVisible();await page.keyboard.press('Escape');
  // The old detached toolStyle popover is retired; each tool opens the
  // shared right Format inspector, including palette and live opacity.
  await page.locator('#annot-ink').click();
  await expect(page.locator('#readerFormatPanel')).toBeVisible();
  await page.locator('#formatCustomColor').evaluate(el=>{el.value='#cc1122';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#formatOpacity').evaluate(el=>{el.value='72';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#formatPenWidth').selectOption('4');
  await page.locator('#annot-highlight').click();
  await expect(page.locator('#readerStyleTitle')).toContainText('Highlight Style');
  await page.locator('#formatCustomColor').evaluate(el=>{el.value='#22cc44';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#formatOpacity').evaluate(el=>{el.value='45';el.dispatchEvent(new Event('input',{bubbles:true}));});
  for(const [kind,y]of [['ink',240],['highlight',280]]){await page.locator('#annot-'+kind).click();const b=await page.locator('.page').first().boundingBox();await page.mouse.move(b.x+80,b.y+y);await page.mouse.down();await page.mouse.move(b.x+200,b.y+y+20,{steps:4});await page.mouse.up();}
  await expect(page.locator('[data-kind=ink] svg polyline')).toHaveAttribute('stroke','#cc1122');await expect(page.locator('[data-kind=highlight] svg rect')).toHaveAttribute('fill','#22cc44');
  for(const [index,font]of ['sans','serif','mono'].entries()){await page.locator('#typewriter').click();await page.locator('#typewriterFont').selectOption(font);await page.locator('#typewriterSize').fill('16');await page.locator('#typewriterColor').evaluate(el=>{el.value='#992244';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#fillTextInput').fill('Tiếng Việt: Nguyễn Văn An '+font);await page.locator('#typewriterPlace').click();await expect(page.locator('.signature.selected')).toContainText('Tiếng Việt: Nguyễn Văn An '+font);const b=await page.locator('.signature.selected').boundingBox();await page.mouse.move(b.x+30,b.y+10);await page.mouse.down();await page.mouse.move(b.x+30,b.y+10+index*45,{steps:5});await page.mouse.up();}
  await page.locator('.signature.selected').dblclick({position:{x:30,y:10}});await expect(page.locator('#typewriterFont')).toHaveValue('mono');await expect(page.locator('#typewriterSize')).toHaveValue('16');await expect(page.locator('#typewriterColor')).toHaveValue('#992244');await page.locator('#fillTextInput').fill('Tiếng Việt: Nguyễn Văn An mono\nGhi chú');await page.locator('#typewriterPlace').click();await expect(page.locator('.signature.selected')).toContainText('Ghi chú');
  await expect(page.locator('.typewriter-visual')).toHaveCount(3);await expect(page.locator('#tabs .title')).toContainText('●');
  const pending=page.waitForEvent('download');await page.locator('#save').click();const download=await pending;const pdf=await getDocument({data:new Uint8Array(await readFile(await download.path()))}).promise,p=await pdf.getPage(1),text=(await p.getTextContent()).items.map(x=>x.str).join(' ').replace(/\s+/g,' ');expect(text).toContain('Ghi chú SOURCE');for(const font of ['sans','serif','mono'])expect(text).toContain('Tiếng Việt: Nguyễn Văn An '+font);
  const annotations=await p.getAnnotations();expect(annotations.some(a=>a.subtype==='Ink'&&a.color[0]===204&&a.color[1]===17)).toBe(true);expect(annotations.some(a=>a.subtype==='Highlight'&&a.color[1]===204)).toBe(true);await pdf.loadingTask.destroy();await page.screenshot({path:'test-results/reader-English-typewriter.png'});
  await command(page,'settings');await page.locator('#readerLanguage').selectOption('vi');await expect(page.locator('#saveCurrent')).toHaveAttribute('title','Lưu (Ctrl+S)');await page.locator('#readerLanguage').selectOption('en');await page.keyboard.press('Escape');page.once('dialog',d=>d.accept());await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('#open')).toHaveAttribute('title','Open PDF (Ctrl+O)');
});
test('Save uses a chosen copy; Save As chooses another target and cancellation keeps dirty edits',async({page})=>{
  await page.addInitScript(()=>{window.__calls=[];window.__target=null;window.__TAURI__={core:{invoke:async(name,args)=>{if(name==='reader_save_as'||name==='reader_save'){window.__calls.push({name,args});return window.__target;}return null;}}};});await open(page);await command(page,'fillCheck');
  await page.keyboard.press('Control+s');await expect(page.locator('#status')).toContainText('Đã hủy lưu');await expect(page.locator('#tabs .title')).toContainText('●');
  await page.evaluate(()=>window.__target='C:/Saved/copy.pdf');await page.locator('#saveCurrent').click();await expect(page.locator('#tabs .title')).not.toContainText('●');await command(page,'fillCross');await page.keyboard.press('Control+s');await expect.poll(()=>page.evaluate(()=>window.__calls.at(-1).name)).toBe('reader_save');
  await page.keyboard.press('Control+Shift+s');await expect.poll(()=>page.evaluate(()=>window.__calls.at(-1).name)).toBe('reader_save_as');expect(await page.evaluate(()=>window.__calls[1].args.document===window.__calls[2].args.document)).toBe(true);
});

test('optional Unicode font engine loads only for Typewriter and only once',async({page})=>{
  const fontkitRequests=[];
  page.on('request',request=>{if(request.url().endsWith('/vendor/fontkit.umd.min.js'))fontkitRequests.push(request.url());});
  const pdf=await PDFDocument.create();
  pdf.addPage([600,800]).drawText('Reader opens without fontkit');
  await page.goto('/reader.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  expect(fontkitRequests).toHaveLength(0);
  await page.locator('#pdfFiles').setInputFiles({name:'Read-only.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.locator('.page canvas').first()).toBeVisible();
  expect(fontkitRequests).toHaveLength(0);
  await page.locator('#typewriter').click();
  await page.locator('#fillTextInput').fill('Mở PDF thật nhanh');
  await page.locator('#typewriterPlace').click();
  await expect(page.locator('.signature.selected')).toContainText('Mở PDF thật nhanh');
  expect(fontkitRequests).toHaveLength(1);
  await page.locator('#typewriter').click();
  await page.locator('#typewriterFont').selectOption('serif');
  await page.locator('#fillTextInput').fill('Tiếng Việt vẫn đúng');
  await page.locator('#typewriterPlace').click();
  await expect(page.locator('.signature.selected')).toContainText('Tiếng Việt vẫn đúng');
  expect(fontkitRequests).toHaveLength(1);
});

test('presentation zooms from fullscreen without changing Reader zoom',async({page})=>{
  await open(page);
  await page.locator('#zoom').selectOption('1.5');
  const readerZoom=await page.locator('#zoom').inputValue();
  await page.keyboard.press('F11');
  await expect(page.locator('#presentationStage')).toHaveAttribute('data-zoom','1');
  const sheet=page.locator('.presentation-paper');
  const fitted=await sheet.boundingBox();
  await page.locator('#presentationZoomTools button[title="Phóng to (+)"]').click();
  await expect(page.locator('#presentationStage')).toHaveAttribute('data-zoom','1.25');
  await expect.poll(async()=>Number((await sheet.boundingBox())?.width||0)).toBeGreaterThan(fitted.width*1.2);
  await page.locator('#presentationZoomTools button[title="Thu nhỏ (−)"]').click();
  await expect(page.locator('#presentationStage')).toHaveAttribute('data-zoom','1');
  await page.locator('#presentationViewport').hover({position:{x:60,y:80}});
  await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');
  await expect(page.locator('#presentationStage')).toHaveAttribute('data-zoom','1.25');
  await page.locator('#presentationZoomTools button[title="Vừa màn hình (0)"]').click();
  await expect(page.locator('#presentationStage')).toHaveAttribute('data-zoom','1');
  await page.keyboard.press('+');
  await expect(page.locator('#presentationStage')).toHaveAttribute('data-zoom','1.25');
  await page.keyboard.press('Escape');
  await expect(page.locator('#presentationStage')).toBeHidden();
  await expect(page.locator('#zoom')).toHaveValue(readerZoom);
});

test('Windows touchpad pinch targets PDF zoom; two-finger scroll keeps natural scrolling',async({page})=>{
  const pdf=await PDFDocument.create();
  for(let n=0;n<4;n++)pdf.addPage([612,792]).drawText('Touchpad '+n,{x:50,y:730});
  await page.goto('/reader.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.locator('#pdfFiles').setInputFiles({name:'Touchpad.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  const viewer=page.locator('.readerContainer:not([hidden])');
  await expect(viewer.locator('.page canvas').first()).toBeVisible();
  const initial=await viewer.evaluate(el=>({scale:parseFloat(getComputedStyle(el.querySelector('.page')).getPropertyValue('--scale-factor')),left:el.scrollLeft,top:el.scrollTop,ratio:devicePixelRatio,visual:visualViewport?.scale||1}));
  const rect=await viewer.boundingBox();
  const x=rect.x+Math.min(210,rect.width/2),y=rect.y+Math.min(230,rect.height/2);
  // The touchpad's two-finger SCROLL is an unmodified wheel and must not be consumed.
  const scrolling=await page.evaluate(({x,y})=>{
    const target=document.elementFromPoint(x,y);
    const plain=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:false,clientX:x,clientY:y,deltaY:110});
    target.dispatchEvent(plain);
    return plain.defaultPrevented;
  },{x,y});
  expect(scrolling).toBe(false);
  // Dispatched untrusted WheelEvent does not necessarily perform native scroll
  // in Chromium; Playwright's real input emulation checks the scroll pathway.
  await page.mouse.move(x,y);await page.mouse.wheel(0,110);
  await expect.poll(async()=>viewer.evaluate(el=>el.scrollTop)).toBeGreaterThan(initial.top);
  await page.evaluate(({x,y})=>{
    const target=document.elementFromPoint(x,y);
    const gesture=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,clientX:x,clientY:y,deltaY:-92});
    target.dispatchEvent(gesture);
    if(!gesture.defaultPrevented)throw Error('Pinch must cancel native WebView/browser page zoom');
  },{x,y});
  await expect.poll(async()=>viewer.evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.page')).getPropertyValue('--scale-factor')))).toBeGreaterThan(initial.scale);
  const enlarged=await viewer.evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.page')).getPropertyValue('--scale-factor')));
  // Pinch in and out without Ctrl key physically held by the laptop user:
  // Chromium supplies ctrlKey to this synthetic wheel pathway.
  await page.evaluate(({x,y})=>document.elementFromPoint(x,y).dispatchEvent(
    new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,clientX:x,clientY:y,deltaY:92})),{x,y});
  await expect.poll(async()=>viewer.evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.page')).getPropertyValue('--scale-factor')))).toBeLessThan(enlarged);
  expect(await page.evaluate(()=>({ratio:devicePixelRatio,visual:visualViewport?.scale||1}))).toEqual({ratio:initial.ratio,visual:initial.visual});
  // Wheel outside document must not zoom shell or change PDF scale.
  const outside=await page.locator('header').boundingBox();
  const didCancel=await page.evaluate(({x,y})=>{
    const target=document.elementFromPoint(x,y);
    const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,clientX:x,clientY:y,deltaY:-80});
    target.dispatchEvent(e);return e.defaultPrevented;
  },{x:outside.x+25,y:outside.y+20});
  expect(didCancel).toBe(true);
});

test('Hand defaults, right Format follows tools, opacity & pencil width survive native PDF Save As',async({page})=>{
  await open(page);
  await expect(page.locator('#pan')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#selectText')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#readerFormatPanel')).toBeHidden();
  await page.locator('#annot-ink').click();
  await expect(page.locator('#readerFormatPanel')).toBeVisible();
  await expect(page.locator('#readerAnnotationFormat')).toBeVisible();
  await expect(page.locator('#readerTextFormat')).toBeHidden();
  await expect(page.locator('#toolStyle')).toHaveCount(0);
  await page.locator('#formatColorPalette button[data-color="#fa3434"]').click();
  await page.locator('#formatOpacity').evaluate(el=>{el.value='63';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#formatPenWidth').selectOption('6');
  const bounds=await page.locator('.page').first().boundingBox();
  await page.mouse.move(bounds.x+100,bounds.y+300);
  await page.mouse.down();await page.mouse.move(bounds.x+180,bounds.y+340,{steps:6});await page.mouse.up();
  await expect(page.locator('.signature.annotation[data-kind=ink]')).toHaveCount(1);
  await expect(page.locator('#readerFormatPanel')).toBeVisible();
  await expect(page.locator('#formatOpacity')).toHaveValue('63');
  await page.locator('#formatArrangeleft').click();
  const rect=await page.locator('.signature.annotation[data-kind=ink]').boundingBox();
  expect(rect).not.toBeNull();
  // Editable text uses the exact same dock; closing returns to Hand.
  await page.locator('#typewriter').click();
  await expect(page.locator('#readerTextFormat')).toBeVisible();
  await expect(page.locator('#readerAnnotationFormat')).toBeHidden();
  await expect(page.locator('#fillTextDialog')).toBeVisible();
  await page.locator('#typewriterFont').selectOption('sans');
  await page.locator('#fillTextInput').fill('Mẫu chữ Nguyễn');
  await page.locator('#formatTextBold').click();
  await page.locator('#formatTextItalic').click();
  await page.locator('#formatTextUnderline').click();
  await page.locator('#formatAlignCenter').click();
  await page.locator('#formatLineSpacing').selectOption('1.5');
  await page.locator('#typewriterPlace').click();
  await expect(page.locator('.typewriter-visual')).toContainText('Mẫu chữ Nguyễn');
  await expect(page.locator('#readerFormatPanel')).toBeVisible();
  const downloadEvent=page.waitForEvent('download');
  await page.locator('#save').click();
  const downloaded=await downloadEvent;
  const bytes=new Uint8Array(await readFile(await downloaded.path()));
  const reopened=await getDocument({data:bytes.slice()}).promise;
  const annotations=await (await reopened.getPage(1)).getAnnotations();
  const ink=annotations.find(item=>item.subtype==='Ink');
  expect(ink).toBeDefined();
  expect(ink.opacity).toBeCloseTo(.63,2);
  expect(ink.borderStyle.width).toBeCloseTo(6,1);
  const text=(await (await reopened.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');
  expect(text).toContain('Mẫu chữ Nguyễn');
  await reopened.loadingTask.destroy();
  await page.locator('#readerFormatClose').click();
  await expect(page.locator('#pan')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#readerFormatPanel')).toBeHidden();
  // Layout remains side-by-side instead of covering the PDF page.
  await page.locator('#annot-highlight').click();
  for(const [w,h]of [[1440,900],[1024,700]]){
    await page.setViewportSize({width:w,height:h});
    const metrics=await page.evaluate(()=>{
      const doc=document.querySelector('#documents').getBoundingClientRect();
      const format=document.querySelector('#readerFormatPanel').getBoundingClientRect();
      return {docRight:doc.right,formatLeft:format.left,formatRight:format.right};
    });
    expect(metrics.docRight).toBeLessThanOrEqual(metrics.formatLeft+.5);
    expect(metrics.formatRight).toBeLessThanOrEqual(w+.5);
  }
  await page.screenshot({path:'test-results/reader-format-right-panel.png'});
});
