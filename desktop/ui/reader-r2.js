const $=id=>document.getElementById(id),A=window.ReaderEdits,Q=window.QuickSign;
const element=(tag,text,props={})=>Object.assign(document.createElement(tag),{textContent:text,...props});
const snapshot=doc=>JSON.stringify(doc.placements);
export function installR2(api){
  let mode='select';
  const panels=element('div','',{className:'ribbon-panels'}),tabs=element('nav','',{className:'ribbon-tabs',ariaLabel:'Nhóm công cụ'});
  const panel={};for(const [id,label] of Object.entries({home:'Trang chủ',comment:'Chú thích',sign:'Điền & ký',view:'Xem'})){
    const button=element('button',label);button.dataset.ribbon=id;button.onclick=()=>{for(const [name,node] of Object.entries(panel))node.hidden=name!==id;tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b===button)));};tabs.append(button);
    panel[id]=element('section','',{className:'ribbon-group',hidden:id!=='home'});panels.append(panel[id]);
  }
  $('tabs').after(tabs,panels);tabs.firstChild.setAttribute('aria-selected','true');
  function button(group,id,label,icon,fn){const b=element('button',label,{id});if(icon){const image=element('img','',{src:`./reader-icons/${icon}-duotone.svg`,alt:''});b.prepend(image);}b.onclick=api.attempt(fn);panel[group].append(b);return b;}
  const doc=()=>{const d=api.current();if(!d)throw Error('Mở PDF trước.');return d;};
  function setMode(value){mode=value;document.body.dataset.tool=value;panels.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===value)));if(value==='select')window.getSelection()?.removeAllRanges();}
  button('home','selectText','Chọn chữ','cursor-text',()=>setMode('select')).dataset.mode='select';
  button('home','pan','Bàn tay','hand',()=>setMode('pan')).dataset.mode='pan';
  button('home','copyText','Sao chép','copy',async()=>{const text=window.getSelection()?.toString();if(!text)throw Error('Chọn đoạn chữ cần sao chép.');await navigator.clipboard.writeText(text);api.message('Đã sao chép chữ đã chọn.');});
  button('home','undo','Hoàn tác','arrow-counter-clockwise',()=>undo(false));button('home','redo','Làm lại','arrow-counter-clockwise',()=>undo(true));
  for(const [kind,label,icon] of [['highlight','Tô sáng','highlighter'],['underline','Gạch dưới','text-underline'],['strike','Gạch ngang','text-strikethrough'],['note','Ghi chú','note-pencil'],['ink','Bút vẽ','note-pencil'],['rectangle','Chữ nhật','rectangle'],['ellipse','Ellipse','circle'],['line','Đường thẳng','line-segment'],['arrow','Mũi tên','arrow-up-right'],['erase','Tẩy bản chưa lưu','note-pencil']]){
    const b=button('comment',`annot-${kind}`,label,icon,async()=>{if(['highlight','underline','strike'].includes(kind)&&await markSelection(kind))return;setMode(kind);});b.dataset.mode=kind;
  }
  button('sign','createSignature','Tạo chữ ký','note-pencil',()=>$('sign').click());
  const libraryButton=button('sign','signatureLibrary','Chữ ký đã lưu','note-pencil',()=>showLibrary());
  const library=element('dialog','',{id:'signatureLibraryDialog'}),libraryList=element('div','',{id:'signatureLibraryList'});library.append(element('h2','Chữ ký của bạn'),element('p','Lưu tại hồ sơ ứng dụng trên máy này. Xóa chữ ký không xóa bản đã ký trong PDF.'),libraryList);const close=element('button','Đóng');close.onclick=()=>library.close();library.append(close);document.body.append(library);
  const storeKey='sreader.signatures.v1';
  const signatures=()=>{try{return JSON.parse(localStorage.getItem(storeKey)||'[]');}catch{return[];}};
  function writeSignatures(items){const text=JSON.stringify(items);if(text.length>3*1024*1024)throw Error('Thư viện chữ ký đã đầy (3 MB). Xóa chữ ký không dùng trước khi thêm.');localStorage.setItem(storeKey,text);}
  function showLibrary(){libraryList.replaceChildren();const saved=signatures();if(!saved.length)libraryList.append(element('p','Chưa có chữ ký. Tạo hoặc nhập chữ ký để lưu dùng lại.'));
    for(const entry of saved){const row=element('section','',{className:'signature-library-row'}),img=element('img','',{src:entry.image,alt:entry.name});const use=element('button',entry.name);use.onclick=api.attempt(async()=>{await api.placeAsset(entry.image);library.close();});
      const rename=element('button','Đổi tên');rename.onclick=api.attempt(()=>{const name=prompt('Tên chữ ký:',entry.name);if(name?.trim()){writeSignatures(signatures().map(s=>s.id===entry.id?{...s,name:name.trim().slice(0,80)}:s));showLibrary();}});
      const remove=element('button','Xóa');remove.onclick=()=>{if(confirm(`Xóa chữ ký “${entry.name}” khỏi thư viện?`)){writeSignatures(signatures().filter(s=>s.id!==entry.id));showLibrary();}};row.append(img,use,rename,remove);libraryList.append(row);
    }if(!library.open)library.showModal();
  }
  button('view','singlePage','Một trang','rectangle',()=>{doc().view.scrollMode=3;doc().view.spreadMode=0;});
  button('view','continuous','Cuộn liên tục','rectangle',()=>{doc().view.scrollMode=0;doc().view.spreadMode=0;});
  button('view','twoPage','Hai trang','rectangle',()=>{doc().view.scrollMode=0;doc().view.spreadMode=1;});
  button('view','rotateView','Xoay chế độ xem','arrow-counter-clockwise',()=>{const d=doc();d.view.pagesRotation=(d.view.pagesRotation+90)%360;api.render(d);});
  button('view','fullscreen','Toàn màn hình','rectangle',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
  button('view','theme','Sáng / tối','moon',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('sreader.theme',theme);});
  document.documentElement.dataset.theme=localStorage.getItem('sreader.theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const notes=element('textarea','',{id:'annotationNote',placeholder:'Nội dung ghi chú',ariaLabel:'Nội dung ghi chú'});$('signOptions').append(notes);
  notes.onchange=()=>{const d=doc(),item=d.placements.find(p=>p.id===d.selectedId);if(item?.kind==='note'){checkpoint(d);item.text=notes.value;api.changed(d);api.render(d);}};
  function checkpoint(d){const state=snapshot(d);d.undo??=[];d.redo??=[];if(d.undo.at(-1)!==state)d.undo.push(state);if(d.undo.length>30)d.undo.shift();d.redo=[];}
  function undo(redo){const d=doc(),from=redo?d.redo:d.undo,to=redo?d.undo:d.redo;if(!from?.length)return;to.push(snapshot(d));d.placements=JSON.parse(from.pop());d.dirty=snapshot(d)!==d.savedState;api.select(null);$('signOptions').hidden=true;api.render(d);api.renderTabs();}
  function viewport(d,index){const v=d.view.getPageView(index).viewport;return{width:v.width/v.scale,height:v.height/v.scale,transform:v.transform.map((n,i)=>i<6?n/v.scale:n),rotation:v.rotation};}
  // Viewport transforms are stored at scale 1, independently of zoom/view rotation.
  function itemAt(d,index,rect,kind,points){return{id:crypto.randomUUID(),group:crypto.randomUUID(),kind,page:index,rect,viewport:viewport(d,index),points,color:kind==='highlight'?[1,.72,.1]:[.12,.35,.85]};}
  function selection(item){$('signOptions').querySelector('h2').textContent=item?.kind?'Chú thích đang chọn':'Chữ ký đang chọn';for(const id of ['applyScope','range','apply'])$(id).hidden=Boolean(item?.kind);notes.hidden=item?.kind!=='note';notes.value=item?.text||'';$('removeSign').textContent=item?.kind?'Xóa chú thích':'Xóa chữ ký';$('signOptions').querySelectorAll('p').forEach(p=>p.hidden=Boolean(item?.kind));$('applyScope').closest('label').hidden=Boolean(item?.kind);}
  function add(d,item){selection(item);checkpoint(d);d.placements.push(item);api.select(item.id);api.changed(d);api.render(d);$('signOptions').hidden=false;}
  async function markSelection(kind){const selection=window.getSelection();if(!selection?.rangeCount||!selection.toString())return false;const d=doc(),rects=[...selection.getRangeAt(0).getClientRects()];const items=[];
    for(const box of rects){for(let index=0;index<d.pdf.numPages;index++){const page=d.view.getPageView(index)?.div;if(!page)continue;const b=page.getBoundingClientRect();if(box.width>1&&box.height>1&&box.height<b.height/3&&box.left>=b.left-1&&box.right<=b.right+1&&box.top>=b.top-1&&box.bottom<=b.bottom+1){items.push(itemAt(d,index,{x:(box.left-b.left)/b.width,y:(box.top-b.top)/b.height,w:box.width/b.width,h:box.height/b.height},kind));break;}}}
    if(!items.length)return false;checkpoint(d);d.placements.push(...items);api.changed(d);selection.removeAllRanges();api.render(d);setMode('select');return true;
  }
  function visual(item){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('annotation-visual');let node;const create=tag=>document.createElementNS(svg.namespaceURI,tag);
    if(item.kind==='note'){node=create('rect');node.setAttribute('width','100');node.setAttribute('height','100');node.setAttribute('fill','#ffe07a');node.setAttribute('stroke','#bd841c');}
    else if(['rectangle','highlight'].includes(item.kind)){node=create('rect');node.setAttribute('x','1');node.setAttribute('y','1');node.setAttribute('width','98');node.setAttribute('height','98');node.setAttribute('fill',item.kind==='highlight'?'#ffcf4a':'none');if(item.kind==='highlight')node.setAttribute('opacity','.32');}
    else if(item.kind==='ellipse'){node=create('ellipse');for(const [k,v]of Object.entries({cx:50,cy:50,rx:49,ry:49}))node.setAttribute(k,v);node.setAttribute('fill','none');}
    else{node=create('polyline');let points=item.points||[[0,0],[1,1]];if(item.kind==='underline')points=[[0,.95],[1,.95]];if(item.kind==='strike')points=[[0,.5],[1,.5]];node.setAttribute('points',points.map(p=>`${p[0]*100},${p[1]*100}`).join(' '));node.setAttribute('fill','none');if(item.kind==='arrow'){const end=points.at(-1),start=points[0],angle=Math.atan2(end[1]-start[1],end[0]-start[0]);node.setAttribute('points',[...points,[end[0]-.12*Math.cos(angle-.5),end[1]-.12*Math.sin(angle-.5)],end,[end[0]-.12*Math.cos(angle+.5),end[1]-.12*Math.sin(angle+.5)]].map(p=>`${p[0]*100},${p[1]*100}`).join(' '));}}
    if(!['highlight','note'].includes(item.kind)){node.setAttribute('stroke','#2459c3');node.setAttribute('stroke-width','1.5');node.setAttribute('vector-effect','non-scaling-stroke');}svg.append(node);return svg;
  }
  function opened(d){d.savedState=snapshot(d);d.undo=[];d.redo=[];d.r2Abort=new AbortController();const signal=d.r2Abort.signal;
    d.container.addEventListener('pointerdown',event=>{
      if(event.button!==0||api.busy||event.target.closest('.signature'))return;
      api.select(null);$('signOptions').hidden=true;api.render(d);
      if(mode==='select'||mode==='erase')return;
      if(mode==='pan'){event.preventDefault();const x=event.clientX,y=event.clientY,left=d.container.scrollLeft,top=d.container.scrollTop;const move=e=>{d.container.scrollLeft=left+x-e.clientX;d.container.scrollTop=top+y-e.clientY;};d.container.setPointerCapture(event.pointerId);d.container.addEventListener('pointermove',move);d.container.addEventListener('pointerup',()=>d.container.removeEventListener('pointermove',move),{once:true});return;}
      const page=event.target.closest('.page');if(!page)return;event.preventDefault();const index=Number(page.dataset.pageNumber)-1,b=page.getBoundingClientRect(),x=Math.max(0,Math.min(1,(event.clientX-b.left)/b.width)),y=Math.max(0,Math.min(1,(event.clientY-b.top)/b.height));
      let points=[[x,y]],item=itemAt(d,index,{x,y,w:.001,h:.001},mode);const preview=element('div','',{className:'annotation-preview'});page.append(preview);d.container.setPointerCapture(event.pointerId);
      const move=e=>{const end=[Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))];if(item.kind==='ink')points.push(end);else points=[points[0],end];const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);item.rect={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(.003,Math.max(...xs)-Math.min(...xs)),h:Math.max(.003,Math.max(...ys)-Math.min(...ys))};item.points=points.map(p=>[(p[0]-item.rect.x)/item.rect.w,(p[1]-item.rect.y)/item.rect.h]);Object.assign(preview.style,{left:`${item.rect.x*100}%`,top:`${item.rect.y*100}%`,width:`${item.rect.w*100}%`,height:`${item.rect.h*100}%`});preview.replaceChildren(visual(item));};
      d.container.addEventListener('pointermove',move);
      const finish=e=>{d.container.removeEventListener('pointermove',move);d.container.removeEventListener('pointerup',finish);d.container.removeEventListener('pointercancel',cancel);preview.remove();if(item.kind==='note'){const text=prompt('Nội dung ghi chú:');if(!text?.trim())return;item.text=text.trim();item.rect={x:Math.min(x,.94),y:Math.min(y,.94),w:.045,h:.035};}else if(points.length<2)return;add(d,item);setMode('select');};
      const cancel=()=>{preview.remove();d.container.removeEventListener('pointermove',move);d.container.removeEventListener('pointerup',finish);};d.container.addEventListener('pointerup',finish);d.container.addEventListener('pointercancel',cancel,{once:true});
    },{capture:true,signal});
  }
  async function exportDocument(d){const viewportFor=async page=>(await d.pdf.getPage(page+1)).getViewport({scale:1});
    if(d.placements.length&&!d.signatureWarningAccepted){const source=await window.PDFLib.PDFDocument.load(d.bytes,{updateMetadata:false});const signed=source.getForm().getFields().some(f=>f instanceof window.PDFLib.PDFSignature&&f.acroField.dict.has(window.PDFLib.PDFName.of('V')));if(signed){if(!confirm('PDF này có chữ ký số. Thay đổi bản sao có thể làm mất hiệu lực xác thực. Tiếp tục Lưu thành?'))throw Error('Đã hủy lưu để giữ trạng thái chữ ký số.');d.signatureWarningAccepted=true;}}
    let bytes=d.bytes.slice();const annotations=d.placements.filter(p=>p.kind),signatures=d.placements.filter(p=>!p.kind);
    if(annotations.length)bytes=await A.save(bytes,annotations,viewportFor,window.PDFLib);if(signatures.length)bytes=await Q.save(bytes,signatures,viewportFor,window.PDFLib);
    const check=await window.PDFLib.PDFDocument.load(bytes,{updateMetadata:false});if(check.getPageCount()!==d.pdf.numPages)throw Error('Kiểm tra lưu: số trang bị thay đổi.');return bytes;
  }
  document.addEventListener('keydown',event=>{if(!event.ctrlKey||!api.current()||event.target.closest('input,textarea,[contenteditable=true]'))return;if(event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y'){event.preventDefault();undo(event.key.toLowerCase()==='y'||event.shiftKey);}});
  return{get mode(){return mode;},selection,opened,activated(d){selection(d.placements.find(p=>p.id===d.selectedId));},checkpoint,visual,exportDocument,saved:d=>{d.savedState=snapshot(d);},rememberSignature(image){const all=signatures();if(!all.some(s=>s.image===image)){all.push({id:crypto.randomUUID(),name:`Chữ ký ${all.length+1}`,image});writeSignatures(all);}},showLibrary};
}
