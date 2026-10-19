import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';

async function fixture(text) {
  const pdf=await PDFDocument.create();
  for(let i=0;i<3;i++)pdf.addPage([600,800]).drawText(`${text} page ${i+1}`,{x:60,y:650});
  return [...await pdf.save()];
}
async function mockNative(page,files,delayed=false) {
  await page.addInitScript(({files,delayed})=>{
    const pending=[],grants=new Map();let callback,sequence=0;
    window.__reads=[];window.__discards=[];
    window.__enqueue=(key,bytes=files[key])=>{
      const ticket=String(++sequence);grants.set(ticket,bytes);pending.push([ticket,key,'Same.pdf',null]);callback?.();
    };
    window.__TAURI__={core:{invoke:async(command,args)=>{
      if(command==='reader_next_open_request')return pending.shift()||null;
      if(command==='reader_read_open_request'){window.__reads.push(args.ticket);const bytes=grants.get(args.ticket);grants.delete(args.ticket);return bytes;}
      if(command==='reader_discard_open_request'){window.__discards.push(args.ticket);grants.delete(args.ticket);return null;}
      if(command==='reader_choose_files'){if(window.__chooseKey)window.__enqueue(window.__chooseKey);return Boolean(window.__chooseKey);}
      return null;
    }},event:{listen:async(name,handler)=>{
      if(name!=='reader-open-pending')throw Error('Wrong notification');
      if(delayed)await new Promise(resolve=>{window.__releaseListener=resolve;});
      callback=handler;return()=>{callback=null;};
    }}};
    window.__enqueue('a');
  },{files,delayed});
}

test('native startup queue survives notifications before listener readiness',async({page})=>{
  await mockNative(page,{a:await fixture('NATIVE A'),b:await fixture('NATIVE B')},true);
  await page.goto('/reader.html');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.evaluate(()=>{window.__enqueue('b');window.__releaseListener();});
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['NATIVE B']);
});

test('forwarded files preserve dirty tabs and view state; duplicate path focuses without reading again',async({page})=>{
  await mockNative(page,{a:await fixture('NATIVE A'),b:await fixture('NATIVE B')});
  await page.goto('/reader.html');await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await page.locator('#pageNumber').fill('2');await page.locator('#pageNumber').press('Tab');
  await page.locator('#zoom').selectOption('1.5');
  await page.locator('[data-ribbon=sign]').click();await page.locator('#fillCheck').click();
  await expect(page.locator('#tabs .title')).toContainText('●');
  const id=await page.locator('.signature.selected').getAttribute('data-signature');
  const scroll=await page.locator('.readerContainer:not([hidden])').evaluate(node=>node.scrollTop);
  await page.evaluate(()=>window.__enqueue('b'));
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['NATIVE B']);
  await page.evaluate(()=>window.__enqueue('a'));
  await expect(page.locator('#tabs .tab.active .title')).toContainText('●');
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('#pageNumber')).toHaveValue('2');
  await expect(page.locator('.signature.selected')).toHaveAttribute('data-signature',id);
  await expect.poll(()=>page.locator('.readerContainer:not([hidden])').evaluate(node=>node.scrollTop)).toBe(scroll);
  expect(await page.evaluate(()=>window.__reads.length)).toBe(2);
  expect(await page.evaluate(()=>window.__discards.length)).toBe(1);
  const scale=await page.locator('.readerContainer:not([hidden]) .page').first().evaluate(node=>parseFloat(getComputedStyle(node).getPropertyValue('--scale-factor')));
  expect(scale).toBe(2);
});

test('malformed forwarded PDF does not block the next request or discard current document',async({page})=>{
  await mockNative(page,{a:await fixture('NATIVE A'),b:await fixture('NATIVE B')});
  await page.goto('/reader.html');await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await page.evaluate(()=>{window.__enqueue('broken',[1,2,3]);window.__enqueue('b');});
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['NATIVE B']);
  await page.locator('#tabs .title').first().click();
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['NATIVE A']);
});

test('Windows open button routes chosen paths through the same queue and cancel keeps the current tab',async({page})=>{
  await mockNative(page,{a:await fixture('NATIVE A'),b:await fixture('NATIVE B')});
  await page.goto('/reader.html');await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await page.locator('#open').click();await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await page.evaluate(()=>{window.__chooseKey='a';});await page.locator('#open').click();
  await expect.poll(()=>page.evaluate(()=>window.__discards.length)).toBe(1);
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await page.evaluate(()=>{window.__chooseKey='b';});await page.locator('#open').click();
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['NATIVE B']);
});
