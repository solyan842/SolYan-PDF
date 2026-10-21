import {expect} from '@playwright/test';

// Reused by browser regression and installed Windows acceptance. All timings
// are automation-observed upper bounds, including driver/polling overhead.
export async function exerciseReaderLoad({page,open,files,sampleMemory}){
  const sample={scope:'synthetic PDFs; not a real-world corpus or performance guarantee',
    timingScope:'observed upper bounds including automation; no OS-cache-cold claim',
    before:await sampleMemory(),opens:[],switches:[]};
  const baseline=await page.locator('#tabs .tab').count();
  for(const file of files){
    const started=performance.now();await open(file);
    await expect(page.locator('#tabs .tab.active .title')).toHaveText(file.name);
    await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText([file.label+' PAGE 1']);
    sample.opens.push({name:file.name,pages:file.pages,bytes:file.bytes,sha256:file.sha256??null,firstLegibleObservedMs:performance.now()-started});
  }
  await expect(page.locator('#tabs .tab')).toHaveCount(baseline+files.length);
  sample.atTenTabs=await sampleMemory();
  const medium=files.findIndex(f=>f.pages===100);
  expect(medium).toBeGreaterThanOrEqual(0);
  for(const index of [files.length-1,Math.floor(files.length/2),medium]){
    const started=performance.now();
    await page.locator('#tabs .tab .title').nth(baseline+index).click();
    await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText([files[index].label+' PAGE 1']);
    sample.switches.push({name:files[index].name,observedMs:performance.now()-started});
  }
  const jump=performance.now();
  await page.locator('#pageNumber').fill('100');await page.locator('#pageNumber').press('Tab');
  await expect(page.locator('.readerContainer:not([hidden]) .textLayer')).toContainText([files[medium].label+' PAGE 100']);
  sample.page100ObservedMs=performance.now()-jump;
  sample.mediumPageCanvasCount=await page.locator('.readerContainer:not([hidden]) .page canvas').count();
  expect(sample.mediumPageCanvasCount).toBeGreaterThan(0);
  expect(sample.mediumPageCanvasCount).toBeLessThan(20);
  const search=performance.now();
  await page.locator('#query').fill(files[medium].label+' PAGE 100');
  await page.locator('#query').press('Enter');
  await expect(page.locator('#matches')).toHaveText('1/1');
  sample.search100PagesObservedMs=performance.now()-search;
  for(let i=files.length-1;i>=0;i--)await page.locator('#tabs .tab .close').nth(baseline+i).click();
  await expect(page.locator('#tabs .tab')).toHaveCount(baseline);
  sample.afterClosing=await sampleMemory();
  return sample;
}
