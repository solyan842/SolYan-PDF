// Exercise the actual compact UI, including opening the relevant popover.
export async function command(page,id){
  const control=page.locator('#'+id);
  if(!await control.isVisible()){
    const trigger=id.startsWith('annot-')?'moreAnnotations':['createSignature','fillText','fillDate','fillCheck','fillCross','signatureLibrary'].includes(id)?'fillMenu':'readerMenu';
    await page.locator('#'+trigger).click();
    const details=control.locator('..');
    if(await details.evaluate(el=>el.tagName==='DETAILS'&&!el.open))await details.locator('summary').click();
  }
  await control.click();
}
