import {test,expect} from '@playwright/test';
import {PDFDocument,rgb} from 'pdf-lib';
import {command} from './reader-command.mjs';

test('compact shell, popovers, night display and real UI review captures',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pdf=await PDFDocument.create();
  for(let i=0;i<3;i++){
    const p=pdf.addPage([595,842]);p.drawRectangle({x:0,y:726,width:595,height:116,color:rgb(.05,.22,.43)});
    p.drawText('SolYan PDF',{x:46,y:784,size:25,color:rgb(1,1,1)});
    p.drawText('DOCUMENT REVIEW / 2026',{x:46,y:754,size:10,color:rgb(.65,.82,1)});
    p.drawText(['Read with focus.','Keep every detail.','Make it yours.'][i],{x:46,y:670,size:24,color:rgb(.08,.18,.3)});
    for(let n=0;n<10;n++)p.drawText(['A compact workspace for everyday documents.','Your original PDF stays unchanged when you sign.','Select text, add a note, then save a separate copy.'][n%3],{x:46,y:614-n*28,size:12,color:rgb(.22,.28,.36)});
    p.drawText('OFFLINE READER',{x:46,y:42,size:9,color:rgb(.4,.45,.5)});p.drawText(String(i+1),{x:540,y:42,size:10});
  }
  const fixture={name:'Document review.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())};
  await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.locator('#pdfFiles').setInputFiles(fixture);await expect(page.locator('.textLayer span').first()).toBeVisible();
  const toolsBefore=await page.locator('#tools').boundingBox();await page.locator('#pdfFiles').setInputFiles([{...fixture,name:'Second.pdf'},{...fixture,name:'Third.pdf'}]);await expect(page.locator('#tabs .tab')).toHaveCount(3);expect((await page.locator('#tools').boundingBox()).x).toBeCloseTo(toolsBefore.x,0);await page.locator('#tabs .tab .title').first().click();await expect(page.locator('#tools img')).toHaveAttribute('src','./vendor/sTool_PDF.png');expect(await page.locator('#tools img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await command(page,'fillCheck');await expect(page.locator('.signature.selected')).toBeVisible();
  await page.locator('.readerContainer:not([hidden]) .page').first().click({position:{x:35,y:220}});
  const viewIcons=await page.locator('#readerFooter .footer-views img,#readerFooter #presentation img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),loaded:img.complete&&img.naturalWidth>0})));expect(viewIcons).toHaveLength(4);expect(new Set(viewIcons.map(x=>x.src)).size).toBe(4);expect(viewIcons.every(x=>x.loaded&&x.src.endsWith('-outline.svg'))).toBe(true);
  for(const image of await page.locator('.toolbar img').all())await expect(image).toHaveAttribute('src',/-outline\.svg$/);
  // Distinct pinned icons: Typewriter is text cursor; Fill & Sign is a note/pencil.
  await expect(page.locator('#typewriter img')).toHaveAttribute('src','./reader-icons/cursor-text-outline.svg');
  await expect(page.locator('#fillMenu img')).toHaveAttribute('src','./reader-icons/note-pencil-outline.svg');
  // WebView's default PDF-image menu misleadingly offers Save As for a page
  // raster rather than the PDF. Only document Save As / Ctrl+Shift+S is valid.
  const context=await page.evaluate(()=>{
    const canvas=document.querySelector('.pdfViewer .page canvas');
    const menu=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
    canvas.dispatchEvent(menu);
    const field=document.getElementById('query');
    const inputMenu=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
    field.dispatchEvent(inputMenu);
    return {pdfBlocked:menu.defaultPrevented,textFieldUntouched:!inputMenu.defaultPrevented};
  });
  expect(context).toEqual({pdfBlocked:true,textFieldUntouched:true});
  const state=await page.locator('.signature').getAttribute('data-signature');
  await page.locator('#zoom').selectOption('page-fit');
  if(await page.locator('html').getAttribute('data-theme')==='dark')await page.locator('#theme').click();
  for(const [width,height]of [[1440,900],[1708,928],[1024,700]]){
    await page.setViewportSize({width,height});
    const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return{header:rect('header'),toolbar:rect('.toolbar'),main:rect('main'),sidebar:rect('#sidebar'),zoom:rect('.zoom-pill'),last:rect('#readerMenu'),left:rect('.toolbar-left'),center:rect('.toolbar-center'),right:rect('.toolbar-right'),canvas:rect('#documents'),ribbons:document.querySelectorAll('[data-ribbon]').length};});
    expect(geometry.ribbons).toBe(0);expect(geometry.header.h).toBe(40);expect(geometry.toolbar.h).toBe(46);expect(geometry.main.y).toBe(86);
    expect(geometry.sidebar.w).toBeGreaterThanOrEqual(230);expect(geometry.sidebar.w).toBeLessThanOrEqual(270);expect(geometry.last.right).toBeLessThanOrEqual(width);
    expect(geometry.zoom.y).toBeGreaterThanOrEqual(geometry.canvas.bottom);expect(geometry.zoom.bottom).toBeLessThanOrEqual(height);
    expect(geometry.left.right).toBeLessThanOrEqual(geometry.center.x);expect(geometry.center.right).toBeLessThanOrEqual(geometry.right.x);
    await expect(page.locator('.signature')).toHaveAttribute('data-signature',state);
    await page.screenshot({path:`test-results/reader-compact-${width}x${height}.png`});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#readerMenu').click();await expect(page.locator('#readerMenuPanel')).toBeVisible();await page.screenshot({path:'test-results/reader-compact-menu.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#readerMenuPanel')).not.toBeVisible();await expect(page.locator('#readerMenu')).toBeFocused();
  await command(page,'pageNight');expect(await page.locator('body').getAttribute('class')).toContain('page-night');
  expect(await page.locator('.signature img').evaluate(el=>getComputedStyle(el).filter)).toBe('none');
  expect(await page.locator('.signature').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('.canvasWrapper').first().evaluate(el=>getComputedStyle(el).filter)).toContain('invert(1)');
  await page.screenshot({path:'test-results/reader-compact-night.png'});await command(page,'pageNight');
  await page.locator('#theme').click();await page.screenshot({path:'test-results/reader-compact-dark.png'});await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.keyboard.press('F1');await expect(page.locator('#shortcutsDialog')).toBeVisible();await page.keyboard.press('Escape');
  await command(page,'settings');await expect(page.locator('#readerSettings')).toBeVisible();await page.locator('#readerTheme').selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.locator('#readerInvert').check();await expect(page.locator('body')).toHaveClass('page-night');await page.keyboard.press('Escape');
  await page.keyboard.press('F9');await expect(page.locator('#sidebar')).toBeHidden();await page.keyboard.press('F9');await expect(page.locator('#sidebar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('native caption double-click toggles maximize without starting a drag; About links invoke Windows shell',async({page})=>{
  await page.addInitScript(()=>{
    window.__shellCalls=[];
    window.__TAURI__={
      core:{invoke:async(command,args)=>{
        window.__shellCalls.push({command,args});
        if(command==='reader_window_control')return true;
        if(command==='reader_version')return '0.1.0';
        if(command==='reader_next_open_request')return null;
        if(command==='reader_open_external')return true;
        return null;
      }},
      event:{listen:async()=>()=>{}}
    };
  });
  await page.goto('/reader.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#windowControls')).toBeVisible();
  const title=page.locator('.title-drag');
  await title.dblclick();
  await expect.poll(()=>page.evaluate(()=>window.__shellCalls.filter(c=>c.command==='reader_window_control'&&c.args.action==='maximize').length)).toBe(1);
  expect(await page.evaluate(()=>window.__shellCalls.some(c=>c.command==='reader_window_control'&&c.args.action==='drag'))).toBe(false);
  await title.dblclick();
  await expect.poll(()=>page.evaluate(()=>window.__shellCalls.filter(c=>c.command==='reader_window_control'&&c.args.action==='maximize').length)).toBe(2);
  const rect=await title.boundingBox();
  await page.mouse.move(rect.x+8,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(rect.x+25,rect.y+rect.height/2,{steps:3});
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.__shellCalls.filter(c=>c.command==='reader_window_control'&&c.args.action==='drag').length)).toBe(1);
  await command(page,'about');
  const links=page.locator('#readerAbout a');
  await links.filter({hasText:'https://www.youtube.com/@SolYan-Music'}).click();
  await links.filter({hasText:'yansign841@gmail.com'}).click();
  expect(await page.evaluate(()=>window.__shellCalls.filter(c=>c.command==='reader_open_external').map(c=>c.args.kind))).toEqual(['website','email']);
});
