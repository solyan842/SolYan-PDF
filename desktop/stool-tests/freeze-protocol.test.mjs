import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('native freeze leaves the owned process alive until explicit cleanup',()=>{
  assert.equal(process.platform,'win32','Windows native acceptance helper');
  const script=String.raw`
$ErrorActionPreference='Stop'
$source=Get-Content -Raw desktop/backend/stool-process-smoke.ps1
$native=[regex]::Match($source,"(?s)Add-Type @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if(-not $native){throw 'Missing production freeze helper'}
Add-Type -TypeDefinition $native
$owned=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/ping.exe') -ArgumentList @('-n','30','127.0.0.1') -PassThru -WindowStyle Hidden
try{
  $threads=[StoolFreeze]::Freeze([Diagnostics.Process[]]@($owned))
  $owned.Refresh()
  if($threads -lt 1 -or $owned.HasExited){throw 'Freeze did not leave a live process'}
  $owned.Kill()
  if(-not $owned.WaitForExit(5000)){throw 'Frozen owned process did not terminate'}
  @{threads=$threads;aliveAfterFreeze=$true;cleanup=$true}|ConvertTo-Json -Compress
}finally{
  $owned.Refresh()
  if(-not $owned.HasExited){$owned.Kill();$owned.WaitForExit()}
  $owned.Dispose()
}`;
  const reply=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:20000}).trim());
  assert.ok(reply.threads>0);assert.equal(reply.aliveAfterFreeze,true);assert.equal(reply.cleanup,true);
});
