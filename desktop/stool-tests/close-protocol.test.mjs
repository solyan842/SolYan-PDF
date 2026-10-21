import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {parseHelperJSON,assertCloseAcknowledgement,waitForOwnedShutdown} from './close-protocol.mjs';
test('empty, malformed and scalar helper replies cannot acknowledge close',()=>{
  for(const value of ['', '  ', 'not json','null','true','[]'])assert.throws(()=>parseHelperJSON(value));
  for(const value of [{},{mode:'Close',ownerPid:123,closeRequested:false},{mode:'Close',ownerPid:999,closeRequested:true}])assert.throws(()=>assertCloseAcknowledgement(value,123));
  assertCloseAcknowledgement(parseHelperJSON('{"mode":"Close","ownerPid":123,"closeRequested":true}'),123);
});
test('actual PowerShell close function emits JSON only after successful request',()=>{
  const path=fileURLToPath(new URL('../backend/stool-close-response.ps1',import.meta.url)).replaceAll("'","''");
  const invoke=success=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',`$ErrorActionPreference='Stop';. '${path}';$owner=[pscustomobject]@{Id=123};$owner | Add-Member ScriptMethod CloseMainWindow {return $${success}};Request-StoolWindowClose -Owner $owner | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  assertCloseAcknowledgement(parseHelperJSON(invoke('true')),123);
  assert.throws(()=>invoke('false'),e=>e.status!==0&&e.stderr.includes('CloseMainWindow refused'));
  const helper=readFileSync(new URL('../backend/stool-process-smoke.ps1',import.meta.url),'utf8');
  assert.match(helper,/Request-StoolWindowClose -Owner \$owner \| ConvertTo-Json -Compress/);
});
const clock=()=>{let t=0;return{timeoutMs:20,pollMs:5,now:()=>t,sleep:async ms=>{t+=ms;}};};
test('close acknowledgement cannot pass while app or any child lives',async()=>{
  await assert.rejects(waitForOwnedShutdown({pid:1,exitCode:null},[1,2],async()=>0,clock()),/remain alive/);
  await assert.rejects(waitForOwnedShutdown({pid:1,exitCode:0},[1,2],async()=>1,clock()),/remain alive/);
  await assert.rejects(waitForOwnedShutdown({pid:1,exitCode:1},[1,2],async()=>0,clock()),/abnormally/);
  await assert.rejects(waitForOwnedShutdown({pid:1,exitCode:0},[2],async()=>0,clock()),/missing/);
});
test('normal exit waits for last owned child and propagates inspection errors',async()=>{
  let reads=0;await waitForOwnedShutdown({pid:1,exitCode:0},[1,2],async()=>++reads===1?1:0,clock());assert.equal(reads,2);
  await assert.rejects(waitForOwnedShutdown({pid:1,exitCode:0},[1,2],async()=>{throw Error('census failed');},clock()),/census failed/);
});
