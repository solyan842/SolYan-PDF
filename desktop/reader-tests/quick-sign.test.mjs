import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import * as PDFLib from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url), Q=require('../ui/quick-sign.js');
export async function fixture() {
  const pdf=await PDFLib.PDFDocument.create();
  for(const rotation of [0,90,180,270]){const page=pdf.addPage([600,800]);page.setRotation(PDFLib.degrees(rotation));page.setCropBox(20,30,550,730);page.drawText('SOLYAN original searchable text',{x:70,y:500});}
  return pdf.save();
}
test('eight resize handles, corner ratio, edge independence, bounds and page ranges',()=>{
  const rect={x:.2,y:.2,w:.3,h:.1};
  for(const handle of ['nw','ne','sw','se']){const r=Q.resize(rect,handle,.04,.02);assert.ok(Math.abs(r.w/r.h-3)<1e-8);}
  assert.equal(Q.resize(rect,'e',.2,0).h,.1);assert.equal(Q.resize(rect,'s',0,.2).w,.3);
  assert.equal(Q.move(rect,5,-5).x,.7);assert.equal(Q.move(rect,5,-5).y,0);
  assert.deepEqual(Q.pages('1,3-4',4,0),[0,2,3]);assert.deepEqual(Q.pages('all',4,0),[0,1,2,3]);assert.throws(()=>Q.pages('0-8',4,0));
  const copied=Q.copyRect(rect,{width:600,height:800},{width:300,height:400});assert.equal(copied.w,.6);assert.equal(copied.h,.2);
});
test('flatten signature as an image, reopen all rotations/crop origins and preserve source text',async()=>{
  const bytes=await fixture(), original=Buffer.from(bytes);
  const pdf=await getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const placements=Array.from({length:4},(_,page)=>({page,image:png,rect:{x:.1,y:.6,w:.25,h:.1}}));
  const viewportFor=async i=>(await pdf.getPage(i+1)).getViewport({scale:1});
  for(const placement of placements){const viewport=await viewportFor(placement.page),m=Q.imageMatrix(viewport,placement.rect);const [a,b,c,d,e,f]=viewport.transform;
    const transform=(x,y)=>[a*x+c*y+e,b*x+d*y+f];
    const origin=transform(m[4],m[5]),right=transform(m[4]+m[0],m[5]+m[1]);
    assert.ok(Math.abs(origin[0]-viewport.width*.1)<1e-6);assert.ok(Math.abs(origin[1]-viewport.height*.7)<1e-6);assert.ok(Math.abs(right[0]-viewport.width*.35)<1e-6);
  }
  const saved=await Q.save(bytes,placements,viewportFor,PDFLib);assert.deepEqual(Buffer.from(bytes),original);
  const reopened=await getDocument({data:saved.slice(),isEvalSupported:false}).promise;assert.equal(reopened.numPages,4);
  for(let i=1;i<=4;i++) {const page=await reopened.getPage(i);assert.match((await page.getTextContent()).items.map(i=>i.str).join(' '),/SOLYAN original searchable text/);const ops=await page.getOperatorList();assert.ok(ops.fnArray.includes(85),'Image XObject must exist');}
  const output=await PDFLib.PDFDocument.load(saved);assert.equal(output.getPageCount(),4);assert.equal(output.getForm().getFields().length,0);
  await writeFile(new URL('./test-results-signed.pdf',import.meta.url),saved);await pdf.loadingTask.destroy();await reopened.loadingTask.destroy();
});
