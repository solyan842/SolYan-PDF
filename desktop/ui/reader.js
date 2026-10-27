import {linkifyText,installLinkGuard} from './reader-link-guard.js';
import { installR2 } from './reader-r2.js';
import { connectNativeReader } from './reader-native.js';
import { installLanguage,t,getLanguage } from './reader-language.js';
import { installReaderActions } from './reader-actions.js';
import { installDefaultPdfPrompt } from './reader-default-app.js';
import { installReaderSession } from './reader-session.js';
const $ = id => document.getElementById(id), Q = window.QuickSign;
installLinkGuard({message:text=>document.getElementById('status').textContent=text});
const documents = new Map();
let active = null, selected = null, asset = null, busy = false, drawing = false, inked = false;
let pdfjs=null,pdfRuntimePromise=null,pdfLibPromise=null;
function ensurePdfRuntime(){
  if(pdfjs)return pdfRuntimePromise;
  if(!pdfRuntimePromise)pdfRuntimePromise=import('./vendor/pdfjs/build/pdf.mjs').then(async engine=>{
    // PDF.js viewer modules read pdfjsLib from globalThis during evaluation.
    // Publish the engine before importing the viewer to keep the lazy startup safe.
    pdfjs=engine;globalThis.pdfjsLib=engine;engine.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/build/pdf.worker.mjs';
    const viewer=await import('./vendor/pdfjs/web/pdf_viewer.mjs');
    return {pdfjs:engine,...viewer};
  }).catch(error=>{pdfRuntimePromise=null;throw error;});
  return pdfRuntimePromise;
}
function ensurePdfLib(){
  if(window.PDFLib)return Promise.resolve(window.PDFLib);
  if(!pdfLibPromise)pdfLibPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='./vendor/pdf-lib.min.js';script.onload=()=>resolve(window.PDFLib);script.onerror=()=>{pdfLibPromise=null;reject(Error('Không tải được thư viện lưu PDF.'));};document.head.append(script);
  });
  return pdfLibPromise;
}
async function readSourceBytes(doc){
  if(!doc.sourceBytes)doc.sourceBytes=new Uint8Array(await doc.sourceFile.arrayBuffer());
  return doc.sourceBytes;
}
const message = text => { $('status').textContent = text; };
const attempt = fn => async (...args) => { try { await fn(...args); } catch (e) { message(`Không thể thực hiện: ${typeof e === 'string' ? e : e.message}`); } };
// Disable WebView2's generic right-click menu ("Save as..." on PDF page
// graphics does not save the document). Keep native edit menus on text inputs;
// PDF Save As remains the toolbar command and Ctrl+Shift+S.
document.addEventListener('contextmenu', event=>{
  if(!event.target.closest('input,textarea,[contenteditable="true"]'))event.preventDefault();
}, {capture:true});
const current = () => documents.get(active);
function syncView(doc){
  if(doc.id!==active)return;
  const range=$('zoomRange');if(range)range.value=Math.round(doc.view.currentScale*100);
  const value=doc.view.currentScaleValue;if(value){const select=$('zoom');if(![...select.options].some(o=>o.value===String(value))){let o=select.querySelector('[data-live]');if(!o){o=document.createElement('option');o.dataset.live='true';select.append(o);}o.value=String(value);o.textContent=Math.round(doc.view.currentScale*100)+'%';}select.value=String(value);}
  for(const [id,on]of [['singlePage',doc.view.scrollMode===3],['twoPage',doc.view.spreadMode!==0],['continuous',doc.view.scrollMode===0&&doc.view.spreadMode===0]])$(id)?.setAttribute('aria-pressed',String(on));
}
let r2, session;
const checkpoint = doc => r2?.checkpoint(doc);
function changed(doc) { if (!doc.dirty) { doc.dirty = true; renderTabs(); } }
function renderTabs() {
  $('tabs').replaceChildren();
  for (const doc of documents.values()) {
    const tab = document.createElement('div'); tab.className = `tab${doc.id === active ? ' active' : ''}`;
    const title = document.createElement('button'); title.className = 'title'; title.textContent = `${doc.dirty ? '● ' : ''}${doc.name}`; title.title = doc.name; title.onclick = () => activate(doc.id);
    const close = document.createElement('button'); close.className = 'close'; close.textContent = '×'; close.setAttribute('aria-label', `Đóng ${doc.name}`);
    close.onclick = attempt(async () => {
      if (busy || (doc.dirty && !confirm(t('Đóng tài liệu và bỏ chữ ký chưa lưu?')))) return;
      if (active === doc.id) { selected = null; active = null; }
      r2?.flushBookmark(doc); doc.thumbnails?.disconnect(); doc.r2Abort?.abort(); clearTimeout(doc.bookmarkTimer); doc.view.setDocument(null); doc.container.remove(); documents.delete(doc.id); await doc.pdf.loadingTask.destroy();
      if (!active && documents.size) activate(documents.keys().next().value);
      else if (!documents.size) { $('welcome').hidden = false; $('thumbs').replaceChildren(); $('outline').replaceChildren(); document.getElementById('bookmarks')?.replaceChildren(); $('signOptions').hidden = true; $('save').disabled = true; $('saveCurrent').disabled = true; }
      if(!documents.size&&$('presentation'))$('presentation').disabled=true;
      renderTabs(); session?.touch();
    });
    tab.append(title, close); $('tabs').append(tab);
  }
}
async function openFile(file, source = null, nativeName = null, runtimeReady = null) {
  const nativeBytes=file instanceof ArrayBuffer||ArrayBuffer.isView(file);
  const name=nativeBytes?(nativeName||'document.pdf'):file.name;
  const size=nativeBytes?file.byteLength:file.size;
  if (size > 200 * 1024 * 1024) throw Error('Reader R1 giới hạn mỗi PDF ở 200 MB.');
  message(`Đang mở ${name}…`);
  const runtimePromise=runtimeReady||ensurePdfRuntime();
  const bytesPromise=nativeBytes
    ? Promise.resolve(file instanceof Uint8Array?file:new Uint8Array(file))
    : file.arrayBuffer().then(buffer=>new Uint8Array(buffer));
  const [{pdfjs,EventBus,PDFViewer,PDFLinkService,PDFFindController},bytes]=await Promise.all([runtimePromise,bytesPromise]);
  const resources={isEvalSupported:false,enableXfa:false,cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,
    standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',wasmUrl:'./vendor/pdfjs/wasm/'};
  // Keep one untouched source buffer for Save/Print; PDF.js transfers its own buffer to the worker.
  const task=pdfjs.getDocument({...resources,data:nativeBytes?bytes.slice():bytes});
  task.onPassword = (update, reason) => {
    const password = prompt(t(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'Mật khẩu chưa đúng. Nhập lại:' : 'Mật khẩu PDF:'));
    if (password === null) { task.destroy(); message('Đã hủy mở PDF.'); } else update(password);
  };
  const pdf = await task.promise;
  const container = document.createElement('div'); container.className = 'readerContainer'; container.tabIndex = 0;
  const viewer = document.createElement('div'); viewer.className = 'pdfViewer'; container.append(viewer); $('documents').append(container);
  const bus = new EventBus(), link = new PDFLinkService({ eventBus: bus, externalLinkEnabled: true }), find = new PDFFindController({ eventBus: bus, linkService: link });
  const view = new PDFViewer({ container, viewer, eventBus: bus, linkService: link, findController: find, annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS, maxCanvasPixels: 12_000_000, enableScripting: false });
  const doc = { id: crypto.randomUUID(), name, source, sourceFile:nativeBytes?null:file, sourceBytes:nativeBytes?bytes:null, pdf, container, view, bus, link, placements: [], dirty: false, selectedId: null, query: '', matches: '' };
  documents.set(doc.id, doc); link.setViewer(view); link.setDocument(pdf); view.setDocument(pdf);
  pdf.annotationStorage.onSetModified=()=>{doc.formDirty=true;changed(doc);};
  r2?.opened(doc);
  bus.on('pagesinit', () => { view.currentScaleValue = 'page-width'; });
  // PDF.js resets custom page children before async raster rendering. Restore
  // overlays against the updated viewports immediately, not only at draw end.
  bus.on('scalechanging', () => { if (doc.id === active) {renderSignatures(doc);syncView(doc);} session?.touch(); });
  for(const event of ['scrollmodechanged','spreadmodechanged'])bus.on(event,()=>syncView(doc));
  bus.on('textlayerrendered',()=>linkifyText(doc.container));
  bus.on('pagerendered', () => { if (doc.id === active) renderSignatures(doc); });
  bus.on('pagechanging', ({ pageNumber }) => { if (doc.id === active) { $('pageNumber').value = pageNumber;for(const b of $('thumbs').children)b.setAttribute('aria-current',String(Number(b.dataset.page)===pageNumber)); } session?.touch(); });
  bus.on('updatefindmatchescount', ({ matchesCount }) => { doc.matches = `${matchesCount.current}/${matchesCount.total}`; if (doc.id === active) $('matches').textContent = doc.matches; });
  session?.opened(doc);
  activate(doc.id); message(`${name} · ${pdf.numPages} trang · Xử lý offline`);
}
function activate(id) {
  active = id; const doc = current(); selected = doc.selectedId;
  for (const other of documents.values()) {
    if(other.id!==id&&!other.container.hidden)session?.deactivated(other);
    other.container.hidden = other.id !== id;
  }
  $('welcome').hidden = true; $('pageCount').textContent = `/ ${doc.pdf.numPages}`; $('pageNumber').max = doc.pdf.numPages; $('pageNumber').value = doc.view.currentPageNumber;
  $('save').disabled = false; $('saveCurrent').disabled = false; $('query').value = doc.query; $('matches').textContent = doc.matches; $('signOptions').hidden = !selected;
  if($('presentation'))$('presentation').disabled=false;
  renderTabs(); doc.view.update(); session?.activated(doc); thumbnails(doc); outline(doc); renderSignatures(doc); r2?.activated(doc);
  syncView(doc);
  document.dispatchEvent(new Event('reader-document-activated'));
  session?.touch();
}
async function thumbnails(doc) {
  doc.thumbnails?.disconnect(); $('thumbs').replaceChildren();
  let queue = Promise.resolve();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      entry.target.dataset.visible=String(entry.isIntersecting);
      if(!entry.isIntersecting){entry.target.querySelector('canvas')?.remove();continue;}
      if(entry.target.dataset.pending==='true'||entry.target.querySelector('canvas'))continue;
      entry.target.dataset.pending='true';
      queue = queue.then(async () => {
        if (current() !== doc || !entry.target.isConnected || entry.target.dataset.visible!=='true') return;
        const page = await doc.pdf.getPage(Number(entry.target.dataset.page));
        const viewport = page.getViewport({ scale: 180 / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (entry.target.isConnected&&entry.target.dataset.visible==='true') entry.target.prepend(canvas);
      }).catch(e => message(`Thumbnail: ${e.message}`)).finally(()=>{entry.target.dataset.pending='false';});
    }
  }, { root: $('sidebar'), rootMargin: '200px' });
  doc.thumbnails = observer;
  for (let i = 1; i <= doc.pdf.numPages; i++) {
    const button = document.createElement('button'); button.className = 'thumbnail'; button.dataset.page = i; button.textContent = `Trang ${i}`;button.setAttribute('aria-current',String(i===doc.view.currentPageNumber));
    button.onclick = () => { doc.view.currentPageNumber = i; }; $('thumbs').append(button); observer.observe(button);
  }
}
async function outline(doc) {
  try {
    const items = await doc.pdf.getOutline(); if (doc !== current()) return; $('outline').replaceChildren();
    const add = (items, depth = 0) => { for (const item of items || []) {
      const button = document.createElement('button'); button.textContent = item.title; button.style.paddingLeft = `${10 + Math.min(depth, 10) * 12}px`;
      button.onclick = attempt(async () => { if (item.dest) await doc.link.goToDestination(item.dest); }); $('outline').append(button); add(item.items, depth + 1);
    } }; add(items);$('outline').dataset.empty=String(!items?.length); if (!items?.length) $('outline').textContent = t('PDF này chưa có mục lục.');
  } catch (e) { message(`Mục lục: ${e.message}`); }
}
function renderSignatures(doc = current()) {
  if (!doc) return;
  doc.container.querySelectorAll('.signatureLayer').forEach(layer => layer.remove());
  for (const item of doc.placements) {
    const page = doc.view.getPageView(item.page); if (!page?.div) continue;
    let layer = page.div.querySelector('.signatureLayer');
    if (!layer) { layer = document.createElement('div'); layer.className = 'signatureLayer'; page.div.append(layer); }
    const node = document.createElement('div'); node.className = `signature${item.id === selected ? ' selected' : ''}`; node.dataset.signature = item.id; node.tabIndex = 0; node.setAttribute('aria-label', `${item.label||'Chữ ký'}: kéo di chuyển hoặc dùng phím mũi tên`);
    const position = () => {
      if(item.viewport){const frame=window.ReaderEdits.frame(item,page.viewport),matrix=new DOMMatrix(frame.transform);node.style.setProperty('--handle-inverse',String(1/Math.max(.001,Math.hypot(matrix.a,matrix.b))));Object.assign(node.style,{left:`${frame.left}px`,top:`${frame.top}px`,width:`${frame.width}px`,height:`${frame.height}px`,transform:frame.transform,transformOrigin:'0 0'});}
      else Object.assign(node.style, { left: `${item.rect.x*100}%`, top: `${item.rect.y*100}%`, width: `${item.rect.w*100}%`, height: `${item.rect.h*100}%` });
    }; position();
    if(item.kind){node.classList.add('annotation');node.dataset.kind=item.kind;node.append(r2.visual(item));}
    else { const img = document.createElement('img'); img.src = item.image; img.alt = item.label||'Chữ ký'; img.draggable = false; node.append(img); }
    for (const handle of ['nw','n','ne','e','se','s','sw','w']) {
      const button = document.createElement('button'); button.className = 'handle'; button.dataset.h = handle; button.setAttribute('aria-label', `Đổi kích thước ${handle}`); button.hidden = item.id !== selected; node.append(button);
    }
    node.onpointerdown = e => {
      if (busy || e.button !== 0) return; e.preventDefault(); e.stopPropagation();
      if(r2?.mode==='erase'){selected=doc.selectedId=item.id;removeSignature();return;}
      checkpoint(doc);
      selected = doc.selectedId = item.id;
      $('signOptions').hidden=['ink','highlight','text'].includes(item.kind);
      r2.selection(item);
      if(item.kind==='text')void r2.editText(doc,item,{focus:false}).catch(error=>message('Không mở được định dạng chữ: '+String(error?.message||error)));
      doc.container.querySelectorAll('.signature').forEach(el => { el.classList.toggle('selected', el === node); el.querySelectorAll('.handle').forEach(h => h.hidden = el !== node); });
      const start = { ...item.rect }, x = e.clientX, y = e.clientY, bounds = layer.getBoundingClientRect(), handle = e.target.dataset.h;
      node.setPointerCapture(e.pointerId);
      node.onpointermove = move => {
        let dx = (move.clientX-x)/bounds.width, dy = (move.clientY-y)/bounds.height;
        if(item.viewport){const A=window.ReaderEdits;const p0=A.project(item.viewport,A.point(page.viewport,x-bounds.left,y-bounds.top));const p1=A.project(item.viewport,A.point(page.viewport,move.clientX-bounds.left,move.clientY-bounds.top));dx=(p1[0]-p0[0])/item.viewport.width;dy=(p1[1]-p0[1])/item.viewport.height;}
        item.rect = handle ? Q.resize(start, handle, dx, dy) : Q.move(start, dx, dy); position(); changed(doc);
      };
      const end = () => { node.onpointermove = null; node.onpointerup = null; node.onpointercancel = null; node.onlostpointercapture = null; };
      node.onpointerup = end; node.onpointercancel = end; node.onlostpointercapture = end;
    };
    node.onkeydown = e => {
      if (e.key === 'Delete') { e.preventDefault();selected = doc.selectedId = item.id; removeSignature(); return; }
      const delta = { ArrowLeft: [-.002,0], ArrowRight: [.002,0], ArrowUp: [0,-.002], ArrowDown: [0,.002] }[e.key];
      if (delta) { e.preventDefault(); checkpoint(doc);item.rect = Q.move(item.rect, ...delta); position(); changed(doc); }
    };
    layer.append(node);
    if(item.kind==='text')node.ondblclick=e=>{e.preventDefault();e.stopPropagation();r2.editText(doc,item);};
  }
}
function removeSignature() { const doc = current(); if (!doc || busy) return; checkpoint(doc);doc.placements = doc.placements.filter(p => p.id !== selected); selected = doc.selectedId = null; $('signOptions').hidden = true; changed(doc); renderSignatures(); }
const ink = $('ink'), ctx = ink.getContext('2d');
function clearInk() { ctx.clearRect(0,0,ink.width,ink.height); inked = false; }
function inkPoint(e) { const r = ink.getBoundingClientRect(); return [(e.clientX-r.left)*ink.width/r.width, (e.clientY-r.top)*ink.height/r.height]; }
ink.onpointerdown = e => { drawing = true; inked = true; ink.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...inkPoint(e)); };
ink.onpointermove = e => { if (!drawing) return; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#122c50'; ctx.lineTo(...inkPoint(e)); ctx.stroke(); };
ink.onpointerup = ink.onpointercancel = () => { drawing = false; };
$('open').onclick = attempt(async () => {
  if(window.__TAURI__?.event) await window.__TAURI__.core.invoke('reader_choose_files',{language:getLanguage()});
  else $('pdfFiles').click();
});
$('pdfFiles').onchange = attempt(async e => { for (const file of e.target.files) await openFile(file); e.target.value = ''; });
$('sign').onclick = () => { if (!current() || busy) { message('Mở PDF trước khi ký.'); return; } clearInk(); $('signatureDialog').showModal(); };
$('clearInk').onclick = clearInk;
$('typeName').onclick = () => { clearInk(); ctx.fillStyle = '#122c50'; ctx.font = 'italic 70px cursive'; ctx.fillText($('signatureName').value, 20, 140, 680); inked = Boolean($('signatureName').value.trim()); };
$('imageSign').onclick = () => $('signatureFile').click();
$('signatureFile').onchange = attempt(async e => {
  const file = e.target.files[0]; if (!file) return; if (file.size > 10*1024*1024) throw Error('Ảnh chữ ký tối đa 10 MB.');
  $('useSign').disabled = true;
  try {
    const bitmap = await createImageBitmap(file); clearInk();
    const ratio = Math.min(ink.width/bitmap.width, ink.height/bitmap.height); ctx.drawImage(bitmap, 0, 0, bitmap.width*ratio, bitmap.height*ratio); bitmap.close(); inked = true; e.target.value = '';
  } finally { $('useSign').disabled = false; }
});
function croppedInk() {
  const pixels = ctx.getImageData(0,0,ink.width,ink.height); let x0=ink.width,y0=ink.height,x1=-1,y1=-1;
  for(let y=0;y<ink.height;y++) for(let x=0;x<ink.width;x++) if(pixels.data[(y*ink.width+x)*4+3]>0) { x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y); }
  if(x1<x0) throw Error('Vẽ, nhập tên hoặc chọn ảnh chữ ký.');
  const canvas=document.createElement('canvas'); canvas.width=x1-x0+1;canvas.height=y1-y0+1;canvas.getContext('2d').drawImage(ink,x0,y0,canvas.width,canvas.height,0,0,canvas.width,canvas.height);return canvas;
}
async function placeAsset(image,options={}) {
  const doc=current();if(!doc||busy)throw Error('Mở PDF trước khi ký.');
  const canvas=new Image();canvas.src=image;await canvas.decode();asset=image; const pageIndex=doc.view.currentPageNumber-1;
  const sourcePage=await doc.pdf.getPage(pageIndex+1);const viewport=sourcePage.getViewport({scale:1,rotation:(sourcePage.rotate+doc.view.pagesRotation)%360});
  const w=options.width??.24,h=Math.min(.2,w*viewport.width/viewport.height*canvas.height/canvas.width);
  const item={id:crypto.randomUUID(),group:crypto.randomUUID(),page:pageIndex,image:asset,role:options.role||'signature',label:options.label||'Chữ ký',viewport:{width:viewport.width,height:viewport.height,transform:viewport.transform,rotation:viewport.rotation},rect:{x:.38,y:.7,w,h}};
  checkpoint(doc);doc.placements.push(item);selected=doc.selectedId=item.id;r2.selection(item); changed(doc);$('signOptions').hidden=false; renderSignatures();
}
$('useSign').onclick=attempt(async()=>{
 if(!inked)throw Error('Chữ ký đang trống.');
 const image=croppedInk().toDataURL('image/png');await placeAsset(image);$('signatureDialog').close();
 try{r2.rememberSignature(image);message('Đã lưu chữ ký trên máy để dùng lại cho PDF khác.');}
 catch(error){message('Đã đặt chữ ký, nhưng chưa lưu vào thư viện: '+error.message);}
});
$('apply').onclick = attempt(async () => {
  const doc=current(); if(!doc||busy)return; const item=doc.placements.find(p=>p.id===selected);if(!item)throw Error('Chọn chữ ký mẫu.');
  if(item.kind)throw Error('Chọn chữ ký hình ảnh để áp dụng nhiều trang.');
  const indexes=Q.pages($('applyScope').value==='range'?$('range').value:$('applyScope').value,doc.pdf.numPages,doc.view.currentPageNumber-1);
  const source=item.viewport||(await doc.pdf.getPage(item.page+1)).getViewport({scale:1});
  const replacements=[];
  for(const page of indexes) {const p=await doc.pdf.getPage(page+1);const target=p.getViewport({scale:1,rotation:(p.rotate+doc.view.pagesRotation)%360});replacements.push({...item,id:crypto.randomUUID(),page,viewport:{width:target.width,height:target.height,transform:target.transform,rotation:target.rotation},rect:Q.copyRect(item.rect,source,target)});}
  checkpoint(doc);doc.placements=doc.placements.filter(p=>p.group!==item.group).concat(replacements);selected=doc.selectedId=replacements[0]?.id;changed(doc);renderSignatures();message(`Đã áp dụng trên ${indexes.length} trang; lưu thành PDF mới để hoàn tất.`);
});
$('removeSign').onclick=removeSignature;
async function saveDocument(saveAs){
  const doc=current(); if(!doc||busy)return;busy=true;$('save').disabled=true;$('saveCurrent').disabled=true;
  try {
    const bytes=await r2.exportDocument(doc);
    const suffix=doc.placements.some(p=>p.role==='fill')&&!doc.placements.some(p=>!p.kind&&p.role!=='fill')?'-da-dien.pdf':'-da-ky.pdf';
     const name=doc.name.replace(/\.pdf$/i,'')+suffix;
    if(window.__TAURI__?.core){
      const command=!saveAs&&doc.outputSaved?'reader_save':'reader_save_as';
      const path=await window.__TAURI__.core.invoke(command,{bytes:Array.from(bytes),name,document:doc.id,language:getLanguage()});
      if(path){doc.outputSaved=true;doc.dirty=false;r2.saved(doc);renderTabs();message(`Đã lưu bản PDF mới: ${path}`);}else message('Đã hủy lưu. Chữ ký vẫn ở bản làm việc.');
      return;
    }
    const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    // Keep the source and unsaved marker: a download request cannot prove that
    // the user completed the native Save As dialog.
    message('Đã tạo bản PDF mới để Lưu thành. PDF nguồn không thay đổi.');
  } finally {busy=false;$('save').disabled=false;$('saveCurrent').disabled=false;}
}
$('save').onclick=attempt(()=>saveDocument(true));
$('saveCurrent').onclick=attempt(()=>saveDocument(false));
function find(back=false){const doc=current();if(doc){doc.query=$('query').value;doc.bus.dispatch('find',{source:window,type:'again',query:doc.query,phraseSearch:true,caseSensitive:false,entireWord:false,highlightAll:true,findPrevious:back});}}
$('query').onkeydown=e=>{if(e.key==='Enter')find(e.shiftKey);};$('findNext').onclick=()=>find();$('findPrevious').onclick=()=>find(true);
$('previous').onclick=()=>{if(current())current().view.currentPageNumber=Math.max(1,current().view.currentPageNumber-1);};
$('next').onclick=()=>{if(current())current().view.currentPageNumber=Math.min(current().pdf.numPages,current().view.currentPageNumber+1);};
$('pageNumber').onchange=()=>{
  const d=current();if(!d)return;
  const requested=Math.max(1,Math.min(d.pdf.numPages,Number($('pageNumber').value)||1));
  d.view.currentPageNumber=requested;
  // Numeric page jumps must settle PDF.js's viewport before zoom uses the
  // old scroll state to infer page 1 in installed Windows WebView2.
  d.view.scrollPageIntoView({pageNumber:requested});
};
function captureZoomCenter(d){
  const bounds=d.container.getBoundingClientRect(),centerX=bounds.left+d.container.clientWidth/2,centerY=bounds.top+d.container.clientHeight/2;
  const pages=[...d.container.querySelectorAll('.page[data-page-number]')];
  const page=pages.find(node=>{const r=node.getBoundingClientRect();return centerX>=r.left&&centerX<=r.right&&centerY>=r.top&&centerY<=r.bottom;})
    ||pages.find(node=>Number(node.dataset.pageNumber)===d.view.currentPageNumber)||pages[0];
  if(!page)return null;
  const rect=page.getBoundingClientRect(),factor=Number.parseFloat(getComputedStyle(page).getPropertyValue('--scale-factor'));
  return {pageNumber:Number(page.dataset.pageNumber),x:(centerX-rect.left)/factor,y:(centerY-rect.top)/factor,centerX,centerY};
}
function changeScaleKeepingCenter(d,value){
  const anchor=captureZoomCenter(d),oldScale=d.view.currentScale;if(!anchor){d.view.currentScaleValue=String(value);return;}
  let finished=false;
  const onRendered=({pageNumber})=>{
    if(pageNumber!==anchor.pageNumber)return;
    d.bus.off('pagerendered',onRendered);requestAnimationFrame(()=>{
      if(finished)return;finished=true;
      const page=d.container.querySelector(`.page[data-page-number="${anchor.pageNumber}"]`);if(!page)return;
      const rect=page.getBoundingClientRect(),factor=Number.parseFloat(getComputedStyle(page).getPropertyValue('--scale-factor'));
      d.container.scrollLeft+=rect.left+anchor.x*factor-anchor.centerX;
      d.container.scrollTop+=rect.top+anchor.y*factor-anchor.centerY;
    });
  };
  d.bus.on('pagerendered',onRendered);d.view.currentScaleValue=String(value);
  if(d.view.currentScale===oldScale){finished=true;d.bus.off('pagerendered',onRendered);}
}
function changeZoom(value){
  const d=current();if(!d)return;
  d.view.update();
  const selected=Math.max(1,Math.min(d.pdf.numPages,Number($('pageNumber').value)||d.view.currentPageNumber));
  if(d.view.currentPageNumber!==selected)d.view.scrollPageIntoView({pageNumber:selected});
  changeScaleKeepingCenter(d,value);
  if(d.view.currentPageNumber!==selected)d.view.scrollPageIntoView({pageNumber:selected});
}
$('zoom').onchange=()=>changeZoom($('zoom').value);
$('zoomIn').onclick=()=>{if(current())changeZoom(Math.min(4,current().view.currentScale*1.2));};
$('zoomOut').onclick=()=>{if(current())changeZoom(Math.max(.25,current().view.currentScale/1.2));};
// Windows Precision Touchpad pinch is exposed by Chromium as a Ctrl+wheel.
// Tauri's WebView2 blocks that input when zoomHotkeysEnabled is false; the
// Reader-only window enables it, then this *non-passive capture* handler keeps
// the gesture on the PDF rather than enlarging the whole WebView shell.
// Capture at document level because WebView2 may target the scroll container,
// canvas, or an overlay during a trackpad gesture.
document.addEventListener('wheel',event=>{
  if(!event.ctrlKey)return; // Two-finger trackpad scroll must keep working.
  if(document.body.classList.contains('presentation-active'))return; // F11 owns its zoom.
  event.preventDefault(); // Never apply WebView2/browser zoom to Reader chrome.
  const d=current();if(!d)return;
  const documentsArea=$('documents'),rect=documentsArea.getBoundingClientRect();
  const overPdf=event.clientX>=rect.left&&event.clientX<rect.right
    &&event.clientY>=rect.top&&event.clientY<rect.bottom;
  if(!overPdf)return;
  const units=event.deltaMode===1?16:event.deltaMode===2?d.container.clientHeight:1;
  const delta=Math.max(-300,Math.min(300,event.deltaY*units));
  const scale=Math.max(.25,Math.min(4,d.view.currentScale*Math.exp(-delta*.002)));
  if(Math.abs(scale-d.view.currentScale)<.0001)return;
  changeScaleKeepingCenter(d,scale);
},{capture:true,passive:false});
$('sideToggle').onclick=()=>{$('sidebar').hidden=!$('sidebar').hidden;};$('showThumbs').onclick=()=>{$('thumbs').hidden=false;$('outline').hidden=true;const list=$('bookmarks');if(list)list.hidden=true;};$('showOutline').onclick=()=>{$('thumbs').hidden=true;$('outline').hidden=false;const list=$('bookmarks');if(list)list.hidden=true;};
document.addEventListener('dragover',e=>{e.preventDefault();});document.addEventListener('drop',attempt(async e=>{e.preventDefault();for(const file of e.dataTransfer.files)if(file.name.toLowerCase().endsWith('.pdf'))await openFile(file);}));
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='o'){e.preventDefault();$('open').click();}if(e.ctrlKey&&e.key.toLowerCase()==='f'){e.preventDefault();$('query').focus();}if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();$(e.shiftKey?'save':'saveCurrent').click();}});
document.addEventListener('keydown',e=>{if(e.key==='Delete'&&selected&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('dialog[open]')){e.preventDefault();removeSignature();}});
window.addEventListener('beforeunload',e=>{for(const doc of documents.values())r2?.flushBookmark(doc);if([...documents.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
r2=installR2({placeAsset,current,documents,changed,render:renderSignatures,renderTabs,message,attempt,ensurePdfLib,readSourceBytes,select:id=>{selected=id;const d=current();if(d)d.selectedId=id;},flushSession:()=>session?.flush(),get busy(){return busy;}});
session=installReaderSession({native:window.__TAURI__,documents,current,activate,message,attempt});
installReaderActions({current,message,attempt,get pdfjs(){return pdfjs;},ensurePdfLib,readSourceBytes,exportDocument:doc=>r2.exportDocument(doc),openFile,get busy(){return busy;}});
installLanguage();
document.addEventListener('reader-language-changed',()=>{if($('outline').dataset.empty==='true')$('outline').textContent=t('PDF này chưa có mục lục.');});
$('open').disabled=false;
document.body.dataset.ready='true';
installDefaultPdfPrompt({native:window.__TAURI__,message});
attempt(async()=>{
  await connectNativeReader({native:window.__TAURI__,find:source=>[...documents.values()].find(d=>d.source===source),activate,open:openFile,prepareOpen:ensurePdfRuntime,message,hasOpen:()=>documents.size>0,session});
})();
