import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {exerciseReaderLoad} from './reader-load.mjs';

test('ten tabs and a 100-page PDF stay readable, bounded and closable',async({page})=>{
  const files=[];
  for(let n=0;n<9;n++){
    const pdf=await PDFDocument.create(),pages=n===0?100:3,label='LOAD '+n;
    for(let i=0;i<pages;i++)pdf.addPage([600,800]).drawText(label+' PAGE '+(i+1),{x:60,y:650});
    const bytes=await pdf.save();files.push({name:'load-'+n+'.pdf',label,pages,bytes:bytes.length,data:[...bytes]});
  }
  await page.goto('/reader.html');
  await page.locator('#pdfFiles').setInputFiles({name:'baseline.pdf',mimeType:'application/pdf',buffer:Buffer.from(files[1].data)});
  await expect(page.locator('.page canvas').first()).toBeVisible();
  const result=await exerciseReaderLoad({page,files,sampleMemory:async()=>({scope:'browser regression; native RAM not measured'}),
    open:file=>page.locator('#pdfFiles').setInputFiles({name:file.name,mimeType:'application/pdf',buffer:Buffer.from(file.data)})});
  expect(result.opens).toHaveLength(9);expect(result.switches).toHaveLength(3);
  await expect(page.locator('#tabs .tab .title')).toHaveText('baseline.pdf');
});
