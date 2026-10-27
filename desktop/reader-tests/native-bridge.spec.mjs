import {command} from './reader-command.mjs';
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
    window.__reads=[];window.__discards=[];window.__saveCalls=[];
    window.__enqueue=(key,bytes=files[key])=>{
      const ticket=String(++sequence);grants.set(ticket,bytes);pending.push([ticket,key,'Same.pdf',null]);callback?.();
    };
    window.__TAURI__={core:{invoke:async(command,args)=>{
      if(command==='reader_next_open_request')return pending.shift()||null;
      if(command==='reader_read_open_request'){window.__reads.push(args.ticket);const bytes=grants.get(args.ticket);grants.delete(args.ticket);return Uint8Array.from(bytes).buffer;}
      if(command==='reader_save_as'){window.__saveCalls.push(args);return 'C:/Saved/Reader.pdf';}
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

test('raw native PDF bytes remain available intact for Save after PDF.js takes its worker copy',async({page})=>{
  const bytes=await fixture('RAW IPC SOURCE');await mockNative(page,{a:bytes});
  await page.goto('/reader.html');await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['RAW IPC SOURCE']);
  await page.locator('#save').click();await expect(page.locator('#status')).toContainText('Đã lưu bản PDF mới');
  const preserved=await page.evaluate(expected=>{
    const source=Uint8Array.from(atob(expected),char=>char.charCodeAt(0));
    const saved=Uint8Array.from(window.__saveCalls[0].bytes);
    return saved.length===source.length&&saved.every((byte,index)=>byte===source[index]);
  },Buffer.from(bytes).toString('base64'));
  expect(preserved).toBe(true);
});

for(const viewport of [{width:1440,height:940},{width:1024,height:768}])test(`forwarded files preserve dirty tabs and view state at ${viewport.width}x${viewport.height}; duplicate path focuses without reading again`,async({page})=>{
  await page.setViewportSize(viewport);
  await mockNative(page,{a:await fixture('NATIVE A'),b:await fixture('NATIVE B')});
  await page.goto('/reader.html');await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await expect(page.locator('.page canvas').first()).toBeVisible();
  await page.locator('#pageNumber').fill('2');await page.locator('#pageNumber').press('Tab');
  await expect(page.locator('#pageNumber')).toHaveValue('2');
  await page.locator('#zoom').selectOption('1.5');
  await expect(page.locator('#pageNumber')).toHaveValue('2');
  await command(page,'fillCheck');
  await expect(page.locator('#pageNumber')).toHaveValue('2');
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

for(const control of ['zoom','zoomIn','zoomOut'])test(`rapid page navigation followed by ${control} retains the requested page`,async({page})=>{
  await page.setViewportSize({width:1024,height:768});
  await mockNative(page,{a:await fixture('RAPID A')});
  await page.goto('/reader.html');await expect(page.locator('.page canvas').first()).toBeVisible();
  const state=await page.evaluate(control=>{
    const page=document.getElementById('pageNumber'),zoom=document.getElementById('zoom');
    page.value='2';page.dispatchEvent(new Event('change'));
    const afterNavigation=page.value;
    if(control==='zoom'){zoom.value='1.5';zoom.dispatchEvent(new Event('change'));}
    else document.getElementById(control).click();
    return {afterNavigation,afterZoom:page.value};
  },control);
  expect(state).toEqual({afterNavigation:'2',afterZoom:'2'});
  await expect(page.locator('#pageNumber')).toHaveValue('2');
});

test('tab restore cannot overwrite a newer page jump and zoom after animation frames',async({page})=>{
  await mockNative(page,{a:await fixture('RESTORE A'),b:await fixture('RESTORE B')});
  await page.goto('/reader.html');await expect(page.locator('.page canvas').first()).toBeVisible();
  await page.evaluate(()=>window.__enqueue('b'));
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['RESTORE B']);
  await page.evaluate(async()=>{
    document.querySelector('#tabs .tab .title').click();
    const input=document.getElementById('pageNumber'),zoom=document.getElementById('zoom');
    input.value='3';input.dispatchEvent(new Event('change'));
    zoom.value='1.5';zoom.dispatchEvent(new Event('change'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  });
  await expect(page.locator('#pageNumber')).toHaveValue('3');
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText(['RESTORE A page 3']);
  await expect.poll(()=>page.locator('.readerContainer:not([hidden]) .page').first().evaluate(n=>parseFloat(getComputedStyle(n).getPropertyValue('--scale-factor')))).toBeCloseTo(2,1);
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
