import * as pdfjsLib from './vendor/pdfjs/pdf.mjs';

(()=>{
'use strict';
const $=id=>document.getElementById(id),MAX_BYTES=100*1024*1024,MAX_PAGES=500,MAX_EDITS=200,MAX_IMAGE_BYTES=20*1024*1024,MAX_QUEUED_IMAGE_BYTES=100*1024*1024,REDACT_DPI=150,MAX_PIXELS=25_000_000;
pdfjsLib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).toString();
const input=$('fileInput'),pageCanvas=$('pageCanvas'),overlay=$('overlayCanvas'),stage=$('canvasStage'),ctx=pageCanvas.getContext('2d'),overlayCtx=overlay.getContext('2d');
let file=null,sourceBytes=null,pdfjsDoc=null,pdfLibDoc=null,pageCount=0,pageNumber=1,viewport=null,busy=false,loading=false,drag=null,image=null,selectedText=null,pendingEdits=[],draftVisible=true;
const toolSelect=$('toolSelect'),exportButton=$('exportButton'),addEditButton=$('addEditButton');
function say(text,kind=''){const node=$('status');node.textContent=text;node.className='status-text'+(kind?' '+kind:'')}
function renderEditQueue(){
 const list=$('editList');list.replaceChildren();
 pendingEdits.forEach((edit,index)=>{
  const row=document.createElement('li'),label=document.createElement('span'),remove=document.createElement('button');
  const names={text:'Chữ', 'replace-text':'Thay chữ',image:'Ảnh',highlight:'Tô sáng',rectangle:'Khung',redact:'Redact'};
  const detail=edit.type==='text'||edit.type==='replace-text'?': '+edit.text.slice(0,32):'';
  label.textContent='Trang '+edit.page+' · '+names[edit.type]+detail;label.title=label.textContent;
  remove.type='button';remove.className='secondary-button';remove.dataset.removeEdit=String(index);remove.textContent='Xóa';
  row.append(label,remove);list.append(row);
 });
 $('editQueue').hidden=pendingEdits.length===0;
 $('clearEdits').disabled=pendingEdits.length===0||busy;
 addEditButton.disabled=!file||busy||pendingEdits.length>=MAX_EDITS;
 exportButton.disabled=!file||busy||pendingEdits.length===0;
}
function setControls(){const hasFile=!!file&&!loading;input.disabled=busy||loading;$('previous').disabled=!hasFile||busy||pageNumber<=1;$('next').disabled=!hasFile||busy||pageNumber>=pageCount;$('pageNumber').disabled=!hasFile||busy;$('pageNumber').max=String(pageCount||1);$('pageNumber').value=String(pageNumber);$('pageCount').textContent=pageCount?String(pageCount):'—';$('textControls').hidden=!['text','replace-text'].includes(toolSelect.value);$('imageControls').hidden=toolSelect.value!=='image';$('redactNotice').hidden=toolSelect.value!=='redact';$('replaceNotice').hidden=toolSelect.value!=='replace-text';renderEditQueue()}
function clearPreview(){pageCanvas.hidden=overlay.hidden=true;$('emptyPrompt').hidden=false;pageCanvas.width=pageCanvas.height=overlay.width=overlay.height=1;viewport=null}
async function readFile(next){
 if(!next)return;
 if(!/\.pdf$/i.test(next.name)||!next.size||next.size>MAX_BYTES){say('Chọn PDF có dung lượng từ 1 byte đến 100 MB.','error');input.value='';return}
 loading=true;setControls();say('Đang mở tài liệu…');
 try{
  if(pdfjsDoc)await pdfjsDoc.destroy();
  sourceBytes=new Uint8Array(await next.arrayBuffer());
  pdfLibDoc=await PDFLib.PDFDocument.load(sourceBytes,{ignoreEncryption:false,updateMetadata:false});
  pageCount=pdfLibDoc.getPageCount();if(!pageCount||pageCount>MAX_PAGES)throw Error('Giới hạn Editor là 1–500 trang.');
  pdfjsDoc=await pdfjsLib.getDocument({data:new Uint8Array(sourceBytes),cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/'}).promise;
  file=next;pageNumber=1;selectedText=null;pendingEdits=[];draftVisible=true;image=null;$('imageInput').value='';$('fileName').textContent=next.name;$('emptyPrompt').hidden=true;
  await renderPage();say('Đã mở '+next.name+' · '+pageCount+' trang. Thêm từng chỉnh sửa vào danh sách rồi xuất một bản PDF hoàn chỉnh.');
 }catch(error){file=null;sourceBytes=null;pdfLibDoc=null;pageCount=0;pageNumber=1;selectedText=null;pendingEdits=[];clearPreview();say('Không mở được PDF: '+(error?.message||error),'error')}
 finally{loading=false;setControls()}
}
async function renderPage(){if(!pdfjsDoc)return;const pdfPage=await pdfjsDoc.getPage(pageNumber),initial=pdfPage.getViewport({scale:1}),available=Math.max(320,$('canvasStage').parentElement.clientWidth-36),scale=Math.min(1.6,available/initial.width),dpr=Math.min(2,window.devicePixelRatio||1);viewport=pdfPage.getViewport({scale});for(const canvas of [pageCanvas,overlay]){canvas.width=Math.ceil(viewport.width*dpr);canvas.height=Math.ceil(viewport.height*dpr);canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`}stage.style.width=`${viewport.width}px`;stage.style.minWidth='0';stage.style.minHeight='0';pageCanvas.hidden=overlay.hidden=false;$('emptyPrompt').hidden=true;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,pageCanvas.width,pageCanvas.height);await pdfPage.render({canvasContext:ctx,viewport,transform:[dpr,0,0,dpr,0,0],background:'#ffffff'}).promise;drawOverlay()}
function pagePoint(event){const rect=overlay.getBoundingClientRect(),cx=(event.clientX-rect.left)*viewport.width/rect.width,cy=(event.clientY-rect.top)*viewport.height/rect.height,[x,y]=viewport.convertToPdfPoint(cx,cy);return{x,y,cx,cy}}
async function selectTextAt(point){if(!pdfjsDoc||!viewport)return;const page=await pdfjsDoc.getPage(pageNumber),content=await page.getTextContent(),candidates=[];for(const item of content.items){if(!item.str?.trim()||!item.transform)continue;const tr=item.transform;if(Math.abs(tr[1])>.01||Math.abs(tr[2])>.01)continue;const height=Math.max(6,Math.abs(tr[3])||12),x=tr[4],y=tr[5]-height*.25,w=Math.max(2,item.width||height*.3),h=height*1.25,[x1,y1]=viewport.convertToViewportPoint(x,y+h),[x2,y2]=viewport.convertToViewportPoint(x+w,y),left=Math.min(x1,x2),right=Math.max(x1,x2),top=Math.min(y1,y2),bottom=Math.max(y1,y2),dx=Math.max(left-point.cx,0,point.cx-right),dy=Math.max(top-point.cy,0,point.cy-bottom),distance=Math.hypot(dx,dy);if(distance<=16)candidates.push({item,x,y,w,h,height,baseline:tr[5],distance})}candidates.sort((a,b)=>a.distance-b.distance);if(!candidates.length){selectedText=null;say('Không thấy chữ chọn được tại vị trí đó. Bấm trực tiếp lên một dòng chữ PDF.','error');redrawBox();return}const hit=candidates[0];selectedText={x:hit.x,y:hit.y,w:hit.w,h:hit.h,height:hit.height,baseline:hit.baseline,text:hit.item.str,page:pageNumber};$('textValue').value=hit.item.str;setCoord('coordX',hit.x);setCoord('coordY',hit.y);setCoord('coordWidth',hit.w);setCoord('coordHeight',hit.h);$('fontSize').value=String(Math.max(6,Math.min(120,Math.round(hit.height))));say(`Đã chọn chữ “${hit.item.str.slice(0,48)}”. Nhập nội dung thay thế rồi xuất PDF.`);redrawBox()}
function setCoord(id,value){$(id).value=String(Math.round(value*100)/100)}
function paintEdit(edit,queued=false){
 if(!viewport)return;
 const[ax,ay]=viewport.convertToViewportPoint(edit.x,edit.y+edit.h),[bx,by]=viewport.convertToViewportPoint(edit.x+edit.w,edit.y);
 const left=Math.min(ax,bx),top=Math.min(ay,by),width=Math.max(1,Math.abs(bx-ax)),height=Math.max(1,Math.abs(by-ay));
 overlayCtx.save();overlayCtx.lineWidth=1.5;
 if(edit.type==='replace-text'&&edit.selection){
  const[a,b]=viewport.convertToViewportPoint(edit.selection.x,edit.selection.y),[c,d]=viewport.convertToViewportPoint(edit.selection.x+edit.selection.w,edit.selection.y+edit.selection.h);
  overlayCtx.fillStyle=queued?'rgba(255,255,255,.94)':'rgba(255,255,255,.88)';overlayCtx.fillRect(Math.min(a,c),Math.min(b,d),Math.abs(c-a),Math.abs(d-b));
  overlayCtx.strokeStyle='#1473e6';overlayCtx.strokeRect(Math.min(a,c),Math.min(b,d),Math.abs(c-a),Math.abs(d-b));
  overlayCtx.fillStyle=edit.textColor;overlayCtx.font=Math.max(6,Number(edit.fontSize)||18)*viewport.scale+'px "'+edit.fontFamily+'", sans-serif';overlayCtx.textBaseline='alphabetic';
  overlayCtx.fillText(edit.text,a,viewport.convertToViewportPoint(edit.selection.x,edit.selection.baseline)[1]);
 }else if(edit.type==='text'){
  overlayCtx.fillStyle=edit.textColor;overlayCtx.font=Math.max(6,Number(edit.fontSize)||18)*viewport.scale+'px "'+edit.fontFamily+'", sans-serif';overlayCtx.textBaseline='alphabetic';
  overlayCtx.fillText(edit.text,...viewport.convertToViewportPoint(edit.x,edit.y));
 }else if(edit.type==='redact'){
  overlayCtx.fillStyle=queued?'rgba(0,0,0,.78)':'rgba(0,0,0,.95)';overlayCtx.strokeStyle='#111';overlayCtx.fillRect(left,top,width,height);overlayCtx.strokeRect(left,top,width,height);
 }else if(edit.type==='highlight'){
  overlayCtx.fillStyle='rgba(255,224,32,.38)';overlayCtx.strokeStyle='#d3a900';overlayCtx.fillRect(left,top,width,height);overlayCtx.strokeRect(left,top,width,height);
 }else if(edit.type==='image'){
  overlayCtx.fillStyle='rgba(35,108,205,.10)';overlayCtx.strokeStyle='#246fbe';overlayCtx.setLineDash([5,3]);overlayCtx.fillRect(left,top,width,height);overlayCtx.strokeRect(left,top,width,height);overlayCtx.setLineDash([]);overlayCtx.fillStyle='#246fbe';overlayCtx.font='11px sans-serif';overlayCtx.fillText('Ảnh',left+5,top+14);
 }else{
  overlayCtx.strokeStyle='#246fbe';overlayCtx.strokeRect(left,top,width,height);
 }
 overlayCtx.restore();
}
function redrawBox(){
 overlayCtx.setTransform(1,0,0,1,0,0);overlayCtx.clearRect(0,0,overlay.width,overlay.height);if(!viewport)return;
 const dpr=overlay.width/viewport.width;overlayCtx.setTransform(dpr,0,0,dpr,0,0);
 for(const edit of pendingEdits)if(edit.page===pageNumber)paintEdit(edit,true);
 if(!draftVisible)return;
 const draft={type:toolSelect.value,page:pageNumber,x:Number($('coordX').value)||0,y:Number($('coordY').value)||0,w:Math.max(1,Number($('coordWidth').value)||1),h:Math.max(1,Number($('coordHeight').value)||1),text:$('textValue').value||'Text',fontFamily:$('fontFamily').value,fontSize:Number($('fontSize').value)||18,textColor:$('textColor').value,selection:selectedText};
 if(draft.type==='replace-text'&&!selectedText)return;
 paintEdit(draft,false);
}
function drawOverlay(){redrawBox()}
function pointerDown(event){if(!file||busy||!viewport)return;event.preventDefault();overlay.setPointerCapture(event.pointerId);draftVisible=true;const p=pagePoint(event);if(toolSelect.value==='replace-text'){selectTextAt(p).catch(error=>say('Không thể chọn chữ: '+error.message,'error'));return}drag={start:p,current:p};if(toolSelect.value==='text'){setCoord('coordX',p.x);setCoord('coordY',p.y);redrawBox()}}
function pointerMove(event){if(!drag||!viewport)return;const p=pagePoint(event),a=drag.start;drag.current=p;const x=Math.min(a.x,p.x),y=Math.min(a.y,p.y),width=Math.abs(p.x-a.x),height=Math.abs(p.y-a.y);setCoord('coordX',x);setCoord('coordY',y);if(width>1&&height>1){setCoord('coordWidth',width);setCoord('coordHeight',height)}redrawBox()}
function pointerUp(){drag=null}
async function makeRedacted(bytes,original,edit){
 const page=original.getPage(edit.page-1),{width,height}=page.getSize(),{x,y,w,h}=edit;
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw Error('Vị trí và kích thước vùng redact không hợp lệ.');
 const left=Math.max(0,Math.min(width,x)),bottom=Math.max(0,Math.min(height,y)),right=Math.max(left,Math.min(width,x+w)),top=Math.max(bottom,Math.min(height,y+h));
 if(right<=left||top<=bottom)throw Error('Vùng redact nằm ngoài trang.');
 page.drawRectangle({x:left,y:bottom,width:right-left,height:top-bottom,color:PDFLib.rgb(0,0,0),opacity:1});
 const marked=await original.save({useObjectStreams:true}),task=pdfjsLib.getDocument({data:marked});
 try{
  const rendered=await task.promise,target=await rendered.getPage(edit.page),scale=REDACT_DPI/72,renderViewport=target.getViewport({scale}),pixelWidth=Math.ceil(renderViewport.width),pixelHeight=Math.ceil(renderViewport.height);
  if(pixelWidth*pixelHeight>MAX_PIXELS)throw Error('Trang vượt giới hạn 25 triệu pixel ở 150 DPI.');
  say('Đang xử lý redact an toàn trang '+edit.page+' ở 150 DPI…');
  const canvas=document.createElement('canvas');canvas.width=pixelWidth;canvas.height=pixelHeight;const c=canvas.getContext('2d');if(!c)throw Error('Canvas 2D không khả dụng.');
  await target.render({canvasContext:c,viewport:renderViewport,background:'#fff'}).promise;
  const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Không tạo được ảnh redact.')),'image/png'));
  const fresh=await PDFLib.PDFDocument.create();
  for(let i=0;i<original.getPageCount();i++){
   if(i===edit.page-1){const img=await fresh.embedPng(await png.arrayBuffer()),wpt=renderViewport.width/scale,hpt=renderViewport.height/scale,p=fresh.addPage([wpt,hpt]);p.drawImage(img,{x:0,y:0,width:wpt,height:hpt})}
   else{const[copy]=await fresh.copyPages(original,[i]);fresh.addPage(copy)}
  }
  canvas.width=canvas.height=1;return await fresh.save({useObjectStreams:true});
 }finally{await task.destroy()}
}
async function makeTextReplacement(bytes,original,edit){
 const selected=edit.selection;if(!selected||selected.page!==edit.page)throw Error('Bấm vào chữ cần sửa trên trang hiện tại trước khi thêm chỉnh sửa.');
 if(!edit.text.trim())throw Error('Nội dung thay thế không được để trống.');
 const task=pdfjsLib.getDocument({data:new Uint8Array(bytes)});
 try{
  const rendered=await task.promise,target=await rendered.getPage(edit.page);
  if(target.rotate%360)throw Error('Chưa hỗ trợ sửa chữ trên trang bị xoay. Hãy dùng Xoay trang trước.');
  const scale=200/72,renderViewport=target.getViewport({scale}),pixelWidth=Math.ceil(renderViewport.width),pixelHeight=Math.ceil(renderViewport.height);
  if(pixelWidth*pixelHeight>MAX_PIXELS)throw Error('Trang vượt giới hạn 25 triệu pixel ở 200 DPI.');
  say('Đang sửa chữ và kết xuất trang '+edit.page+' ở 200 DPI…');
  const canvas=document.createElement('canvas');canvas.width=pixelWidth;canvas.height=pixelHeight;const c=canvas.getContext('2d');if(!c)throw Error('Canvas 2D không khả dụng.');
  await target.render({canvasContext:c,viewport:renderViewport,background:'#fff'}).promise;
  const pad=2,[x1,y1]=renderViewport.convertToViewportPoint(selected.x-pad,selected.y-pad),[x2,y2]=renderViewport.convertToViewportPoint(selected.x+selected.w+pad,selected.y+selected.h+pad);
  c.fillStyle='#fff';c.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));
  const[tx,ty]=renderViewport.convertToViewportPoint(selected.x,selected.baseline),fontSize=Math.max(6,Math.min(120,Number(edit.fontSize)||18));
  c.fillStyle=edit.textColor;c.font=fontSize*scale+'px "'+edit.fontFamily+'", sans-serif';c.textBaseline='alphabetic';c.fillText(edit.text,tx,ty);
  const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Không tạo được ảnh trang đã sửa.')),'image/png'));
  const fresh=await PDFLib.PDFDocument.create();
  for(let i=0;i<original.getPageCount();i++){
   if(i===edit.page-1){const img=await fresh.embedPng(await png.arrayBuffer()),wpt=renderViewport.width/scale,hpt=renderViewport.height/scale,p=fresh.addPage([wpt,hpt]);p.drawImage(img,{x:0,y:0,width:wpt,height:hpt})}
   else{const[copy]=await fresh.copyPages(original,[i]);fresh.addPage(copy)}
  }
  canvas.width=canvas.height=1;return await fresh.save({useObjectStreams:true});
 }finally{await task.destroy()}
}
function color(value){const m=/^#([0-9a-f]{6})$/i.exec(value);return m?PDFLib.rgb(parseInt(m[1].slice(0,2),16)/255,parseInt(m[1].slice(2,4),16)/255,parseInt(m[1].slice(4,6),16)/255):PDFLib.rgb(.1,.16,.24)}
async function captureEdit(){
 if(!file||busy)return;
 if(pendingEdits.length>=MAX_EDITS){say('Có thể xếp tối đa '+MAX_EDITS+' chỉnh sửa cho một bản PDF.','error');return}
 const type=toolSelect.value,x=Number($('coordX').value),y=Number($('coordY').value),w=Number($('coordWidth').value),h=Number($('coordHeight').value);
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0){say('Vị trí hoặc kích thước không hợp lệ.','error');return}
 const edit={type,page:pageNumber,x,y,w,h};
 if(type==='text'||type==='replace-text'){
  edit.text=$('textValue').value;edit.fontFamily=$('fontFamily').value;edit.fontSize=Math.max(6,Math.min(120,Number($('fontSize').value)||18));edit.textColor=$('textColor').value;
  if(!edit.text.trim()){say('Nhập nội dung chữ cần chèn.','error');return}
  if(type==='replace-text'){if(!selectedText||selectedText.page!==pageNumber){say('Bấm vào chữ cần sửa trên trang hiện tại trước.','error');return}edit.selection={...selectedText}}
 }
 if(type==='image'){
  if(!image){say('Chọn ảnh PNG hoặc JPG.','error');return}
  if(image.size>MAX_IMAGE_BYTES){say('Ảnh phải nhỏ hơn 20 MB.','error');return}
  const queuedImageBytes=pendingEdits.reduce((sum,item)=>sum+(item.imageBytes?.byteLength||0),0);if(queuedImageBytes+image.size>MAX_QUEUED_IMAGE_BYTES){say('Tổng dung lượng ảnh đang xếp không được vượt quá 100 MB.','error');return}
  if(!['image/png','image/jpeg'].includes(image.type)&&!(/\.png$/i.test(image.name)||/\.jpe?g$/i.test(image.name))){say('Chỉ hỗ trợ ảnh PNG hoặc JPG.','error');return}
  edit.imageBytes=new Uint8Array(await image.arrayBuffer());edit.imageType=image.type==='image/png'||/\.png$/i.test(image.name)?'image/png':'image/jpeg';
 }
 pendingEdits.push(edit);draftVisible=false;renderEditQueue();redrawBox();say('Đã thêm chỉnh sửa trang '+pageNumber+'. Bạn có thể xếp thêm mục khác hoặc xuất PDF.','success');
}
async function applyVectorEdit(bytes,edit){
 const doc=await PDFLib.PDFDocument.load(new Uint8Array(bytes),{ignoreEncryption:false,updateMetadata:false});
 if(edit.page<1||edit.page>doc.getPageCount())throw Error('Số trang chỉnh sửa không hợp lệ.');
 const page=doc.getPage(edit.page-1),{x,y,w,h}=edit;
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw Error('Vị trí hoặc kích thước không hợp lệ.');
 if(edit.type==='text'){
  const family={Arial:PDFLib.StandardFonts.Helvetica,'Segoe UI':PDFLib.StandardFonts.Helvetica,'Times New Roman':PDFLib.StandardFonts.TimesRoman,'Courier New':PDFLib.StandardFonts.Courier}[edit.fontFamily]||PDFLib.StandardFonts.Helvetica,font=await doc.embedFont(family);
  page.drawText(edit.text,{x,y,size:edit.fontSize,font,color:color(edit.textColor),maxWidth:Math.max(1,page.getWidth()-x)});
 }else if(edit.type==='highlight')page.drawRectangle({x,y,width:w,height:h,color:PDFLib.rgb(1,.88,.15),opacity:.35});
 else if(edit.type==='rectangle')page.drawRectangle({x,y,width:w,height:h,borderColor:PDFLib.rgb(.14,.42,.82),borderWidth:2,opacity:0});
 else if(edit.type==='image'){
  const embedded=edit.imageType==='image/png'?await doc.embedPng(edit.imageBytes):await doc.embedJpg(edit.imageBytes);
  page.drawImage(embedded,{x,y,width:w,height:h});
 }else throw Error('Loại chỉnh sửa không được hỗ trợ: '+edit.type);
 return await doc.save({useObjectStreams:true});
}
async function exportEdited(){
 if(!file||busy||!pendingEdits.length)return;
 busy=true;setControls();const edits=pendingEdits.map(edit=>({...edit}));say('Đang áp dụng '+edits.length+' chỉnh sửa…');
 try{
  let result=new Uint8Array(sourceBytes);
  for(let i=0;i<edits.length;i++){
   const edit=edits[i],doc=await PDFLib.PDFDocument.load(new Uint8Array(result),{ignoreEncryption:false,updateMetadata:false});
   if(edit.page<1||edit.page>doc.getPageCount())throw Error('Số trang chỉnh sửa không hợp lệ.');
   say('Đang áp dụng chỉnh sửa '+(i+1)+'/'+edits.length+' · trang '+edit.page+'…');
   if(edit.type==='replace-text')result=await makeTextReplacement(result,doc,edit);
   else if(edit.type==='redact')result=await makeRedacted(result,doc,edit);
   else result=await applyVectorEdit(result,edit);
  }
  const blob=new Blob([result],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=window.SOLYAN_OUTPUT_NAME?window.SOLYAN_OUTPUT_NAME(file.name,'edited'):'edited.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  say('Đã tạo PDF với '+edits.length+' chỉnh sửa. Tệp nguồn không bị thay đổi.','success');
 }catch(error){say('Không chỉnh sửa được PDF: '+(error?.message||error),'error')}
 finally{busy=false;setControls()}
}
input.addEventListener('change',()=>readFile(input.files?.[0]));$('previous').addEventListener('click',async()=>{if(pageNumber<=1)return;pageNumber--;setControls();await renderPage()});$('next').addEventListener('click',async()=>{if(pageNumber>=pageCount)return;pageNumber++;setControls();await renderPage()});$('pageNumber').addEventListener('change',async()=>{const next=Math.max(1,Math.min(pageCount,Number($('pageNumber').value)||1));pageNumber=next;setControls();await renderPage()});$('previous').addEventListener('click',()=>{selectedText=null},{capture:true});$('next').addEventListener('click',()=>{selectedText=null},{capture:true});$('pageNumber').addEventListener('change',()=>{selectedText=null},{capture:true});input.addEventListener('change',()=>{selectedText=null},{capture:true});toolSelect.addEventListener('change',()=>{draftVisible=true;redrawBox();setControls()});for(const id of ['textValue','fontFamily','fontSize','textColor','coordX','coordY','coordWidth','coordHeight'])$(id).addEventListener('input',()=>{draftVisible=true;redrawBox()});$('imageInput').addEventListener('change',()=>{image=$('imageInput').files?.[0]||null});overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',pointerMove);overlay.addEventListener('pointerup',pointerUp);overlay.addEventListener('pointercancel',pointerUp);$('addEditButton').addEventListener('click',()=>captureEdit().catch(error=>say('Không thể thêm chỉnh sửa: '+(error?.message||error),'error')));$('clearEdits').addEventListener('click',()=>{pendingEdits=[];renderEditQueue();redrawBox();say('Đã xóa toàn bộ chỉnh sửa đang xếp.')});$('editList').addEventListener('click',event=>{const button=event.target.closest('[data-remove-edit]');if(!button)return;pendingEdits.splice(Number(button.dataset.removeEdit),1);renderEditQueue();redrawBox()});exportButton.addEventListener('click',exportEdited);window.addEventListener('resize',()=>{if(pdfjsDoc&&!loading)renderPage().catch(error=>say('Không thể hiển thị trang: '+error.message,'error'))});setControls();clearPreview();
})();
