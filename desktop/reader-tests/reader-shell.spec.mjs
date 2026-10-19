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
  await command(page,'fillCheck');await expect(page.locator('.signature.selected')).toBeVisible();
  await page.locator('.readerContainer:not([hidden]) .page').first().click({position:{x:35,y:220}});
  const state=await page.locator('.signature').getAttribute('data-signature');
  await page.locator('#zoom').selectOption('page-fit');
  if(await page.locator('html').getAttribute('data-theme')==='dark')await page.locator('#theme').click();
  for(const [width,height]of [[1440,900],[1708,928],[1024,700]]){
    await page.setViewportSize({width,height});
    const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return{header:rect('header'),toolbar:rect('.toolbar'),main:rect('main'),sidebar:rect('#sidebar'),zoom:rect('.zoom-pill'),last:rect('#readerMenu'),left:rect('.toolbar-left'),center:rect('.toolbar-center'),right:rect('.toolbar-right'),canvas:rect('#documents'),ribbons:document.querySelectorAll('[data-ribbon]').length};});
    expect(geometry.ribbons).toBe(0);expect(geometry.header.h).toBe(40);expect(geometry.toolbar.h).toBe(46);expect(geometry.main.y).toBe(86);
    expect(geometry.sidebar.w).toBeGreaterThanOrEqual(230);expect(geometry.sidebar.w).toBeLessThanOrEqual(270);expect(geometry.last.right).toBeLessThanOrEqual(width);
    expect(geometry.zoom.right).toBeLessThan(geometry.canvas.right);expect(geometry.zoom.bottom).toBeLessThan(height);
    expect(geometry.left.right).toBeLessThanOrEqual(geometry.center.x);expect(geometry.center.right).toBeLessThanOrEqual(geometry.right.x);
    await expect(page.locator('.signature')).toHaveAttribute('data-signature',state);
    await page.screenshot({path:`test-results/reader-compact-${width}x${height}.png`});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#readerMenu').click();await expect(page.locator('#readerMenuPanel')).toBeVisible();await page.screenshot({path:'test-results/reader-compact-menu.png'});
  await page.keyboard.press('Escape');await expect(page.locator('#readerMenuPanel')).not.toBeVisible();await expect(page.locator('#readerMenu')).toBeFocused();
  await command(page,'pageNight');expect(await page.locator('body').getAttribute('class')).toContain('page-night');
  expect(await page.locator('.signature img').evaluate(el=>getComputedStyle(el).filter)).toBe('none');
  expect(await page.locator('.signature').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await page.locator('.canvasWrapper').first().evaluate(el=>getComputedStyle(el).filter)).toContain('invert(1)');
  await page.screenshot({path:'test-results/reader-compact-night.png'});await command(page,'pageNight');
  await page.locator('#theme').click();await page.screenshot({path:'test-results/reader-compact-dark.png'});await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.keyboard.press('F1');await expect(page.locator('#shortcutsDialog')).toBeVisible();await page.keyboard.press('Escape');
  await command(page,'settings');await expect(page.locator('#readerSettings')).toBeVisible();await page.locator('#readerTheme').selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.locator('#readerInvert').check();await expect(page.locator('body')).toHaveClass('page-night');await page.keyboard.press('Escape');
  await page.keyboard.press('F9');await expect(page.locator('#sidebar')).toBeHidden();await page.keyboard.press('F9');await expect(page.locator('#sidebar')).toBeVisible();
  expect(errors).toEqual([]);
});
