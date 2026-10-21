import {chromium,expect} from './SolYan-PDF/desktop/stool-tests/node_modules/@playwright/test/index.mjs';
import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('SolYan-PDF/desktop/ui');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!path.startsWith(root+'/')&&!path.startsWith(root+'\\')){res.writeHead(403);res.end();return;}
    const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const report={scope:'local Windows headless Edge against unchanged sTool UI; no installed Tauri or engine acceptance',cases:[]};
try{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requests.push(r.url()));
  const base=`http://127.0.0.1:${server.address().port}`;
  const start=performance.now();await page.goto(base+'/index.html');
  await expect(page.locator('#tool-search')).toBeVisible();
  report.observedBrowserHomeMs=Math.round(performance.now()-start);
  const catalog=await page.evaluate(()=>window.SOLYAN_TOOL_CATALOG);
  await page.locator('[data-filter="all"]').click();
  await expect(page.locator('#all-tools-grid .tool-card')).toHaveCount(catalog.tools.length);
  report.catalogTools=catalog.tools.length;
  for(const c of catalog.categories){
    await page.locator(`#category-nav [data-category="${c.id}"]`).click();
    await expect(page.locator('#all-tools-grid .tool-card')).toHaveCount(catalog.tools.filter(t=>t.category===c.id).length);
  }
  report.cases.push('all tools and all nine categories match catalog');
  await page.locator('[data-filter="all"]').click();
  for(const term of ['OCR','nén','Word','ký','NO_SUCH_SOLYAN_TOOL']){
    await page.locator('#tool-search').fill(term);
    const expected=catalog.tools.filter(t=>`${t.name} ${t.desc} ${catalog.categories.find(c=>c.id===t.category)?.label||''}`.toLocaleLowerCase('vi').includes(term.toLocaleLowerCase('vi'))).length;
    await expect(page.locator('#all-tools-grid .tool-card')).toHaveCount(expected);
  }
  await expect(page.locator('#empty-state')).toBeVisible();
  report.cases.push('Vietnamese and English queries plus empty result');
  await page.keyboard.press('Control+k');await expect(page.locator('#tool-search')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#all-tools-grid .tool-card')).toHaveCount(catalog.tools.length);
  report.cases.push('Ctrl+K focus and Escape reset');
  await expect(page.locator('#all-tools-grid .tool-icon img[src$="-duotone.svg"]')).toHaveCount(catalog.tools.length);
  await expect.poll(()=>page.locator('#all-tools-grid .tool-icon img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  await expect(page.locator('#all-tools-grid .tool-name')).toHaveCount(catalog.tools.length);
  await expect(page.locator('#all-tools-grid .tool-desc')).toHaveCount(catalog.tools.length);
  report.cases.push('every card has SVG, name and separate description');
  await page.locator('[data-filter="home"]').click();
  await page.screenshot({path:'stool-local-home.png',fullPage:true});
  expect(errors).toEqual([]);
  report.externalRequestHosts=[...new Set(requests.filter(url=>!url.startsWith(base+'/')&&!url.startsWith('data:')).map(url=>new URL(url).hostname))];
  report.zeroExternalRequests=report.externalRequestHosts.length===0?'PASS':'FAIL';
  expect(requests.filter(url=>url.startsWith(base+'/')&&/\.js(?:\?|$)/.test(url)).map(url=>new URL(url).pathname).sort()).toEqual(['/app.js','/catalog-additions.js','/catalog.js','/icons.js']);
  report.cases.push('no script exceptions and only four app-owned lightweight Home scripts');
  report.functionalResult='PASS';
  report.result=report.zeroExternalRequests==='PASS'?'PASS':'PARTIAL: external requests observed, inspect environment injection';
}finally{await browser?.close();await new Promise(r=>server.close(r));}
await writeFile('stool-local-home.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
