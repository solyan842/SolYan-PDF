import {expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {stat} from 'node:fs/promises';
import {parseHelperJSON} from './close-protocol.mjs';
const exec=promisify(execFile);

export async function saveNativeResult(page,row,path,{ownerPid,action='Save',saveAs=false,overwrite=false,expectError=false}={}){
  if(!Number.isInteger(ownerPid)||ownerPid<=0)throw Error('Exact app owner PID required');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('desktop/backend/stool-save-dialog.ps1'),'-OwnerPid',String(ownerPid),'-Action',action];
  if(path)args.push('-Destination',resolve(path));
  if(overwrite)args.push('-AllowOverwrite');
  const dialog=exec('powershell.exe',args,{windowsHide:true,timeout:45000});
  // Observe rejection immediately, including when a browser click fails first.
  dialog.catch(()=>{});
  const [result]=await Promise.all([dialog,row.locator(saveAs?'.output-save-as':'.output-save').click()]);
  const acknowledgement=parseHelperJSON(result.stdout,'native Save dialog');
  expect(acknowledgement.ownerPid).toBe(ownerPid);expect(acknowledgement.dialogClosed).toBe(true);
  expect(acknowledgement.action).toBe(action);
  expect(acknowledgement.overwriteConfirmed).toBe(overwrite||action==='DeclineOverwrite');
  if(action!=='Save')await expect(row.locator('[role=status]')).toContainText(/hủy|cancelled/i);
  else if(expectError)await expect(row.locator('[role=status]')).toHaveClass(/error/);
  else{
    await expect(row.locator('[role=status]')).toHaveClass(/success/);
    await expect(row.locator('[role=status]')).toContainText(resolve(path));
    expect((await stat(path)).size).toBeGreaterThan(0);
  }
  await expect(row.locator('.output-save')).toBeEnabled();
  await expect(row.locator('.output-save-as')).toBeEnabled();
  return acknowledgement;
}

export async function produceNativeOutput(page,button,timeout=300000){
  const count=await page.locator('.output-result').count();
  await page.locator(button).click();
  await page.waitForFunction(count=>document.querySelectorAll('.output-result').length>count||document.querySelector('#status')?.classList.contains('error'),count,{timeout});
  if(await page.locator('.output-result').count()===count)throw Error('Tool failed: '+await page.locator('#status').textContent());
  const row=page.locator('.output-result').last();
  await expect(row.locator('.output-save')).toBeVisible();
  await expect(row.locator('.output-save-as')).toBeVisible();
  return row;
}

export async function saveNativeOutput(page,button,path,ownerPid,timeout=300000){
  const row=await produceNativeOutput(page,button,timeout);
  await saveNativeResult(page,row,path,{ownerPid});
  return row;
}
