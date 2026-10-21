import {chromium,expect} from '@playwright/test';
import {expectedOcrLine} from './ocr-assertion.mjs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
import net from 'node:net';
import {parseHelperJSON,assertCloseAcknowledgement,waitForOwnedShutdown} from './close-protocol.mjs';
const exec=promisify(execFile);
if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows')throw Error('Disposable Windows runner required');
const exe=resolve(process.argv[2]),fixtures=resolve(process.argv[3]),out=resolve('artifacts/stool-native');
await mkdir(out,{recursive:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const originals=new Map(await Promise.all(['source.pdf','source.rtf','source.png'].map(async name=>[name,digest(await readFile(join(fixtures,name)))])));
const report={commit:process.env.GITHUB_SHA,hardware:{os:os.release(),cpu:os.cpus()[0]?.model,ramBytes:os.totalmem(),storage:'unmeasured'},cases:[]};
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const policy=resolve('desktop/backend/stool-webview-policy.ps1'),helper=resolve('desktop/backend/stool-process-smoke.ps1'),state=join(out,'policy.json');
let app,browser,page,monitor;
async function psJSON(script,args=[],timeout=30000){const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,...args],{windowsHide:true,timeout});return parseHelperJSON(stdout,script);}
const inspect=()=>psJSON(helper,['-Exe',exe,'-OwnerPid',String(app.pid)]);
async function roots(expected){const s=await inspect();expect(s.roots.map(p=>p.name).sort()).toEqual(expected.map(n=>'solyan-'+n+'.exe').sort());return s;}
async function go(file){await page.goto(new URL(file,report.origin).href);}
async function concurrent(service){
  const results=await page.evaluate(async service=>Promise.all(Array.from({length:8},()=>window.__TAURI__.core.invoke('desktop_service_ready',{service}))),service);
  expect(results).toEqual(Array(8).fill(true));
}
async function output(file,input,button,name,kind='pdf'){
  await go(file);await page.locator('#fileInput').setInputFiles(join(fixtures,input));
  const download=page.waitForEvent('download',{timeout:300000});await page.locator(button).click();
  const failure=page.locator('#status.error').waitFor({state:'visible',timeout:300000}).then(async()=>{throw Error('Tool failed: '+await page.locator('#status').textContent());});
  const saved=await Promise.race([download,failure]);expect(await saved.failure()).toBeNull();await saved.saveAs(join(out,name));
  await exec('python',['desktop/backend/tests/stool_fixtures.py',kind,join(out,name)],{windowsHide:true,timeout:30000});
}
async function watch(name){
  const stop=join(out,name+'.stop');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Mode','Watch','-Exe',exe,'-OwnerPid',String(app.pid),'-StopFile',stop];
  const child=exec('powershell.exe',args,{windowsHide:true,timeout:910000});
  // Attach a rejection handler immediately, even when the measured tool fails.
  child.catch(()=>{});monitor={stop,promise:child};
}
async function endWatch(){if(!monitor)return null;const m=monitor;monitor=null;await writeFile(m.stop,'complete');return JSON.parse((await m.promise).stdout.trim());}
try{
  report.transport=await psJSON(policy,['-Mode','Setup','-StateFile',state,'-Port',String(port),'-UserDataFolder',join(out,'profile')],60000);
  const launch=performance.now();
  app=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`,WEBVIEW2_USER_DATA_FOLDER:join(out,'profile')}});
  app.on('error',e=>{report.spawnError=e.message;});
  await watch('home');
  await expect.poll(async()=>{try{return (await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},{timeout:60000,intervals:[250,500]}).toBe(true);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect.poll(()=>browser.contexts()[0]?.pages().some(p=>p.url().endsWith('/index.html')||p.url().endsWith('/')),{timeout:30000}).toBe(true);
  page=browser.contexts()[0].pages()[0];report.origin=page.url();
  await expect(page.locator('#tool-search')).toBeVisible();
  const homeUsableMs=performance.now()-launch;
  await page.locator('#tool-search').fill('PDF');await expect(page.locator('#all-tools-grid .tool-card').first()).toBeVisible();
  await roots([]);await page.waitForTimeout(1500);await roots([]);
  report.home={observedUsableMs:homeUsableMs,memory:await endWatch(),scope:'fresh profile; OS cache uncontrolled; includes test transport/polling; not retail cold-start guarantee'};
  await page.screenshot({path:join(out,'home.png')});
  await output('transform.html?tool=compress','source.pdf','#runBtn','compressed.pdf');
  await roots(['core']);const coreBefore=(await inspect()).roots;
  const denied=await page.evaluate(async()=>{
    const [endpoint]=String(await window.__TAURI__.core.invoke('desktop_core_session')).split('\n');
    return Promise.all([fetch(endpoint+'/health'),fetch(endpoint+'/health',{headers:{'X-SolYan-Desktop-Token':'invalid-test-token'}})].map(async response=>(await response).status));
  });expect(denied).toEqual([401,401]);
  const same=await page.evaluate(async()=>{const values=await Promise.all(Array.from({length:8},()=>window.__TAURI__.core.invoke('desktop_core_session')));return new Set(values).size===1;});expect(same).toBe(true);
  expect((await inspect()).roots).toEqual(coreBefore);
  // Failure remains local: malformed PDF is rejected and a valid retry works.
  await page.locator('#fileInput').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await page.locator('#runBtn').click();await expect(page.locator('#status')).toHaveClass(/error/,{timeout:60000});
  await output('transform.html?tool=compress','source.pdf','#runBtn','retry.pdf');
  await psJSON(helper,['-Mode','Crash','-Exe',exe,'-OwnerPid',String(app.pid),'-Service','core']);
  await output('transform.html?tool=compress','source.pdf','#runBtn','core-recovered.pdf');await roots(['core']);
  report.cases.push('Core real output, concurrent session reuse, invalid input retry and crashed Core recovery');
  await concurrent('office');await roots(['core','office']);
  await output('office-convert.html?tool=rtf-pdf','source.rtf','#runBtn','office.pdf','office');
  const officeBefore=(await inspect()).roots;await concurrent('office');expect((await inspect()).roots).toEqual(officeBefore);
  await psJSON(helper,['-Mode','Crash','-Exe',exe,'-OwnerPid',String(app.pid),'-Service','office']);
  await output('office-convert.html?tool=rtf-pdf','source.rtf','#runBtn','office-recovered.pdf','office');await roots(['core','office']);
  report.cases.push('LibreOffice UI conversion, concurrent reuse and crashed Office recovery');
  await go('ocr.html');await page.locator('#fileInput').setInputFiles(join(fixtures,'source.png'));
  const ocrStarted=performance.now();await watch('ocr');
  await page.locator('#runOcr').click();
  await expect(page.locator('#outputPreview')).toHaveValue(expectedOcrLine,{timeout:300000});
  report.firstOcr={observedMs:performance.now()-ocrStarted,memory:await endWatch()};
  await roots(['core','office','ocr']);const ocrBefore=(await inspect()).roots;await concurrent('ocr');expect((await inspect()).roots).toEqual(ocrBefore);
  await page.locator('#runOcr').click();await expect(page.locator('#status')).toHaveClass(/success/,{timeout:300000});
  await psJSON(helper,['-Mode','Crash','-Exe',exe,'-OwnerPid',String(app.pid),'-Service','ocr']);
  await page.locator('#runOcr').click();await expect(page.locator('#status')).toHaveClass(/success/,{timeout:300000});
  await roots(['core','office','ocr']);
  await page.screenshot({path:join(out,'ocr.png')});
  report.cases.push('Offline OCR real text, first-use sampled peak and concurrent reuse');
  await concurrent('sign');await roots(['core','office','ocr','sign']);
  await go('sign.html');await page.locator('#pdfInput').setInputFiles(join(fixtures,'source.pdf'));
  await page.locator('#certInput').setInputFiles(join(fixtures,'certificate.p12'));await page.locator('#certPassword').fill('wrong');
  await page.locator('#runBtn').click();await expect(page.locator('#status')).toHaveClass(/error/,{timeout:90000});
  await psJSON(helper,['-Mode','Crash','-Exe',exe,'-OwnerPid',String(app.pid),'-Service','sign']);
  await page.locator('#certPassword').fill('CI-only-testing-passphrase');
  const signed=page.waitForEvent('download',{timeout:180000});await page.locator('#runBtn').click();await(await signed).saveAs(join(out,'signed.pdf'));
  await exec('python',['desktop/backend/tests/stool_fixtures.py','signed',join(out,'signed.pdf')],{windowsHide:true});
  await concurrent('sign');await roots(['core','office','ocr','sign']);
  report.cases.push('PKCS12 UI signing, wrong-passphrase retry; separate D6 cryptographic validation retained');
  await concurrent('archive');await roots(['core','office','ocr','sign','archive']);
  await output('pdfa.html','source.pdf','#runBtn','archive.pdf','pdfa');
  await psJSON(helper,['-Mode','Crash','-Exe',exe,'-OwnerPid',String(app.pid),'-Service','archive']);
  await output('pdfa.html','source.pdf','#runBtn','archive-recovered.pdf','pdfa');
  const allBefore=(await inspect()).roots;await concurrent('archive');expect((await inspect()).roots).toEqual(allBefore);
  report.cases.push('PDF/A UI conversion, metadata/output intents and concurrent reuse');
  for(const [name,hash]of originals)expect(digest(await readFile(join(fixtures,name)))).toBe(hash);
  const closing=await inspect();const acknowledgement=await psJSON(helper,['-Mode','Close','-Exe',exe,'-OwnerPid',String(app.pid)]);
  assertCloseAcknowledgement(acknowledgement,app.pid);
  // Exact PID census, no global name-based killing to manufacture cleanup PASS.
  await waitForOwnedShutdown(app,closing.descendants,async pids=>{
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue).Count`],{windowsHide:true,timeout:10000});
    const count=stdout.trim();if(!/^\d+$/.test(count))throw Error('Invalid owned-process census response');
    return Number(count);
  });
  report.cases.push('Acknowledged normal close, exit code zero and all owned descendant PIDs gone');
  report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});throw e;}
finally{
  report.pendingMonitor=await endWatch().catch(e=>({error:e.message}));
  if(browser)await browser.close().catch(()=>{});
  // Failure cleanup only: never counts as successful lifecycle acceptance.
  if(app&&app.exitCode===null)await exec('taskkill.exe',['/PID',String(app.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});
  try{await psJSON(policy,['-Mode','Cleanup','-StateFile',state]);}finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
}
console.log('Installed sTool lazy-engine UI acceptance PASS');
