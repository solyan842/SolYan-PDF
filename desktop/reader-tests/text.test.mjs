import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as lib from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {saveText,textFonts} from '../ui/reader-text.js';
const A=createRequire(import.meta.url)('../ui/reader-edits.js');
const loadBytes=id=>readFile(new URL('../ui/vendor/reader-fonts/'+textFonts[id].file,import.meta.url));
test('bundled Unicode fonts match exact OFL sources',async()=>{
  const manifest=JSON.parse(await readFile(new URL('./reader-fonts.json',import.meta.url)));
  assert.equal(manifest.commit,'ffebf8c1ee449e544955a7e813c54f9b73848eac');assert.equal(manifest.license,'OFL-1.1');
  for(const entry of manifest.assets){const bytes=await readFile(new URL('../ui/vendor/reader-fonts/'+entry.name,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
});
test('three fonts retain searchable Vietnamese text, source bytes, crop and rotation',async()=>{
  const source=await lib.PDFDocument.create();for(const rotation of [0,90,180,270]){const p=source.addPage([600,800]);p.setRotation(lib.degrees(rotation));p.setCropBox(20,30,550,730);p.drawText('ORIGINAL TEXT',{x:60,y:600});}
  const bytes=await source.save(),original=bytes.slice(),sourceView=await getDocument({data:bytes.slice()}).promise,items=[];
  for(const [index,id]of Object.keys(textFonts).entries())for(let page=0;page<4;page++){
    const view=(await sourceView.getPage(page+1)).getViewport({scale:1}),metrics=fontkit.create(await loadBytes(id)),size=14;
    items.push({kind:'text',page,font:id,fontSize:size,text:'Tiếng Việt: Nguyễn Văn An '+id,color:'#bb2244',lineHeight:17.5,ascent:metrics.ascent/metrics.unitsPerEm*size,baseWidth:350,baseHeight:22,viewport:{width:view.width,height:view.height,transform:view.transform},rect:{x:.12,y:.2+index*.1,w:350/view.width,h:22/view.height}});
  }
  const result=await saveText(bytes,items,lib,{fontkit,loadBytes,point:A.point});assert.deepEqual(bytes,original);
  const reopened=await getDocument({data:result}).promise;assert.equal(reopened.numPages,4);
  for(let i=1;i<=4;i++){const p=await reopened.getPage(i),text=(await p.getTextContent()).items.map(x=>x.str).join(' ').replace(/\s+/g,' ');assert.match(text,/ORIGINAL TEXT/);for(const id of Object.keys(textFonts))assert.ok(text.includes('Tiếng Việt: Nguyễn Văn An '+id),JSON.stringify({page:i,font:id,text}));assert.equal(p.rotate,[0,90,180,270][i-1]);const ops=await p.getOperatorList();assert.ok(!ops.fnArray.includes(85),'native text must not become image XObjects');}
  await sourceView.loadingTask.destroy();await reopened.loadingTask.destroy();
});
