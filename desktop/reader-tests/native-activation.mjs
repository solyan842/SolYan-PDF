// Installed EXE + real WebView2. CDP is enabled only by this test's child env.
import {chromium,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const exec=promisify(execFile);
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Installed activation tests require a disposable Windows Actions runner');
const exe=resolve(process.argv[2]),root=resolve('desktop/reader-tests/test-results/native-activation');
const helper=fileURLToPath(new URL('./scripts/reader-window-check.ps1',import.meta.url));
await mkdir(join(root,'Tiếng Việt (1)'),{recursive:true});
const a=join(root,'Tiếng Việt (1)','Tài liệu A (1).pdf'),b=join(root,'B.pdf'),c=join(root,'Tài liệu A (1).pdf'),bad=join(root,'broken.pdf');
async function fixture(path,text){const pdf=await PDFDocument.create();for(let i=0;i<3;i++)pdf.addPage([600,800]).drawText(`${text} page ${i+1}`,{x:60,y:650});await writeFile(path,await pdf.save());}
await fixture(a,'NATIVE SOURCE A');await fixture(b,'NATIVE SOURCE B');await fixture(c,'NATIVE SOURCE C');await writeFile(bad,'not a PDF');
const originalA=await readFile(a);
const log=[],owned=new Set();let app,browser,page;
async function windows(mode='Inspect',file){
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode',mode,'-Exe',exe];
  if(file)args.push('-FilePath',file);
  const {stdout}=await exec('powershell.exe',args,{windowsHide:true,timeout:20000});
  return JSON.parse(stdout.trim());
}
async function assertSingle(){
  let state;
  await expect.poll(async()=>{state=await windows();return state.apps.length;},{timeout:15000}).toBe(1);
  expect(state.apps[0].pid).toBe(app.pid);expect(state.apps[0].windows).toHaveLength(1);expect(state.engines).toBe(0);
  return state.apps[0];
}
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value;}
async function secondary(files){
  const child=spawn(exe,files,{windowsHide:true,stdio:'ignore'});owned.add(child.pid);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Second Reader instance did not exit')),15000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);owned.delete(child.pid);code===0?resolve():reject(Error(`Secondary Reader exit ${code}`));});});
}
async function start(files,earlyFiles){
  const cdp=await port();
  app=spawn(exe,files,{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-address=127.0.0.1 --remote-debugging-port=${cdp}`,WEBVIEW2_USER_DATA_FOLDER:join(root,`webview-${cdp}`)}});
  owned.add(app.pid);
  app.on('error',e=>{log.push({spawnError:e.message});});
  if(earlyFiles){await assertSingle();await secondary(earlyFiles);log.push({case:'launch-before-WebView-attachment'});}
  await expect.poll(async()=>{try{return(await fetch(`http://127.0.0.1:${cdp}/json/version`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},{timeout:45000,intervals:[200,500]}).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
  await expect.poll(()=>browser.contexts()[0]?.pages().some(p=>p.url().includes('reader.html')),{timeout:30000}).toBe(true);
  page=browser.contexts()[0].pages().find(p=>p.url().includes('reader.html'));
  page.on('pageerror',error=>log.push({pageerror:error.message}));
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
}
async function stop(){
  const tracked=(await windows()).descendants;
  if(browser){await browser.close();browser=null;}
  for(const pid of [...owned]){
    // Each PID was created by this test. Never kill an unrelated Reader/WebView.
    try{await exec('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:15000});}catch(error){
      const state=await windows();if(state.apps.some(p=>p.pid===pid))throw error;
    }
    owned.delete(pid);
  }
  await expect.poll(async()=>(await windows()).apps.length,{timeout:10000}).toBe(0);
  await expect.poll(async()=>{const state=await windows();return tracked.filter(pid=>state.livePids.includes(pid));},{timeout:10000}).toEqual([]);
}
const activeText=()=>page.locator('.readerContainer:not([hidden]) .textLayer');
try{
  await start([a]);await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await expect(activeText()).toContainText(['NATIVE SOURCE A']);
  const originalWindow=await assertSingle();
  // Native IPC cannot be used as an arbitrary filesystem reader.
  expect(await page.evaluate(async()=>{try{await window.__TAURI__.core.invoke('reader_read_open_request',{ticket:'C:/Windows/win.ini'});return false;}catch{return true;}})).toBe(true);
  await page.locator('#pageNumber').fill('2');await page.locator('#pageNumber').press('Tab');
  await page.locator('#zoom').selectOption('1.5');
  await page.locator('[data-ribbon=sign]').click();await page.locator('#fillCheck').click();
  const signature=await page.locator('.signature.selected').getAttribute('data-signature');
  const scroll=await page.locator('.readerContainer:not([hidden])').evaluate(node=>node.scrollTop);
  await expect(page.locator('#tabs .title')).toContainText('●');
  await secondary([b]);await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(activeText()).toContainText(['NATIVE SOURCE B']);
  expect((await assertSingle()).windows[0]).toBe(originalWindow.windows[0]);
  await secondary([a.toUpperCase()]);
  await expect(page.locator('#tabs .tab.active .title')).toContainText('●');
  await expect(page.locator('#tabs .tab')).toHaveCount(2);await expect(page.locator('#pageNumber')).toHaveValue('2');
  await expect(page.locator('.signature.selected')).toHaveAttribute('data-signature',signature);
  await expect.poll(()=>page.locator('.readerContainer:not([hidden])').evaluate(node=>node.scrollTop)).toBe(scroll);
  expect(await page.locator('.readerContainer:not([hidden]) .page').first().evaluate(p=>parseFloat(getComputedStyle(p).getPropertyValue('--scale-factor')))).toBe(2);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#tabs .tab.active .close').click();
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await windows('Minimize');expect((await assertSingle()).minimized).toBe(true);
  log.push(await windows('Association',c));
  await expect(page.locator('#tabs .tab')).toHaveCount(3);await expect(activeText()).toContainText(['NATIVE SOURCE C']);
  let restored;
  await expect.poll(async()=>{restored=await assertSingle();return restored.minimized;}).toBe(false);
  expect(restored.windows[0]).toBe(originalWindow.windows[0]);
  expect(restored.foreground).toBe(originalWindow.windows[0]);
  log.push(await windows('Association',b));await expect(activeText()).toContainText(['NATIVE SOURCE B']);
  await expect(page.locator('#tabs .tab')).toHaveCount(3);
  await page.locator('#tabs .tab.active .close').click();await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await secondary([b]);await expect(page.locator('#tabs .tab')).toHaveCount(3);await expect(activeText()).toContainText(['NATIVE SOURCE B']);
  await secondary([bad,a]);await expect(page.locator('#tabs .tab.active .title')).toContainText('●');
  await expect(page.locator('#tabs .tab')).toHaveCount(3);await assertSingle();
  const chooser=page.evaluate(()=>window.__TAURI__.core.invoke('reader_choose_files'));
  await expect.poll(async()=>(await windows('CancelOpen')).cancelled,{timeout:15000}).toBe(true);
  expect(await chooser).toBe(false);
  await expect(page.locator('#tabs .tab')).toHaveCount(3);await expect(page.locator('#tabs .tab.active .title')).toContainText('●');
  await page.screenshot({path:join(root,'installed-tabs.png')});
  log.push({case:'installed-EXE-and-Open-With',pid:app.pid,hwnd:originalWindow.windows[0],tabs:3,dirtyPreserved:true,duplicateFocus:true,caseAlias:true,unicodePaths:true,sameBasenameDistinct:true,minimizedRestored:true});
  await stop();
  await start([a],[b]);await expect(page.locator('#tabs .tab')).toHaveCount(2);await expect(activeText()).toContainText(['NATIVE SOURCE B']);await assertSingle();
  expect(await readFile(a)).toEqual(originalA);
  expect(log.filter(entry=>entry.pageerror)).toEqual([]);
  log.push({case:'restart-and-early-second-launch',tabs:2});
}catch(error){
  log.push({failure:error.stack});
  if(page&&!page.isClosed())await page.screenshot({path:join(root,'failure.png')}).catch(()=>{});
  throw error;
}finally{
  try{await stop();}finally{await writeFile(join(root,'report.json'),JSON.stringify(log,null,2));}
}
console.log('Installed Reader native activation, one HWND/process, real tabs/content, Open With, duplicates/dirty/minimize/restart: PASS');
