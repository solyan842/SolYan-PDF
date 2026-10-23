// Driver acceptance against real common dialogs without sidecars/installer.
// The fixture chooses paths only; installed.mjs proves application file writes.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows')throw Error('Disposable Windows runner required');
const root=await mkdtemp(join(tmpdir(),'stool-dialog-'));
async function run(action,name,{overwrite=false}={}){
  const child=spawn('powershell.exe',['-STA','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('desktop/stool-tests/native-dialog-fixture.ps1'),'-InitialDirectory',root],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  // 'close' also waits for stdout/stderr to drain. 'exit' alone can leave the
  // fixture's current directory or redirected handles alive during cleanup.
  const done=new Promise((res,rej)=>{child.on('error',rej);child.on('close',(code,signal)=>code===0?res():rej(Error(stderr||`Fixture exit ${code}, signal ${signal}`)));});done.catch(()=>{});
  try{
    const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('desktop/backend/stool-save-dialog.ps1'),'-OwnerPid',String(child.pid),'-Action',action];
    if(name)args.push('-Destination',join(root,name));if(overwrite)args.push('-AllowOverwrite');
    const {stdout:reply}=await exec('powershell.exe',args,{windowsHide:true,timeout:45000});
    const ack=JSON.parse(reply.trim());assert.equal(ack.dialogClosed,true);assert.equal(ack.ownerPid,child.pid);
    await done;const selected=JSON.parse(stdout.trim());assert.equal(selected.result,action==='Save'?'OK':'Cancel');
    if(action==='Save')assert.equal(selected.path,join(root,name));
    console.log('Actual native dialog driver PASS:',action,name||'',overwrite?'overwrite Yes':'');
  }catch(error){
    // Log the original helper/fixture error before cleanup can fail. execFile
    // errors include helper stdout/stderr, which the durable CI log retains.
    console.error('Native dialog case failed:',{action,name,stdout,stderr});
    console.error(error);
    throw error;
  }finally{
    if(child.exitCode===null&&child.signalCode===null)child.kill();
    await done.catch(()=>{});
  }
}
let primaryError;
try{
  await run('Cancel');
  for(const name of ['chosen file.pdf','unicode-đường dẫn.txt','archive.zip'])await run('Save',name);
  await writeFile(join(root,'existing.pdf'),'public original');
  await run('DeclineOverwrite','existing.pdf');
  await run('Save','existing.pdf',{overwrite:true});
  assert.equal(await readFile(join(root,'existing.pdf'),'utf8'),'public original');
}catch(error){primaryError=error;throw error;}
finally{
  try{await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
  catch(error){console.error('Native dialog fixture cleanup failed:',error);if(!primaryError)throw error;}
}
