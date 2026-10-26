import {test,expect} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {readFile} from 'node:fs/promises';
import {command} from './reader-command.mjs';
async function fixture(forms=false){const pdf=await PDFDocument.create();for(let i=0;i<3;i++){const size=i===1?[800,600]:[600,800];pdf.addPage(size).drawText('SOURCE PAGE '+(i+1),{x:50,y:size[1]-60});}if(forms){const p=pdf.getPage(0),form=pdf.getForm();const text=form.createTextField('Name');text.setText('Initial');text.addToPage(p,{x:60,y:620,width:240,height:30});const check=form.createCheckBox('Agree');check.addToPage(p,{x:60,y:560,width:20,height:20});const drop=form.createDropdown('Choice');drop.addOptions(['One','Two']);drop.select('One');drop.addToPage(p,{x:110,y:560,width:130,height:25});const radio=form.createRadioGroup('Group');radio.addOptionToPage('A',p,{x:60,y:500,width:20,height:20});radio.addOptionToPage('B',p,{x:110,y:500,width:20,height:20});const readonly=form.createTextField('ReadOnly');readonly.setText('Protected');readonly.enableReadOnly();readonly.addToPage(p,{x:60,y:440,width:240,height:30});form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));}return Buffer.from(await pdf.save());}
async function open(page,buffer){await page.goto('/reader.html');await page.locator('body[data-ready=true]').waitFor();await page.locator('#pdfFiles').setInputFiles({name:'Tiếng Việt.pdf',mimeType:'application/pdf',buffer});await expect(page.locator('.page canvas').first()).toBeVisible();}
test('AcroForm fields stay editable, Unicode values and native types survive repeated export',async({page})=>{
  const source=await fixture(true),original=source.slice();await open(page,source);await expect(page.locator('#tabs .title')).not.toContainText('●');
  await page.locator('input[name=Name]').fill('Nguyễn Văn An');await page.locator('input[name=Agree]').check();await page.locator('select[name=Choice]').selectOption({label:'Two'});await page.locator('input[name=Group]').nth(1).check();await expect(page.locator('input[name=ReadOnly]')).toBeDisabled();await expect(page.locator('#tabs .title')).toContainText('●');
  await command(page,'fillCheck');await command(page,'undo');await expect(page.locator('#tabs .title')).toContainText('●');
  for(let i=0;i<2;i++){const pending=page.waitForEvent('download');await page.locator('#save').click();const bytes=new Uint8Array(await readFile(await(await pending).path())),pdf=await getDocument({data:bytes.slice()}).promise,fields=await pdf.getFieldObjects(),field=name=>fields.get(name).find(x=>x.page>=0);expect(field('Name').value).toBe('Nguyễn Văn An');expect(field('Agree').value).not.toBe('Off');expect(field('Choice').value).toBe('Two');expect(field('Group').value).toBe('B');expect(field('ReadOnly').editable).toBe(false);expect(pdf.numPages).toBe(3);const form=(await PDFDocument.load(bytes)).getForm();expect(form.getTextField('Name').getText()).toBe('Nguyễn Văn An');expect(form.getCheckBox('Agree').isChecked()).toBe(true);expect(form.getDropdown('Choice').getSelected()).toEqual(['Two']);expect(form.getRadioGroup('Group').getSelected()).toBe('B');expect(form.getTextField('ReadOnly').isReadOnly()).toBe(true);await pdf.loadingTask.destroy();}
  expect(source).toEqual(original);await page.screenshot({path:'test-results/reader-AcroForm.png'});
});
test('print range includes current edits on real canvases, protects editor and rejects oversized jobs',async({page})=>{
  const openAdvanced=async()=>{await page.locator('#readerMenu').click();await page.locator('#printLayoutOptions').click();};
  await page.addInitScript(()=>{window.__printed=0;window.print=()=>window.__printed++;});await open(page,await fixture());await command(page,'fillCheck');const id=await page.locator('.signature').getAttribute('data-signature');
  await openAdvanced();await page.locator('#printRange').fill('1,2');await page.locator('#printStart').click();await expect.poll(()=>page.evaluate(()=>window.__printed)).toBe(1);await expect(page.locator('#readerPrintStage canvas')).toHaveCount(2);expect(await page.locator('#readerPrintStage .reader-print-page').evaluateAll(p=>p.map(x=>x.dataset.page))).toEqual(['1','2']);expect(Number(await page.locator('#readerPrintStage').getAttribute('data-pixels'))).toBeLessThanOrEqual(80_000_000);for(const canvas of await page.locator('#readerPrintStage canvas').all())expect(await canvas.evaluate(c=>c.width*c.height)).toBeLessThanOrEqual(12_000_000);await expect(page.locator('.signature')).toHaveAttribute('data-signature',id);await expect(page.locator('#tabs .title')).toContainText('●');
  await page.emulateMedia({media:'print'});await expect(page.locator('header')).toBeHidden();await expect(page.locator('#readerPrintStage')).toBeVisible();await page.screenshot({path:'test-results/reader-print-preview.png'});
  const printed=await PDFDocument.load(await page.pdf({preferCSSPageSize:true,printBackground:true}));expect(printed.getPageCount()).toBe(2);for(const [i,[w,h]]of [[600,800],[800,600]].entries()){expect(printed.getPage(i).getWidth()).toBeCloseTo(w,0);expect(printed.getPage(i).getHeight()).toBeCloseTo(h,0);}
  await page.emulateMedia({media:'screen'});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));await expect(page.locator('#readerPrintStage')).toHaveCount(0);
  await openAdvanced();await page.locator('#printRange').fill('4');await page.locator('#printStart').click();await expect(page.locator('#status')).toContainText('Khoảng trang không hợp lệ');expect(await page.evaluate(()=>window.__printed)).toBe(1);await page.keyboard.press('Escape');const large=await PDFDocument.create();for(let i=0;i<51;i++)large.addPage([600,800]);await page.locator('#pdfFiles').setInputFiles({name:'51-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(await large.save())});await expect(page.locator('#pageCount')).toHaveText('/ 51');await openAdvanced();await page.locator('#printStart').click();await expect(page.locator('#status')).toContainText('Chọn từ 1 đến 50 trang');expect(await page.evaluate(()=>window.__printed)).toBe(1);
});
test('working copy moves Reader to actual merge tool and merged result back to a new Reader tab',async({page,context})=>{
  await open(page,await fixture());await command(page,'fillText');await page.locator('#fillTextInput').fill('Handoff Unicode Nguyễn');await page.locator('#typewriterPlace').click();await expect(page.locator('.typewriter-visual')).toBeVisible();
  const chooserPromise=context.waitForEvent('page');await page.locator('#tools').click();const chooser=await chooserPromise;await expect(chooser.locator('#transferName')).toHaveText('Tiếng Việt.pdf');await chooser.locator('[data-route="merge.html"]').click();await expect(chooser.locator('#fileCount')).toContainText('1 tệp');await chooser.locator('#fileInput').setInputFiles({name:'Second.pdf',mimeType:'application/pdf',buffer:await fixture()});await expect(chooser.locator('#fileCount')).toContainText('2 tệp');
  const download=chooser.waitForEvent('download');await chooser.locator('#mergeBtn').click();await download;await expect(chooser.locator('#sendDocumentReader')).toHaveText('Mở kết quả trong sReader');const readerPromise=context.waitForEvent('page');await chooser.locator('#sendDocumentReader').click();const reader=await readerPromise;await expect(reader.locator('#pageCount')).toHaveText('/ 6');await expect(reader.locator('.textLayer').first()).toContainText('Handoff Unicode Nguyễn');await expect(page.locator('#tabs .title')).toContainText('●');await expect(page.locator('.typewriter-visual')).toBeVisible();await chooser.screenshot({path:'test-results/tools-document-transfer.png'});
});

test('document properties show metadata read-only and follow the active tab safely',async({page})=>{
  const source=await PDFDocument.create();
  source.addPage([612,792]);
  source.setTitle('<img src=x onerror=alert(1)> Private title');
  source.setAuthor('Nguyễn Văn An');
  source.setSubject('Metadata without network or document edits');
  source.setCreator('SolYan PDF fixture');
  const original=Buffer.from(await source.save());
  const another=await PDFDocument.create();
  another.addPage([500,700]);another.setTitle('Second title');
  await open(page,original);
  await command(page,'documentProperties');
  const dialog=page.locator('#readerProperties');
  await expect(dialog).toBeVisible();
  const value=key=>dialog.locator('[data-property="'+key+'"]');
  await expect(value('file')).toHaveText('Tiếng Việt.pdf');
  await expect(value('pages')).toHaveText('1');
  await expect(value('size')).toContainText('KB');
  await expect(value('firstPage')).toContainText('612 × 792 pt');
  await expect(value('title')).toHaveText('<img src=x onerror=alert(1)> Private title');
  await expect(value('author')).toHaveText('Nguyễn Văn An');
  await expect(value('creator')).toHaveText('SolYan PDF fixture');
  expect(await dialog.locator('img').count()).toBe(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.locator('#pdfFiles').setInputFiles({name:'Second.pdf',mimeType:'application/pdf',buffer:Buffer.from(await another.save())});
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await command(page,'documentProperties');
  await expect(value('file')).toHaveText('Second.pdf');
  await expect(value('firstPage')).toContainText('500 × 700 pt');
  await expect(value('title')).toHaveText('Second title');
  await dialog.locator('#readerPropertiesClose').click();
  await page.locator('#tabs .tab .title').first().click();
  await command(page,'documentProperties');
  await expect(value('author')).toHaveText('Nguyễn Văn An');
  await dialog.locator('#readerPropertiesClose').click();
  const saved=page.waitForEvent('download');
  await page.locator('#save').click();
  const bytes=Buffer.from(await readFile(await(await saved).path()));
  expect(bytes).toEqual(original);
});
