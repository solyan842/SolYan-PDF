import {sheets} from './reader-print-layout.js';
import {pdfAssetOptions} from './reader-pdf-assets.js';
const el=(tag,props={})=>Object.assign(document.createElement(tag),props);
export function installReaderPrint(api,{printButton,layoutButton}){
  const dialog=el('dialog',{id:'readerPrintDialog'}),grid=el('div',{className:'reader-print-controls'});
  const select=(id,label,values)=>{const s=el('select',{id});for(const [value,text]of values)s.append(el('option',{value,textContent:text}));const l=el('label',{textContent:label});l.append(s);grid.append(l);return s;};
  const input=(id,label,value,type='number')=>{const s=el('input',{id,type,value});const l=el('label',{textContent:label});l.append(s);grid.append(l);return s;};
  const subset=select('printSubset','Phạm vi',[['all','Tất cả'],['current','Trang hiện tại'],['visible','Các trang đang xem'],['custom','Khoảng tùy chọn']]);
  const range=input('printRange','Trang (all hoặc 1,3-5)','all','text');range.oninput=()=>subset.value='custom';
  const parity=select('printParity','Lọc trang',[['all','Chẵn và lẻ'],['odd','Trang lẻ'],['even','Trang chẵn']]);
  const reverse=input('printReverse','Đảo thứ tự','','checkbox');
  const paper=select('printPaper','Khổ giấy',[['source','Theo trang PDF'],['a4','A4'],['letter','Letter'],['a3','A3']]);
  const orientation=select('printOrientation','Hướng giấy',[['auto','Theo khổ giấy'],['portrait','Dọc'],['landscape','Ngang']]);
  const mode=select('printLayout','Bố trí',[['single','Một trang mỗi tờ'],['multiple','Nhiều trang mỗi tờ'],['booklet','Sách gấp đôi'],['tile','Chia trang lớn thành nhiều tờ']]);
  const count=select('printNup','Trang mỗi tờ',[[1,'1'],[2,'2'],[4,'4'],[6,'6'],[9,'9'],[16,'16']]);
  const scale=select('printScale','Tỷ lệ',[['fit','Vừa vùng in'],['reduce','Chỉ thu nhỏ'],['actual','Kích thước thật'],['custom','Tùy chỉnh']]);
  const percent=input('printPercent','Tỷ lệ tùy chỉnh (%)','100');percent.min='10';percent.max='400';
  const margin=input('printMargin','Lề mỗi cạnh (mm)','0');margin.min='0';margin.max='50';
  const rotate=input('printAutoRotate','Tự xoay và căn giữa','','checkbox');rotate.checked=true;
  const quality=select('printQuality','Chất lượng ảnh in',[[144,'144 dpi'],[216,'216 dpi']]);
  const edits=input('printEdits','Gồm chữ ký và phần đã chèn','','checkbox');edits.checked=true;
  const annotations=input('printAnnotations','Gồm chú thích PDF','','checkbox');annotations.checked=true;
  const forms=input('printForms','Gồm dữ liệu biểu mẫu đã điền','','checkbox');forms.checked=true;
  const gray=input('printGray','In đen trắng','','checkbox');
  const printGroup=(title,ids,extra)=>{const section=el('section',{className:'reader-print-group'});section.append(el('h3',{textContent:title}));if(extra)section.append(el('p',{className:'reader-print-group-note',textContent:extra}));for(const id of ids){const control=grid.querySelector('#'+id);const label=control?.closest('label');if(label)section.append(label);}return section;};
  const printerGroup=printGroup('Máy in',[], 'Máy in, số bản, thuộc tính và in hai mặt được chọn trong hộp thoại Windows tiếp theo.');
  const rangeGroup=printGroup('Phạm vi trang',['printSubset','printRange','printParity','printReverse']);
  const layoutGroup=printGroup('Cách in',['printLayout','printNup','printPaper','printOrientation','printScale','printPercent','printMargin']);
  const contentGroup=printGroup('Nội dung và chất lượng',['printEdits','printForms','printAnnotations','printGray','printAutoRotate','printQuality']);
  grid.className='reader-print-settings';grid.replaceChildren(printerGroup,rangeGroup,layoutGroup,contentGroup);
  const status=el('p',{id:'printStatus',role:'status'}),preview=el('canvas',{id:'printPreview'}),pageLabel=el('span',{id:'printPreviewPage'});
  const prev=el('button',{textContent:'‹ Trang trước'}),next=el('button',{textContent:'Trang sau ›'}),previewButton=el('button',{id:'printPreviewButton',textContent:'Xem trước'});
  const zoomOut=el('button',{id:'printPreviewZoomOut',type:'button',textContent:'−','aria-label':'Thu nhỏ bản xem trước'}),zoomIn=el('button',{id:'printPreviewZoomIn',type:'button',textContent:'+','aria-label':'Phóng to bản xem trước'}),zoomFit=el('button',{id:'printPreviewZoomFit',type:'button',textContent:'Vừa khung'}),zoomLabel=el('span',{id:'printPreviewZoomLevel','aria-live':'polite'});
  const start=el('button',{id:'printStart',textContent:'In…',className:'primary'}),cancel=el('button',{id:'printCancel',textContent:'Hủy / Đóng'});
  const previewPanel=el('section',{className:'reader-print-preview'}),previewNav=el('div',{className:'reader-print-preview-nav'}),previewViewport=el('div',{id:'printPreviewViewport',className:'reader-print-preview-viewport'}),body=el('div',{className:'reader-print-body'}),footer=el('div',{className:'reader-print-footer'});
  const title=el('h2',{className:'reader-print-title'}),logo=el('img',{src:'./vendor/sReader_PDF.png',alt:'',className:'reader-print-logo'});title.append(logo,el('span',{textContent:'In'}));
  previewNav.append(previewButton,prev,pageLabel,next,zoomOut,zoomLabel,zoomIn,zoomFit);previewViewport.append(preview);previewPanel.append(previewNav,previewViewport,status);body.append(previewPanel,grid);footer.append(start,cancel);
  dialog.append(title,body,el('p',{className:'reader-print-note',textContent:'Bản xem trước dùng PDF.js. Tài liệu PDF nguồn được giữ nguyên.'}),footer);document.body.append(dialog);
  let preparing=false,abort=null,pdf=null,renderTask=null,previewIndex=0,previewFit={width:0,height:0},previewZoom=1;
  const rules=[],sheet=[...document.styleSheets].find(s=>s.href?.split('?')[0].endsWith('/reader.css'));
  const applyPreviewZoom=(center=true)=>{if(!previewFit.width||!previewFit.height)return;const w=Math.round(previewFit.width*previewZoom),h=Math.round(previewFit.height*previewZoom);preview.style.width=`${w}px`;preview.style.height=`${h}px`;zoomLabel.textContent=`${Math.round(previewZoom*100)}%`;zoomOut.disabled=previewZoom<=.5;zoomIn.disabled=previewZoom>=2.5;requestAnimationFrame(()=>{if(center){previewViewport.scrollLeft=Math.max(0,(previewViewport.scrollWidth-previewViewport.clientWidth)/2);previewViewport.scrollTop=Math.max(0,(previewViewport.scrollHeight-previewViewport.clientHeight)/2);}});};
  const fitPreview=()=>{const c=preview,box=previewViewport.getBoundingClientRect();if(!c.width||!c.height||!box.width||!box.height)return;const fit=Math.min(1,(box.width-24)/c.width,(box.height-24)/c.height);previewFit={width:Math.max(1,c.width*fit),height:Math.max(1,c.height*fit)};previewZoom=1;applyPreviewZoom(false);previewViewport.scrollLeft=previewViewport.scrollTop=0;};
  const showPreview=()=>{const canvases=[...document.querySelectorAll('#readerPrintStage canvas')];previewIndex=Math.max(0,Math.min(previewIndex,canvases.length-1));const c=canvases[previewIndex];preview.hidden=!c;if(!c){pageLabel.textContent='';return;}preview.width=Math.max(1,Math.round(c.width*Math.min(1,1200/c.width)));preview.height=Math.max(1,Math.round(c.height*preview.width/c.width));preview.getContext('2d').drawImage(c,0,0,preview.width,preview.height);pageLabel.textContent=`Tờ ${previewIndex+1}/${canvases.length}`;prev.disabled=previewIndex===0;next.disabled=previewIndex===canvases.length-1;fitPreview();};
  function cleanup(){abort?.abort();renderTask?.cancel();for(const i of rules.splice(0).reverse())sheet?.deleteRule(i);const stage=document.getElementById('readerPrintStage');if(stage){for(const c of stage.querySelectorAll('canvas'))c.width=c.height=0;stage.remove();}if(pdf){void pdf.loadingTask.destroy();pdf=null;}preview.width=preview.height=0;preview.hidden=true;previewFit={width:0,height:0};previewZoom=1;zoomLabel.textContent='';}
  const close=()=>{cleanup();dialog.close();};cancel.onclick=close;dialog.addEventListener('cancel',cleanup);window.addEventListener('afterprint',cleanup);
  prev.onclick=()=>{previewIndex--;showPreview();};next.onclick=()=>{previewIndex++;showPreview();};
  zoomOut.onclick=()=>{previewZoom=Math.max(.5,Math.round((previewZoom-.25)*100)/100);applyPreviewZoom();};zoomIn.onclick=()=>{previewZoom=Math.min(2.5,Math.round((previewZoom+.25)*100)/100);applyPreviewZoom();};zoomFit.onclick=fitPreview;
  const enabledOptions=()=>{count.disabled=mode.value!=='multiple';percent.disabled=scale.value!=='custom'&&mode.value!=='tile';};enabledOptions();
  grid.addEventListener('change',()=>{enabledOptions();if(!preparing){cleanup();pageLabel.textContent='';status.textContent='Tùy chọn đã đổi; nhấn Xem trước để cập nhật.';}});
  const resetOptions=()=>{subset.value='all';range.value='all';parity.value='all';reverse.checked=false;paper.value='source';orientation.value='auto';mode.value='single';count.value='1';scale.value='fit';percent.value='100';margin.value='0';rotate.checked=true;quality.value='216';edits.checked=true;annotations.checked=true;forms.checked=true;gray.checked=false;enabledOptions();};
  const prepare=async(doPrint)=>{
    const doc=api.current();if(!doc||preparing||api.busy)return;
    cleanup();abort=new AbortController();const signal=abort.signal;preparing=true;start.disabled=previewButton.disabled=true;grid.inert=true;
    try{
      const n=Number(percent.value),m=Number(margin.value)*72/25.4;if(!Number.isFinite(n)||n<10||n>400||!Number.isFinite(m)||m<0||m>50*72/25.4)throw Error('Tỷ lệ hoặc lề không hợp lệ.');
      let pages=window.QuickSign.pages(subset.value==='current'?String(doc.view.currentPageNumber):range.value.trim(),doc.pdf.numPages,doc.view.currentPageNumber-1);
      if(subset.value==='visible'){const bounds=doc.container.getBoundingClientRect();pages=[...doc.container.querySelectorAll('.page[data-page-number]')].filter(p=>{const r=p.getBoundingClientRect();return r.bottom>bounds.top&&r.top<bounds.bottom&&r.right>bounds.left&&r.left<bounds.right;}).map(p=>Number(p.dataset.pageNumber)-1);}
      pages=pages.filter(p=>parity.value==='all'||(p+1)%2===(parity.value==='odd'?1:0));if(reverse.checked)pages.reverse();
      if(!pages.length||pages.length>50)throw Error('Chọn từ 1 đến 50 trang cho mỗi đợt in.');
      const sourceBytes=await api.readSourceBytes(doc);let bytes;if(edits.checked&&forms.checked)bytes=await api.exportDocument(doc);
      else if(edits.checked){const unfilled=await api.pdfjs.getDocument({data:sourceBytes.slice(),isEvalSupported:false,enableXfa:false,...pdfAssetOptions}).promise;try{bytes=await api.exportDocument({...doc,pdf:unfilled,formDirty:false});}finally{await unfilled.loadingTask.destroy();}}
      else bytes=forms.checked&&doc.pdf.annotationStorage.size?await doc.pdf.saveDocument():sourceBytes.slice();
      if(forms.checked&&!annotations.checked){await api.ensurePdfLib();const flattened=await window.PDFLib.PDFDocument.load(bytes,{updateMetadata:false});flattened.getForm().flatten({updateFieldAppearances:false});bytes=await flattened.save();}
      signal.throwIfAborted();pdf=await api.pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,...pdfAssetOptions}).promise;
      const sizes={},sourcePages={};for(const index of pages){signal.throwIfAborted();const p=await pdf.getPage(index+1);sourcePages[index]=p;const v=p.getViewport({scale:1});sizes[index]=[v.width,v.height];}
      let size=({a4:[595.276,841.89],letter:[612,792],a3:[841.89,1190.551]})[paper.value]||null;if(size&&orientation.value!=='auto'){size.sort((a,b)=>a-b);if(orientation.value==='landscape')size.reverse();}
      if(mode.value!=='single'&&!size)throw Error('Chọn khổ giấy cố định cho bố trí nhiều trang, sách hoặc chia trang.');
      const plan=sheets(pages,sizes,{mode:mode.value,nup:mode.value==='multiple'?Number(count.value):1,paper:size,scale:scale.value,percent:n,margin:m,rotate:rotate.checked,orientation:orientation.value});if(plan.length>100)throw Error('Quá 100 tờ in; chọn ít trang hoặc khổ giấy lớn hơn.');
      const stage=el('section',{id:'readerPrintStage'});document.body.append(stage);let pixels=0;
      for(const [i,layout]of plan.entries()){
        signal.throwIfAborted();const [w,h]=layout.size,density=Math.min(Number(quality.value)/72,Math.sqrt(12_000_000/(w*h)));
        const canvas=el('canvas');canvas.width=Math.floor(w*density);canvas.height=Math.floor(h*density);pixels+=canvas.width*canvas.height;if(pixels>80_000_000)throw Error('Bản in quá lớn; chọn ít trang hơn.');
        const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(density,density);ctx.beginPath();ctx.rect(...layout.clip);ctx.clip();
        for(const item of layout.items){
          signal.throwIfAborted();const p=sourcePages[item.index],v=p.getViewport({scale:1,rotation:(p.rotate+(item.turn?90:0))%360}),factor=Math.min(density*item.width/v.width,Math.sqrt(12_000_000/(v.width*v.height))),view=p.getViewport({scale:factor,rotation:v.rotation});
          const scratch=el('canvas');scratch.width=Math.max(1,Math.floor(view.width));scratch.height=Math.max(1,Math.floor(view.height));
          renderTask=p.render({canvasContext:scratch.getContext('2d'),viewport:view,intent:'print',annotationMode:annotations.checked?api.pdfjs.AnnotationMode.ENABLE_STORAGE:api.pdfjs.AnnotationMode.DISABLE,printAnnotationStorage:pdf.annotationStorage.print});
          const stop=()=>renderTask?.cancel();signal.addEventListener('abort',stop,{once:true});try{await renderTask.promise;}finally{signal.removeEventListener('abort',stop);}signal.throwIfAborted();ctx.drawImage(scratch,item.x,item.y,item.width,item.height);scratch.width=scratch.height=0;
        }
        ctx.restore();if(gray.checked){const image=ctx.getImageData(0,0,canvas.width,canvas.height);for(let k=0;k<image.data.length;k+=4){const g=Math.round(image.data[k]*.2126+image.data[k+1]*.7152+image.data[k+2]*.0722);image.data[k]=image.data[k+1]=image.data[k+2]=g;}ctx.putImageData(image,0,0);}
        const wrapper=el('div',{className:'reader-print-page'});wrapper.style.width=w+'pt';wrapper.style.height=h+'pt';wrapper.dataset.page=layout.items.map(x=>x.index+1).join(',');if(sheet){const name='readerSheet'+i;rules.push(sheet.cssRules.length);sheet.insertRule(`@page ${name}{size:${w}pt ${h}pt;margin:0}`,sheet.cssRules.length);wrapper.style.page=name;if(i===0)stage.style.page=name;}wrapper.append(canvas);stage.append(wrapper);status.textContent=`Đã chuẩn bị ${i+1}/${plan.length} tờ.`;
      }
      stage.dataset.pixels=String(pixels);previewIndex=0;showPreview();signal.throwIfAborted();
      if(doPrint){dialog.close();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));signal.throwIfAborted();if(window.__TAURI__?.core?.invoke){try{await window.__TAURI__.core.invoke('reader_show_system_print_dialog');api.message('Đã mở hộp thoại in Windows.');}catch(error){api.message('Không mở được hộp thoại in Windows; chuyển sang hộp thoại WebView2.');window.print();}}else{window.print();api.message('Đã mở hộp thoại in.');}}
    }catch(error){cleanup();if(error.name!=='AbortError'&&error.name!=='RenderingCancelledException')throw error;}
    finally{preparing=false;grid.inert=false;start.disabled=previewButton.disabled=false;}
  };
  const printDefault=async()=>{if(!api.current()){api.message('Mở PDF trước.');return;}if(preparing||api.busy)return;cleanup();resetOptions();status.textContent='Đang chuẩn bị xem trước. Phóng to/thu nhỏ được neo ở tâm; nhấn In để chọn máy in.';dialog.showModal();await prepare(false);};
  const openLayout=()=>{if(!api.current()){api.message('Mở PDF trước.');return;}if(preparing||api.busy)return;cleanup();resetOptions();status.textContent='Bố trí in nâng cao. Máy in và Properties sẽ được chọn trong hộp thoại Windows.';dialog.showModal();};
  start.onclick=api.attempt(()=>prepare(true));previewButton.onclick=api.attempt(()=>prepare(false));
  return {print:printDefault,openLayout};
}
