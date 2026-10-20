import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';

async function fixture(label){
  const pdf=await PDFDocument.create();
  for(let i=0;i<4;i++)pdf.addPage([600,800]).drawText(label+' PAGE '+(i+1),{x:60,y:680});
  return Array.from(await pdf.save());
}
test('recent PDFs and full tab session restore after reload, including missing paths and tab closure',async({page})=>{
  const a='C:/Samples/Tiếng Việt (1).pdf',b='C:/Samples/<unsafe>.pdf';
  const sources=new Map([[a,await fixture('ORIGINAL A')],[b,await fixture('ORIGINAL B')]]);
  const pending=[],grants=new Map();
  let ticket=0,saved={tabs:[],active:null},recent=[],started=true,saves=0;
  const queue=(key)=>{
    const id=String(++ticket);
    grants.set(id,sources.get(key));pending.push([id,key,key.split('/').at(-1),null]);
  };
  await page.exposeFunction('__readerMock',async(command,args={})=>{
    if(command==='reader_next_open_request')return pending.shift()||null;
    if(command==='reader_read_open_request'){
      if(!grants.has(args.ticket))throw Error('No OS-authorized ticket');
      const data=grants.get(args.ticket);grants.delete(args.ticket);return data;
    }
    if(command==='reader_discard_open_request'){grants.delete(args.ticket);return null;}
    if(command==='reader_session_restore'){
      for(const row of saved.tabs)if(sources.has(row[0]))queue(row[0]);
      const restored=saved.tabs.filter(row=>sources.has(row[0]));
      const missing=saved.tabs.length-restored.length;
      return [restored,saved.active,missing];
    }
    if(command==='reader_session_save'){
      const original=new Set(saved.tabs.map(row=>row[0]));
      const history=new Set(recent.map(row=>row[0]));
      const active=args.active;
      for(const row of args.tabs){
        if(!original.has(row[0])||history.has(row[0])){
          recent=recent.filter(existing=>existing[0]!==row[0]);
          recent.unshift([row[0],row[1]]);
        }
      }
      saved={tabs:args.tabs,active};saves++;return null;
    }
    if(command==='reader_session_recent')return recent.map(([key,at],i)=>[i,key.split('/').at(-1),key,!sources.has(key),at]);
    if(command==='reader_session_open_recent'){
      const key=recent[args.index]?.[0];
      if(!sources.has(key))throw Error('Missing file');
      queue(key);return true;
    }
    if(command==='reader_session_clear_recent'){recent=[];return null;}
    if(command==='reader_pdf_default_state')return 'default';
    if(command==='reader_window_control')return false;
    if(command==='reader_version')return '0.1.0';
    return null;
  });
  await page.addInitScript(()=>{
    window.__TAURI__={core:{invoke:(name,args)=>window.__readerMock(name,args)},event:{listen:async(name,callback)=>{
      if(name==='reader-open-pending')window.__nativeNotify=callback;return()=>{};
    }}};
  });
  queue(a);
  await page.goto('/reader.html');
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await expect(page.locator('.textLayer')).toContainText(['ORIGINAL A PAGE 1']);
  await page.locator('#pageNumber').fill('3');
  await page.locator('#pageNumber').press('Tab');
  await page.locator('#zoom').selectOption('1.5');
  await expect(page.locator('#pageNumber')).toHaveValue('3');
  queue(b);await page.evaluate(()=>window.__nativeNotify());
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('#tabs .tab.active .title')).toContainText('<unsafe>.pdf');
  await expect.poll(()=>saved.tabs.length).toBe(2);
  await expect.poll(()=>saved.tabs[0][1]).toBe(3);
  await expect.poll(()=>saved.tabs[0][2]).toBeCloseTo(1.5,1);
  await expect.poll(()=>saved.active).toBe(b);
  await page.reload();
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('#tabs .tab.active .title')).toContainText('<unsafe>.pdf');
  // Restoring inactive A must not flush an uninitialized page=1 back to disk
  // before its tab is activated (which would permanently lose reading state).
  await expect.poll(()=>saved.tabs[0][1]).toBe(3);
  await page.locator('#tabs .tab .title').first().click();
  await expect(page.locator('#pageNumber')).toHaveValue('3');
  await expect.poll(async()=>page.locator('.readerContainer:not([hidden]) .page').first().evaluate(n=>parseFloat(getComputedStyle(n).getPropertyValue('--scale-factor')))).toBeCloseTo(2,1);
  await page.locator('#readerMenu').click();await page.locator('#recentFiles').click();
  await expect(page.locator('#readerRecentDialog')).toBeVisible();
  await expect(page.locator('.reader-recent-open')).toHaveCount(2);
  expect(await page.locator('#readerRecentDialog img').count()).toBe(0);
  await page.locator('#readerRecentClose').click();

  // A missing old path is not restored, but its history entry is visibly disabled.
  sources.delete(b);await page.reload();
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await page.locator('#readerMenu').click();await page.locator('#recentFiles').click();
  const missing=page.locator('.reader-recent-open').filter({hasText:'<unsafe>.pdf'});
  await expect(missing).toBeDisabled();
  await expect(missing).toContainText('Không tìm thấy tệp');
  await page.locator('#readerRecentClose').click();

  await page.locator('#tabs .tab .close').click();
  await expect(page.locator('#tabs .tab')).toHaveCount(0);
  await expect.poll(()=>saved.tabs.length).toBe(0);
  await page.reload();
  await expect(page.locator('#tabs .tab')).toHaveCount(0);
  await page.locator('#readerMenu').click();await page.locator('#recentFiles').click();
  await page.locator('.reader-recent-open').filter({hasText:'Tiếng Việt'}).click();
  await page.evaluate(()=>window.__nativeNotify());
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await expect(page.locator('.textLayer')).toContainText(['ORIGINAL A PAGE 1']);
  await page.locator('#readerMenu').click();await page.locator('#recentFiles').click();
  await page.locator('#readerRecentClear').click();
  await expect(page.locator('#readerRecentList')).toContainText('Chưa có PDF gần đây.');
  await page.locator('#readerRecentClose').click();
  // Clearing history is durable: moving the page in an already-open tab must
  // not secretly repopulate history with the old path.
  await page.locator('#pageNumber').fill('2');await page.locator('#pageNumber').press('Tab');
  await expect.poll(()=>saved.tabs[0]?.[1]).toBe(2);
  await page.locator('#readerMenu').click();await page.locator('#recentFiles').click();
  await expect(page.locator('.reader-recent-open')).toHaveCount(0);
  expect(saves).toBeGreaterThan(3);
});
