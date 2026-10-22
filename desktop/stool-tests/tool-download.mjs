// The tool's visible error is actionable evidence; do not hide it behind a
// multi-minute download timeout. Both branches have rejection handlers via race.
export async function downloadOutput(page,button,path,timeout=300000){
  const download=page.waitForEvent('download',{timeout});
  download.catch(()=>{});
  await page.locator(button).click();
  const failure=page.locator('#status.error').waitFor({state:'visible',timeout})
    .then(async()=>{throw Error('Tool failed: '+await page.locator('#status').textContent());});
  const saved=await Promise.race([download,failure]);
  const error=await saved.failure();
  if(error)throw Error('Download failed: '+error);
  await saved.saveAs(path);
}
