import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';

const ui=new URL('../ui/',import.meta.url),assets=new Map();
for(const p of ['cloud-storage.html','cloud-storage.js','tool.css','icons.js','output-name.js','output-save.js'])assets.set('/'+p,await readFile(new URL(p,ui)));
for(const p of ['cloud','cloud-check','cloud-arrow-up'])assets.set(`/icons/phosphor-duotone/${p}-duotone.svg`,await readFile(new URL(`icons/phosphor-duotone/${p}-duotone.svg`,ui)));
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname,body=assets.get(path);res.writeHead(body?200:404,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*"});res.end(body||'not found')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:process.env.STOOL_BROWSER_CHANNEL||undefined});
try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.calls=[];window.webdavConnected=false;window.__TAURI__={core:{invoke:async command=>{if(command!=='desktop_core_session')throw Error(command);return 'http://127.0.0.1:44000\nlocal-token'}}};window.fetch=async(url,init={})=>{const path=new URL(String(url)).pathname;window.calls.push({url:String(url),method:init.method||'GET',token:new Headers(init.headers||{}).get('X-SolYan-Desktop-Token'),credentials:init.credentials||''});if(path==='/storage/providers')return new Response(JSON.stringify({providers:[{id:'google',label:'Google Drive',configured:false,connected:false},{id:'onedrive',label:'OneDrive',configured:false,connected:false}],max_file_size:104857600}),{status:200});if(path==='/storage/webdav/status')return new Response(JSON.stringify({id:'webdav',label:'WebDAV',configured:true,connected:window.webdavConnected,supports:{list:true,download:true,upload:true,replace:true}}),{status:200});if(path==='/storage/webdav/connect'){window.webdavConnected=true;return new Response('{"ok":true}',{status:200})}if(path==='/storage/webdav/files'&&init.method==='POST'){window.uploaded={name:init.body.get('file').name,folder:init.body.get('folder_id')};return new Response('{"ok":true}',{status:201})}if(path==='/storage/webdav/files/file-1')return new Response(new Blob(['%PDF-1.7\ncloud result']),{status:200,headers:{'Content-Type':'application/pdf'}});if(path==='/storage/webdav/files')return new Response(JSON.stringify({items:[{id:'file-1',name:'Cloud.pdf',kind:'pdf',size:1280}]}),{status:200});return new Response('{"detail":"not found"}',{status:404})}});
 await page.goto(`http://127.0.0.1:${server.address().port}/cloud-storage.html?provider=webdav`);
 assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.locator('#refreshBtn').click();await page.waitForFunction(()=>document.querySelector('#providerStatus').textContent.includes('Sẵn sàng'));assert.match(await page.locator('#providerStatus').textContent(),/Sẵn sàng/);
 await page.locator('#connectBtn').click();await page.locator('.file-card').waitFor();assert.equal(await page.locator('#providerStatus').textContent(),'Đã kết nối');
 await page.locator('.file-card button').first().click();await page.waitForFunction(()=>document.querySelector('.output-result'));
 assert.equal(await page.locator('.output-result strong').textContent(),'Cloud.pdf');
 await page.locator('#uploadFile').setInputFiles({name:'Updated.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nsource')});
 await page.waitForFunction(()=>window.uploaded?.name==='Updated.pdf');assert.equal(await page.evaluate(()=>window.uploaded.folder),'root');
 const calls=await page.evaluate(()=>window.calls);assert(calls.every(call=>call.token==='local-token'&&call.credentials==='include'));
 console.log(JSON.stringify({providers:['google','onedrive','webdav'],webdav:['connect','list','download-save','upload'],credentialedCoreRequests:'PASS',status:'PASS'}));await page.close();
}finally{await browser.close();server.close()}
