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

test('Format ink width/opacity and styled Unicode text survive actual PDF serialization',async()=>{
 const original=await lib.PDFDocument.create();
 original.addPage([595,842]).drawText('SOURCE', {x:40,y:780});
 const source=await original.save();
 const view=(await getDocument({data:source.slice()}).promise).getPage(1);
 const viewport=(await view).getViewport({scale:1});
 const frame={width:viewport.width,height:viewport.height,transform:viewport.transform};
 const baseItem={page:0,viewport:frame,rect:{x:.15,y:.2,w:.4,h:.03}};
 const fontBytes=await loadBytes('sans');
 const metrics=fontkit.create(fontBytes),fontSize=20;
 const textItem={...baseItem,kind:'text',role:'fill',font:'sans',text:'Nguyễn Văn An',
  color:'#bb2244',fontSize,
  lineHeight:30,ascent:metrics.ascent/metrics.unitsPerEm*fontSize,
  baseWidth:240,baseHeight:35,rect:{x:.1,y:.2,w:240/frame.width,h:35/frame.height},
  textStyle:{bold:true,italic:true,underline:true,strike:true,align:'center',lineSpacing:1.5}};
 const styled=await saveText(source,[textItem],lib,{fontkit,loadBytes,point:A.point});
 const ink={...baseItem,id:'format-ink',kind:'ink',color:[1,.2,.1],opacity:.63,strokeWidth:6,
  rect:{x:.2,y:.35,w:.2,h:.1},points:[[0,0],[.5,.4],[1,1]]};
 const highlighter={...baseItem,id:'format-highlight',kind:'highlight',color:[.1,.8,.2],
  opacity:.45,strokeWidth:2,rect:{x:.15,y:.52,w:.35,h:.03}};
 const result=await A.save(styled,[ink,highlighter],async()=>viewport,lib);
 assert.equal((await lib.PDFDocument.load(result)).getPageCount(),1);
 const read=await getDocument({data:result.slice()}).promise,p=await read.getPage(1);
 const text=(await p.getTextContent()).items.map(i=>i.str).join(' ');
 assert.match(text,/SOURCE/);assert.match(text,/Nguyễn Văn An/);
 const annotations=await p.getAnnotations();
 const inkRestored=annotations.find(a=>a.subtype==='Ink');
 const highlightRestored=annotations.find(a=>a.subtype==='Highlight');
 assert.ok(inkRestored);assert.ok(highlightRestored);
 assert.ok(Math.abs(inkRestored.opacity-.63)<.01);
 assert.equal(inkRestored.borderStyle.width,6);
 assert.ok(Math.abs(highlightRestored.opacity-.45)<.01);
 await read.loadingTask.destroy();
});
