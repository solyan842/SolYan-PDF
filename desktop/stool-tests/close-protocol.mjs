export function parseHelperJSON(stdout,label='PowerShell helper'){
  if(!stdout.trim())throw Error(`${label}: empty JSON response`);
  let value;try{value=JSON.parse(stdout.trim());}catch{throw Error(`${label}: invalid JSON response`);}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label}: expected JSON object`);
  return value;
}
export function assertCloseAcknowledgement(response,ownerPid){
  if(response.mode!=='Close'||response.ownerPid!==ownerPid||response.closeRequested!==true){
    throw Error('Owned application did not acknowledge CloseMainWindow request');
  }
}
export async function waitForOwnedShutdown(app,descendants,countAlive,options={}){
  const {timeoutMs=20000,pollMs=250,now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}=options;
  if(!descendants.includes(app.pid))throw Error('Shutdown census missing owned application PID');
  const deadline=now()+timeoutMs;
  do{
    if(app.exitCode!==null&&app.exitCode!==0)throw Error(`Owned application exited abnormally: ${app.exitCode}`);
    if(app.exitCode===0&&await countAlive(descendants)===0)return;
    if(now()>=deadline)break;
    await sleep(pollMs);
  }while(true);
  throw Error('Owned application or descendants remain alive after normal-close deadline');
}
