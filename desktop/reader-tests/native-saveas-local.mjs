// Focused local portable EXE acceptance. No installer, registry policies or CI guard bypass.
import {chromium,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const exec=promisify(execFile),repo=fileURLToPath(new URL('../../',import.meta.url));
const exe=resolve(repo,'../../outputs/Reader-local/solyan-pdf-reader.exe');
const root=resolve(repo,'desktop/reader-tests/test-results/native-saveas-local');
const helper=fileURLToPath(new URL('./scripts/local-save-window.ps1',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const log=[];let app,browser,page,passed=false;
async function windows(mode,target){
 const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode',mode,'-ReaderPid',String(app?.pid||0),'-Exe',exe];
 if(target)args.push('-Target',target);
 const {stdout}=await exec('powershell.exe',args,{windowsHide:true,timeout:20000});
 return JSON.parse(stdout.trim());
}
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value;}
async function inspectPdf(path,value){
 const bytes=await readFile(path);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
 const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(3);
 expect(pdf.getForm().getTextField('NativeName').getText()).toBe(value);
 const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false});
 try{const d=await task.promise;const text=await (await d.getPage(1)).getTextContent();expect(text.items.map(i=>i.str).join(' ')).toContain('SOLYAN NATIVE SAVE AS ORIGINAL');}finally{await task.destroy();}
 return bytes;
}
async function saveAs(path){
 await rm(path,{force:true});await page.locator('#save').click();
 await expect.poll(async()=>{const state=await windows('SaveAs',path);if(state.submitted||state.saved)log.push({saveDialog:state});return state.saved;},{timeout:20000,message:'Exact requested native PDF destination must exist'}).toBe(true);
 await expect(page.locator('#tabs .tab.active .title')).not.toContainText('●');
}
try{
 if(process.platform!=='win32')throw Error('Windows required');
 const preflight=await windows('Preflight');log.push({preflight});
 if(!preflight.desktopReady)throw Error('Run this test on the interactive Windows desktop, outside the Codex sandbox');
 if(preflight.elevated)throw Error('Run the test from a normal, non-administrator terminal');
 if(preflight.runningReaderPids.length)throw Error('Close existing sReader windows before this isolated test; owner processes will not be terminated');
 const metadata=JSON.parse(await readFile(resolve(exe,'../build.json'),'utf8'));
 expect(hash(await readFile(exe))).toBe(metadata.sha256);log.push({build:metadata});
 await mkdir(root,{recursive:true});
 const source=join(root,'source.pdf'),a=join(root,'Tiếng Việt (1) + [b].pdf'),b=join(root,'second-working-copy.pdf');
 const fixture=await PDFDocument.create();for(let i=0;i<3;i++)fixture.addPage([600,800]).drawText('SOLYAN NATIVE SAVE AS ORIGINAL '+(i+1),{x:50,y:650});
 const field=fixture.getForm().createTextField('NativeName');field.setText('Initial');field.addToPage(fixture.getPage(0),{x:60,y:100,width:240,height:28});
 const original=await fixture.save();await writeFile(source,original);
 const cdp=await port();
 app=spawn(exe,[source],{windowsHide:false,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-address=127.0.0.1 --remote-debugging-port='+cdp,WEBVIEW2_USER_DATA_FOLDER:join(root,'webview-'+cdp)}});
 app.on('error',e=>log.push({spawnError:e.message}));
 await expect.poll(async()=>{if(app.exitCode!==null)throw Error('Isolated Reader exited before attachment');try{return (await fetch('http://127.0.0.1:'+cdp+'/json/version',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},{timeout:45000}).toBe(true);
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+cdp);
 await expect.poll(()=>browser.contexts()[0]?.pages().some(p=>p.url().includes('reader.html')),{timeout:30000}).toBe(true);
 page=browser.contexts()[0].pages().find(p=>p.url().includes('reader.html'));
 page.on('pageerror',e=>log.push({pageerror:e.message}));
 await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const input=page.locator('input[name=NativeName]');await expect(input).toBeVisible();
 await input.fill('Nguyễn Văn An');await expect(page.locator('#tabs .tab.active .title')).toContainText('●');
 await saveAs(a);const first=await inspectPdf(a,'Nguyễn Văn An');expect(await readFile(source)).toEqual(Buffer.from(original));
 await input.fill('Trần Minh Bình');await page.keyboard.press('Control+s');await expect(page.locator('#tabs .tab.active .title')).not.toContainText('●');
 const saved=await inspectPdf(a,'Trần Minh Bình');expect(saved).not.toEqual(first);expect(await readFile(source)).toEqual(Buffer.from(original));
 await input.fill('Chưa lưu');await page.locator('#save').click();
 await expect.poll(async()=>{const state=await windows('Cancel');return state.cancelled;},{timeout:15000}).toBe(true);
 await expect(page.locator('#save')).toBeEnabled();await expect(page.locator('#tabs .tab.active .title')).toContainText('●');
 expect(await readFile(a)).toEqual(saved);expect(await readFile(source)).toEqual(Buffer.from(original));
 await saveAs(b);await inspectPdf(b,'Chưa lưu');expect(await readFile(a)).toEqual(saved);
 await input.fill('Nguyễn Văn An');await page.keyboard.press('Control+s');await expect(page.locator('#tabs .tab.active .title')).not.toContainText('●');
 const second=await inspectPdf(b,'Nguyễn Văn An');expect(await readFile(a)).toEqual(saved);expect(await readFile(source)).toEqual(Buffer.from(original));
 expect(log.filter(x=>x.pageerror)).toEqual([]);
 await page.screenshot({path:join(root,'native-saveas-pass.png')});
 log.push({case:'native-saveas-local',firstPath:a,secondPath:b,originalSha256:hash(original),originalAfterSha256:hash(await readFile(source)),firstCopySha256:hash(saved),secondCopySha256:hash(second),unicodeForm:true,sourceText:true,ctrlSChosenCopy:true,cancelRetainsDirty:true,originalUnchanged:true});
 passed=true;console.log('NATIVE SAVE AS PDF / UNICODE FORM / CTRL+S / CANCEL / SOURCE IMMUTABLE: PASS');
}catch(error){
 log.push({error:error.stack||String(error)});if(page)await page.screenshot({path:join(root,'native-saveas-failure.png')}).catch(()=>{});throw error;
}finally{
 if(browser)await browser.close().catch(()=>{});
 if(app?.pid&&app.exitCode===null)await exec('taskkill.exe',['/PID',String(app.pid),'/T','/F'],{windowsHide:true}).catch(e=>log.push({cleanupError:e.message}));
 await mkdir(root,{recursive:true});await writeFile(join(root,'report.json'),JSON.stringify({passed,log},null,2));
}
