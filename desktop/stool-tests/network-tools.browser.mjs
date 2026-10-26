import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const p of ['network-tool.html','network-tool.js','tool.css','icons.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
for(const p of ['wifi-high','chart-line'])assets.set(`/icons/phosphor-duotone/${p}-duotone.svg`,await readFile(new URL(`icons/phosphor-duotone/${p}-duotone.svg`,ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.calls=[];window.invokeCount=0;window.__TAURI__={core:{invoke:async command=>{if(command!=='desktop_core_session')throw Error(command);window.invokeCount++;return 'http://127.0.0.1:44000\nlocal-token'}}};window.fetch=async(url,init)=>{window.calls.push({url:String(url),token:init.headers['X-SolYan-Desktop-Token'],body:JSON.parse(init.body)});return new Response(JSON.stringify(String(url).endsWith('/net/ping')?{host:'example.com',reachable:true,output:'time=12ms'}:{domain:'example.com',provider:'Tranco-compatible',latest:{date:'2026-10-25',rank:12345}}),{status:200,headers:{'Content-Type':'application/json'}})}});
 await page.goto(`http://127.0.0.1:${server.address().port}/network-tool.html?tool=ping`);
 assert.equal(await page.locator('#toolName').textContent(),'Ping');assert.equal(await page.locator('#runBtn').isDisabled(),false);assert.equal(await page.evaluate(()=>window.invokeCount),0);
 await page.locator('#target').fill('example.com');await page.locator('#runBtn').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);
 assert.match(await page.locator('#status').textContent(),/phản hồi ping/);
 assert.deepEqual(await page.evaluate(()=>window.calls[0]),{url:'http://127.0.0.1:44000/net/ping',token:'local-token',body:{host:'example.com'}});
 await page.goto(`http://127.0.0.1:${server.address().port}/network-tool.html?tool=ranking`);
 assert.equal(await page.locator('#toolName').textContent(),'Website Ranking');
 await page.locator('#target').fill('example.com');await page.locator('#runBtn').click();await page.waitForFunction(()=>!document.querySelector('#result').hidden);
 assert.deepEqual(await page.evaluate(()=>window.calls[0]),{url:'http://127.0.0.1:44000/net/site-rank',token:'local-token',body:{domain:'example.com'}});
 assert.match(await page.locator('#result').textContent(),/12345/);
 console.log(JSON.stringify({tools:['ping','ranking'],lazyCoreStart:'PASS',localRoutes:['/net/ping','/net/site-rank'],status:'PASS'}));await page.close();
}finally{await browser.close();server.close()}

