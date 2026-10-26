import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url);
const assets=new Map();
for(const path of ['page-tools.html','page-tools.js','tool.css','output-name.js','output-save.js'])assets.set('/'+path,await readFile(new URL(path,ui)));
assets.set('/vendor/pdf-lib.min.js',await readFile(new URL('vendor/pdf-lib.min.js',ui)));
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const body=assets.get(pathname);
  res.writeHead(body?200:404,{
    'Content-Type':pathname.endsWith('.html')?'text/html':pathname.endsWith('.css')?'text/css':'text/javascript',
    'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"
  });
  res.end(body||'not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
  for(const [tool,expectedPages,configure] of [
    ['split',[2,1],page=>page.locator('#pagesPerPart').fill('2')],
    ['extract-pages',[2],page=>page.locator('#pageRange').fill('3,1')],
    ['remove-pages',[2],page=>page.locator('#pageRange').fill('2')],
    ['reorder',[3],page=>page.locator('#pageOrder').fill('3,1,2')],
    ['rotate',[3],page=>page.locator('#pageRange').fill('all')],





    ['crop',[3],async page=>{await page.locator('#cropLeft').fill('5');await page.locator('#cropRight').fill('7');await page.locator('#cropTop').fill('6');await page.locator('#cropBottom').fill('8')}],
    ['metadata',[3],async page=>{await page.locator('#metaTitle').fill('QA title');await page.locator('#metaAuthor').fill('Hoang Minh Anh');await page.locator('#metaSubject').fill('Local test');await page.locator('#metaKeywords').fill('pdf, local')}],
    ['page-numbers',[3],async()=>{}],
    ['bates',[3],async page=>{await page.locator('#batesPrefix').fill('SY');await page.locator('#numberStart').fill('5')}]
  ]){
    const page=await browser.newPage();
    await page.addInitScript(()=>{
      window.saved=[];
      window.__TAURI__={core:{invoke:async(command,args)=>{
        if(command!=='stool_save_output')throw Error('Unexpected native command: '+command);
        window.saved.push(args);return 'C:\\QA\\'+args.name;
      }}};
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/page-tools.html?tool='+tool);
    await page.waitForFunction(()=>Boolean(window.PDFLib?.PDFDocument),null,{timeout:15000});
    const fixture=await page.evaluate(async()=>{
      const doc=await PDFLib.PDFDocument.create();
      for(const [width,height] of [[100,110],[150,160],[200,210]])doc.addPage([width,height]);
      return Array.from(new Uint8Array(await doc.save()));
    });
    const sourceHash=createHash('sha256').update(Buffer.from(fixture)).digest('hex');
    await page.locator('#fileInput').setInputFiles({name:'source.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixture)});
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Sẵn sàng xử lý'));
    await configure(page);
    await page.locator('#runBtn').click();
    const count=tool==='split'?2:1;
    await page.waitForFunction(expected=>document.querySelectorAll('#output-results .output-result').length===expected,count);
    const rows=page.locator('#output-results .output-result');
    const filenames=[];
    for(let index=0;index<count;index++){
      filenames.push(await rows.nth(index).locator('strong').textContent());
      await rows.nth(index).locator('.output-save').click();
      await page.waitForFunction(expected=>window.saved.length===expected,index+1);
    }
    const outputs=await page.evaluate(()=>window.saved);
    assert.equal(outputs.length,count);
    for(let index=0;index<outputs.length;index++){
      assert.equal(outputs[index].sourceHashes.includes(sourceHash),true,'native Save guard receives source hash');
      assert.match(outputs[index].name,/^source-.+\.pdf$/);
      const result=await page.evaluate(async bytes=>{
        const doc=await PDFLib.PDFDocument.load(new Uint8Array(bytes));
        return {count:doc.getPageCount(),widths:doc.getPages().map(page=>page.getSize().width),angles:doc.getPages().map(page=>page.getRotation().angle),cropBoxes:doc.getPages().map(page=>page.getCropBox()),title:doc.getTitle(),author:doc.getAuthor(),subject:doc.getSubject(),keywords:doc.getKeywords()};
      },outputs[index].bytes);
      assert.equal(result.count,expectedPages[index],tool+' output page count');
      if(tool==='reorder')assert.deepEqual(result.widths,[200,100,150]);
      if(tool==='rotate')assert.deepEqual(result.angles,[90,90,90]);
      if(tool==='crop')assert.deepEqual([result.cropBoxes[0].x,result.cropBoxes[0].y,result.cropBoxes[0].width,result.cropBoxes[0].height],[5,8,88,96]);
      if(tool==='metadata'){assert.equal(result.title,'QA title');assert.equal(result.author,'Hoang Minh Anh');assert.equal(result.subject,'Local test');assert.match(result.keywords,/pdf.*local/);}
    }
    const inputAfter=await page.locator('#fileInput').evaluate(async element=>Array.from(new Uint8Array(await element.files[0].arrayBuffer())));
    assert.equal(createHash('sha256').update(Buffer.from(inputAfter)).digest('hex'),sourceHash,'source PDF remains unchanged');
    console.log(JSON.stringify({tool,status:'PASS',outputNames:filenames,pages:expectedPages,sourceUnchanged:true}));
    await page.close();
  }
}finally{
  await browser.close();
  server.close();
}




