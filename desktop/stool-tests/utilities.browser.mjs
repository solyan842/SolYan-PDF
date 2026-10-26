import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';import {createServer} from 'node:http';import assert from 'node:assert/strict';
const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const path of ['utilities.html','utility-tools.js','tool.css'])assets.set('/'+path,await readFile(new URL(path,ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
const cases=[
['number-text',page=>page.locator('#numberInput').fill('1005'), 'một nghìn không trăm lẻ năm'],
['vn-text',async page=>{await page.locator('#vnText').fill('  Việt   Nam  ');await page.locator('#vnAction').selectOption('upper')},'VIỆT NAM'],
['vat',async page=>{await page.locator('#vatAmount').fill('100000');await page.locator('#vatRate').selectOption('10');await page.locator('#vatMode').selectOption('before')},'110.000 ₫'],
['percent',async page=>{await page.locator('#percentBase').fill('200');await page.locator('#percentNext').fill('150')},'Giảm 25,00%'],
['age',async page=>{await page.locator('#birthDate').fill('2000-10-26');await page.locator('#asOfDate').fill('2026-10-26')},'26 tuổi'],
['bmi',async page=>{await page.locator('#weightKg').fill('70');await page.locator('#heightCm').fill('175')},'22.86'],
['aircon',async page=>{await page.locator('#areaM2').fill('20');await page.locator('#sunlight').selectOption('600')},'12.000 BTU/h']
];
for(const [tool,fill,expected] of cases){const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/utilities.html?tool='+tool);await fill(page);await page.locator('#calculate').click();const result=await page.locator('#result').textContent();assert.ok(result.includes(expected),tool+' result '+result);console.log(JSON.stringify({tool,status:'PASS',result:result.trim().split('\n')[0]}));await page.close();}
}finally{await browser.close();server.close()}

