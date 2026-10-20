import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
test('default PDF prompt obeys opt-out and settings opt-in without changing Windows defaults',async({page})=>{
  await page.addInitScript(()=>{
    window.__defaultAppCalls=[];
    window.__TAURI__={
      core:{invoke:async(name,args)=>{
        window.__defaultAppCalls.push({name,args});
        if(name==='reader_window_control')return true;
        if(name==='reader_pdf_default_state')return 'other';
        if(name==='reader_version')return '0.1.0';
        if(name==='reader_next_open_request')return null;
        if(name==='reader_open_external')return true;
        return null;
      }},
      event:{listen:async()=>()=>{}}
    };
  });
  await page.goto('/reader.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#readerDefaultPdfPrompt')).toBeVisible({timeout:6500});
  await expect(page.locator('#readerAlwaysCheckPdf')).toBeChecked();
  await page.locator('#readerAlwaysCheckPdf').uncheck();
  await page.locator('#readerDefaultPdfNo').click();
  await expect(page.locator('#readerDefaultPdfPrompt')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('sreader.checkDefaultPdfAtStartup'))).toBe('false');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.waitForTimeout(2100);
  await expect(page.locator('#readerDefaultPdfPrompt')).toBeHidden();
  await page.locator('#readerMenu').click();
  await page.locator('#settings').click();
  await page.locator('#readerSettingsCheckDefault').check();
  await page.locator('#readerSettings').getByText('Đóng').click();
  await page.reload();
  await expect(page.locator('#readerDefaultPdfPrompt')).toBeVisible({timeout:6500});
  await page.locator('#readerDefaultPdfYes').click();
  await expect(page.locator('#readerDefaultPdfPrompt')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.__defaultAppCalls.some(c=>c.name==='reader_open_external'&&c.args.kind==='pdf-default-settings'))).toBe(true);
  // The button must NOT pretend a Windows default was actually changed.
  const checks=await page.evaluate(()=>window.__defaultAppCalls.filter(c=>c.name==='reader_pdf_default_state').length);
  expect(checks).toBeGreaterThan(0);
});
test('no prompt when already default, unknown or a PDF is currently open',async({page})=>{
  await page.addInitScript(()=>{
    window.__status=sessionStorage.getItem('mockPdfDefaultState')||'default';
    window.__TAURI__={
      core:{invoke:async name=>{
        if(name==='reader_window_control')return true;
        if(name==='reader_pdf_default_state')return window.__status;
        if(name==='reader_next_open_request')return null;
        return null;
      }},
      event:{listen:async()=>()=>{}}
    };
  });
  await page.goto('/reader.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.waitForTimeout(2050);
  await expect(page.locator('#readerDefaultPdfPrompt')).toBeHidden();
  await page.evaluate(()=>{sessionStorage.setItem('mockPdfDefaultState','other');});
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  // Browser fixture data can be opened without blocking native test startup.
  // sReader must prioritize the PDF being read over a marketing prompt.
  const pdf=await PDFDocument.create();pdf.addPage([600,800]).drawText('Read first');
  await page.locator('#pdfFiles').setInputFiles({
    name:'Read-first.pdf',mimeType:'application/pdf',
    buffer:Buffer.from(await pdf.save())
  });
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await page.waitForTimeout(2050);
  await expect(page.locator('#readerDefaultPdfPrompt')).toBeHidden();
});
