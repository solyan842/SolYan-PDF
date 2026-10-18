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
const A=require('../ui/reader-edits.js');
test('native annotations reopen at every page rotation and preserve text and source',async()=>{
 const bytes=await fixture(),original=bytes.slice();const input=await getDocument({data:bytes.slice()}).promise;const items=[];
 for(let page=0;page<4;page++){const viewport=(await input.getPage(page+1)).getViewport({scale:1});for(const [i,kind]of Object.keys(A.subtype).entries())items.push({id:`${page}-${kind}`,page,kind,text:'Ghi chú tiếng Việt',viewport,rect:{x:.12+(i%3)*.25,y:.15+Math.floor(i/3)*.2,w:.18,h:.09},points:[[0,.8],[.5,.1],[1,.7]]});}
 const saved=await A.save(bytes,items,async page=>(await input.getPage(page+1)).getViewport({scale:1}),PDFLib);
 assert.deepEqual(bytes,original);const output=await getDocument({data:saved.slice()}).promise;
 for(let page=1;page<=4;page++){const p=await output.getPage(page),annots=await p.getAnnotations();assert.equal(annots.length,9);assert.ok(annots.every(a=>a.hasAppearance));assert.ok(annots.some(a=>a.contentsObj.str==='Ghi chú tiếng Việt'));assert.match((await p.getTextContent()).items.map(i=>i.str).join(' '),/original searchable text/);for(const a of annots)assert.ok(a.rect.every(Number.isFinite));}
 const reopened=await PDFLib.PDFDocument.load(saved);for(const page of reopened.getPages())assert.equal(page.node.Annots().size(),9);
 await input.loadingTask.destroy();await output.loadingTask.destroy();
});
test('annotation frame preserves physical placement under zoom and view rotation',()=>{
 const source={width:600,height:800,transform:[1,0,0,-1,0,800]},item={viewport:source,rect:{x:.2,y:.3,w:.2,h:.1}};
 for(const target of [{width:1200,height:1600,transform:[2,0,0,-2,0,1600]},{width:800,height:600,transform:[0,1,1,0,0,0]}]){
 const frame=A.frame(item,target);assert.ok(frame.width>0&&frame.height>0);const pdf=A.point(source,120,240),expected=A.project(target,pdf);assert.deepEqual([frame.left,frame.top],expected);assert.deepEqual(A.point(target,A.project(target,pdf)[0],A.project(target,pdf)[1]),pdf);
 }
});
