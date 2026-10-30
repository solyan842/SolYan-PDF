import {sheets,printPageDensity} from './reader-print-layout.js';
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
  const printerGroup=el('section',{className:'reader-print-group'});
  printerGroup.append(el('h3',{textContent:'Máy in'}));
  const printerSelect=el('select',{id:'printPrinter','aria-label':'Chọn máy in'});
  const printerProperties=el('button',{id:'printPrinterProperties',type:'button',textContent:'Thuộc tính…'});
  const copies=el('input',{id:'printCopies',type:'number',min:'1',max:'999',value:'1','aria-label':'Số bản in'});
  const printerRow=el('div',{className:'reader-printer-row'}),printerLabel=el('label',{textContent:'Tên máy in'}),copiesLabel=el('label',{textContent:'Số bản'});
  printerLabel.append(printerSelect);copiesLabel.append(copies);printerRow.append(printerLabel,printerProperties,copiesLabel);
  const printerStatus=el('p',{id:'printPrinterStatus',role:'status',className:'reader-print-group-note'});
  printerGroup.append(printerRow,printerStatus);
  const rangeGroup=printGroup('Phạm vi trang',['printSubset','printRange','printParity','printReverse']);
  const layoutGroup=printGroup('Cách in',['printLayout','printNup','printPaper','printOrientation','printScale','printPercent','printMargin']);
  const contentGroup=printGroup('Nội dung và chất lượng',['printEdits','printForms','printAnnotations','printGray','printAutoRotate','printQuality']);
  grid.className='reader-print-settings';grid.replaceChildren(printerGroup,rangeGroup,layoutGroup,contentGroup);
  const status=el('p',{id:'printStatus',role:'status'}),preview=el('canvas',{id:'printPreview'}),pageLabel=el('span',{id:'printPreviewPage'});
  const prev=el('button',{textContent:'‹ Trang trước'}),next=el('button',{textContent:'Trang sau ›'}),previewButton=el('button',{id:'printPreviewButton',textContent:'Xem trước'});
  const zoomLabel=el('span',{id:'printPreviewZoomLevel','aria-live':'polite'});
  const start=el('button',{id:'printStart',textContent:'In…',className:'primary'}),cancel=el('button',{id:'printCancel',textContent:'Hủy / Đóng'});
  const previewPanel=el('section',{className:'reader-print-preview'}),previewNav=el('div',{className:'reader-print-preview-nav'}),previewViewport=el('div',{id:'printPreviewViewport',className:'reader-print-preview-viewport'}),body=el('div',{className:'reader-print-body'}),footer=el('div',{className:'reader-print-footer'});
  const title=el('h2',{className:'reader-print-title'}),logo=el('img',{src:'./vendor/sReader_PDF.png',alt:'',className:'reader-print-logo'});title.append(logo,el('span',{textContent:'In'}));
  previewNav.append(previewButton,prev,pageLabel,next,zoomLabel);previewViewport.append(preview);previewPanel.append(previewNav,previewViewport,status);body.append(previewPanel,grid);footer.append(start,cancel);
  dialog.append(title,body,el('p',{className:'reader-print-note',textContent:'Chọn máy in và Thuộc tính ngay tại đây. Bản xem trước dùng PDF.js; PDF nguồn được giữ nguyên.'}),footer);document.body.append(dialog);
  let preparing=false,abort=null,pdf=null,renderTask=null,previewTimer=0,previewIndex=0,previewFit={width:0,height:0},previewZoom=1,preferredPrinter='';
  const refreshPrinters=async()=>{
    if(!window.__TAURI__?.core?.invoke){printerGroup.hidden=true;return;}
    printerGroup.hidden=false;printerSelect.disabled=true;printerProperties.disabled=true;printerStatus.textContent='Đang tải máy in Windows…';
    try{
      const printers=await window.__TAURI__.core.invoke('reader_list_printers');
      printerSelect.replaceChildren();
      for(const item of printers||[])printerSelect.append(el('option',{value:item.name,textContent:item.is_default?item.name+' (Mặc định)':item.name}));
      const selected=(printers||[]).find(p=>p.name===preferredPrinter)||(printers||[]).find(p=>p.is_default)||(printers||[])[0];
      if(selected){printerSelect.value=selected.name;preferredPrinter=selected.name;printerStatus.textContent='Thuộc tính mở cài đặt driver Windows của máy đang chọn.';}
      else{printerSelect.append(el('option',{value:'',textContent:'Không tìm thấy máy in'}));printerStatus.textContent='Cài đặt hoặc kết nối máy in rồi bấm thử lại.';}
      printerSelect.disabled=!selected;printerProperties.disabled=!selected;
    }catch(error){printerSelect.replaceChildren(el('option',{value:'',textContent:'Không tải được danh sách máy in'}));printerStatus.textContent=String(error);printerSelect.disabled=true;printerProperties.disabled=true;}
  };
  printerSelect.onchange=()=>{preferredPrinter=printerSelect.value;};
  printerProperties.onclick=api.attempt(async()=>{
    if(!printerSelect.value)throw Error('Chọn máy in trước.');
    await window.__TAURI__.core.invoke('reader_open_printer_properties',{printerName:printerSelect.value});
    api.message('Đã mở thuộc tính driver của '+printerSelect.value+'.');
  });
  const rules=[],sheet=[...document.styleSheets].find(s=>s.href?.split('?')[0].endsWith('/reader.css'));
  const applyPreviewZoom=(center=true)=>{if(!previewFit.width||!previewFit.height)return;const w=Math.round(previewFit.width*previewZoom),h=Math.round(previewFit.height*previewZoom);preview.style.width=`${w}px`;preview.style.height=`${h}px`;zoomLabel.textContent=`${Math.round(previewZoom*100)}%`;requestAnimationFrame(()=>{if(center){previewViewport.scrollLeft=Math.max(0,(previewViewport.scrollWidth-previewViewport.clientWidth)/2);previewViewport.scrollTop=Math.max(0,(previewViewport.scrollHeight-previewViewport.clientHeight)/2);}});};
  const fitPreview=()=>{const c=preview,box=previewViewport.getBoundingClientRect();if(!c.width||!c.height||!box.width||!box.height)return;const fit=Math.min(1,(box.width-24)/c.width,(box.height-24)/c.height);previewFit={width:Math.max(1,c.width*fit),height:Math.max(1,c.height*fit)};previewZoom=1;applyPreviewZoom(false);previewViewport.scrollLeft=previewViewport.scrollTop=0;};
  const showPreview=()=>{const canvases=[...document.querySelectorAll('#readerPrintStage canvas')],stage=document.getElementById('readerPrintStage');previewIndex=Math.max(0,Math.min(previewIndex,canvases.length-1));const c=canvases[previewIndex];preview.hidden=!c;if(!c){pageLabel.textContent='';return;}preview.width=Math.max(1,Math.round(c.width*Math.min(1,1200/c.width)));preview.height=Math.max(1,Math.round(c.height*preview.width/c.width));preview.getContext('2d').drawImage(c,0,0,preview.width,preview.height);const offset=Number(stage?.dataset.offset)||0,total=Number(stage?.dataset.total)||canvases.length;pageLabel.textContent=`Tờ ${offset+previewIndex+1}/${total}`;prev.disabled=offset+previewIndex===0;next.disabled=offset+previewIndex>=total-1;fitPreview();};
  function cleanup(){clearTimeout(previewTimer);previewTimer=0;abort?.abort();renderTask?.cancel();for(const i of rules.splice(0).reverse())sheet?.deleteRule(i);const stage=document.getElementById('readerPrintStage');if(stage){for(const c of stage.querySelectorAll('canvas'))c.width=c.height=0;stage.remove();}if(pdf){void pdf.loadingTask.destroy();pdf=null;}preview.width=preview.height=0;preview.hidden=true;previewFit={width:0,height:0};previewZoom=1;zoomLabel.textContent='';}
  const close=()=>{cleanup();dialog.close();};cancel.onclick=close;dialog.addEventListener('cancel',cleanup);window.addEventListener('afterprint',cleanup);
  const movePreview=delta=>{const stage=document.getElementById('readerPrintStage');if(!stage||preparing)return;const offset=Number(stage.dataset.offset)||0,total=Number(stage.dataset.total)||1,current=offset+previewIndex,target=Math.max(0,Math.min(total-1,current+delta));if(target===current)return;if(stage.dataset.previewLimited==='true'){prev.disabled=next.disabled=true;pageLabel.textContent='';status.textContent=`Đang tạo bản xem trước tờ ${target+1}/${total}…`;void api.attempt(()=>prepare(false,true,target))();}else{previewIndex+=delta;showPreview();}};prev.onclick=()=>movePreview(-1);next.onclick=()=>movePreview(1);
  const enabledOptions=()=>{count.disabled=mode.value!=='multiple';percent.disabled=scale.value!=='custom'&&mode.value!=='tile';};enabledOptions();
  grid.addEventListener('change',()=>{enabledOptions();if(!preparing){cleanup();pageLabel.textContent='';status.textContent='Đang cập nhật bản xem trước…';previewTimer=window.setTimeout(()=>{previewTimer=0;if(dialog.open&&!preparing)void api.attempt(()=>prepare(false,true))();},350);}});
  const resetOptions=()=>{subset.value='all';range.value='all';parity.value='all';reverse.checked=false;paper.value='source';orientation.value='auto';mode.value='single';count.value='1';scale.value='fit';percent.value='100';margin.value='0';rotate.checked=true;quality.value='216';edits.checked=true;annotations.checked=true;forms.checked=true;gray.checked=false;copies.value='1';enabledOptions();};
  const prepare=async(doPrint,previewOnly=false,previewSheet=0)=>{
    const doc=api.current();if(!doc||preparing||api.busy)return;
    cleanup();abort=new AbortController();const signal=abort.signal;preparing=true;start.disabled=previewButton.disabled=true;grid.inert=true;
    try{
      const n=Number(percent.value),m=Number(margin.value)*72/25.4;if(!Number.isFinite(n)||n<10||n>400||!Number.isFinite(m)||m<0||m>50*72/25.4)throw Error('Tỷ lệ hoặc lề không hợp lệ.');
      let pages=window.QuickSign.pages(subset.value==='current'?String(doc.view.currentPageNumber):range.value.trim(),doc.pdf.numPages,doc.view.currentPageNumber-1);
      if(subset.value==='visible'){const bounds=doc.container.getBoundingClientRect();pages=[...doc.container.querySelectorAll('.page[data-page-number]')].filter(p=>{const r=p.getBoundingClientRect();return r.bottom>bounds.top&&r.top<bounds.bottom&&r.right>bounds.left&&r.left<bounds.right;}).map(p=>Number(p.dataset.pageNumber)-1);}
      pages=pages.filter(p=>parity.value==='all'||(p+1)%2===(parity.value==='odd'?1:0));if(reverse.checked)pages.reverse();
      const requestedPages=pages.length,previewLimited=previewOnly&&requestedPages>50;if(!pages.length||requestedPages>50&&!previewOnly)throw Error('Chọn từ 1 đến 50 trang cho mỗi đợt in.');
      const sourceBytes=await api.readSourceBytes(doc);let bytes;if(edits.checked&&forms.checked)bytes=await api.exportDocument(doc);
      else if(edits.checked){const unfilled=await api.pdfjs.getDocument({data:sourceBytes.slice(),isEvalSupported:false,enableXfa:false,...pdfAssetOptions}).promise;try{bytes=await api.exportDocument({...doc,pdf:unfilled,formDirty:false});}finally{await unfilled.loadingTask.destroy();}}
      else bytes=forms.checked&&doc.pdf.annotationStorage.size?await doc.pdf.saveDocument():sourceBytes.slice();
      if(forms.checked&&!annotations.checked){await api.ensurePdfLib();const flattened=await window.PDFLib.PDFDocument.load(bytes,{updateMetadata:false});flattened.getForm().flatten({updateFieldAppearances:false});bytes=await flattened.save();}
      signal.throwIfAborted();pdf=await api.pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,...pdfAssetOptions}).promise;
      const sizes={},sourcePages={};for(const index of pages){signal.throwIfAborted();const p=await pdf.getPage(index+1);sourcePages[index]=p;const v=p.getViewport({scale:1});sizes[index]=[v.width,v.height];}
      let size=({a4:[595.276,841.89],letter:[612,792],a3:[841.89,1190.551]})[paper.value]||null;if(size&&orientation.value!=='auto'){size.sort((a,b)=>a-b);if(orientation.value==='landscape')size.reverse();}
      if(mode.value!=='single'&&!size)throw Error('Chọn khổ giấy cố định cho bố trí nhiều trang, sách hoặc chia trang.');
      const plan=sheets(pages,sizes,{mode:mode.value,nup:mode.value==='multiple'?Number(count.value):1,paper:size,scale:scale.value,percent:n,margin:m,rotate:rotate.checked,orientation:orientation.value});if(plan.length>100&&!previewLimited)throw Error('Quá 100 tờ in; chọn ít trang hoặc khổ giấy lớn hơn.');const renderPlan=previewLimited?[plan[Math.max(0,Math.min(previewSheet,plan.length-1))]]:plan,requestedDpi=Number(quality.value),density=printPageDensity(renderPlan,requestedDpi),effectiveDpi=Math.max(1,Math.floor(density*72)),resolutionNote=effectiveDpi<requestedDpi?'Độ phân giải tự điều chỉnh còn '+effectiveDpi+' dpi để giữ đủ '+renderPlan.length+' tờ trong bộ nhớ (mục tiêu '+requestedDpi+' dpi).':'';
      const stage=el('section',{id:'readerPrintStage'});stage.dataset.total=String(plan.length);stage.dataset.offset=String(previewLimited?previewSheet:0);stage.dataset.previewLimited=String(previewLimited);document.body.append(stage);let pixels=0;
      for(const [i,layout]of renderPlan.entries()){
        signal.throwIfAborted();const [w,h]=layout.size;
        const canvas=el('canvas');canvas.width=Math.floor(w*density);canvas.height=Math.floor(h*density);pixels+=canvas.width*canvas.height;if(pixels>80_000_000)throw Error('Bản in quá lớn; chọn ít trang hơn.');
        const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(density,density);ctx.beginPath();ctx.rect(...layout.clip);ctx.clip();
        for(const item of layout.items){
          signal.throwIfAborted();const p=sourcePages[item.index],v=p.getViewport({scale:1,rotation:(p.rotate+(item.turn?90:0))%360}),factor=Math.min(density*item.width/v.width,Math.sqrt(12_000_000/(v.width*v.height))),view=p.getViewport({scale:factor,rotation:v.rotation});
          const scratch=el('canvas');scratch.width=Math.max(1,Math.floor(view.width));scratch.height=Math.max(1,Math.floor(view.height));
          renderTask=p.render({canvasContext:scratch.getContext('2d'),viewport:view,intent:'print',annotationMode:annotations.checked?api.pdfjs.AnnotationMode.ENABLE_STORAGE:api.pdfjs.AnnotationMode.DISABLE,printAnnotationStorage:pdf.annotationStorage.print});
          const stop=()=>renderTask?.cancel();signal.addEventListener('abort',stop,{once:true});try{await renderTask.promise;}finally{signal.removeEventListener('abort',stop);}signal.throwIfAborted();ctx.drawImage(scratch,item.x,item.y,item.width,item.height);scratch.width=scratch.height=0;
        }
        ctx.restore();if(gray.checked){const image=ctx.getImageData(0,0,canvas.width,canvas.height);for(let k=0;k<image.data.length;k+=4){const g=Math.round(image.data[k]*.2126+image.data[k+1]*.7152+image.data[k+2]*.0722);image.data[k]=image.data[k+1]=image.data[k+2]=g;}ctx.putImageData(image,0,0);}
        const wrapper=el('div',{className:'reader-print-page'});wrapper.style.width=w+'pt';wrapper.style.height=h+'pt';wrapper.dataset.page=layout.items.map(x=>x.index+1).join(',');if(sheet){const name='readerSheet'+i;rules.push(sheet.cssRules.length);sheet.insertRule(`@page ${name}{size:${w}pt ${h}pt;margin:0}`,sheet.cssRules.length);wrapper.style.page=name;if(i===0)stage.style.page=name;}wrapper.append(canvas);stage.append(wrapper);status.textContent=(resolutionNote?resolutionNote+' ':'')+`Đã chuẩn bị ${i+1}/${renderPlan.length} tờ.`;
      }
      stage.dataset.pixels=String(pixels);previewIndex=0;showPreview();if(previewLimited)status.textContent=`Đang xem trước tờ ${previewSheet+1}/${plan.length}. Chọn tối đa 50 trang để in mỗi đợt.`;signal.throwIfAborted();
      if(doPrint){const copiesValue=Number(copies.value);if(!Number.isInteger(copiesValue)||copiesValue<1||copiesValue>999)throw Error('Số bản in phải từ 1 đến 999.');if(window.__TAURI__?.core?.invoke&&!printerSelect.value)throw Error('Chọn máy in trước khi in.');dialog.close();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));signal.throwIfAborted();if(window.__TAURI__?.core?.invoke){await window.__TAURI__.core.invoke('reader_print',{printerName:printerSelect.value,copies:copiesValue});cleanup();api.message('Đã gửi '+copiesValue+' bản tới '+printerSelect.value+'.');}else{window.print();api.message('Đã mở hộp thoại in.');}}
    }catch(error){cleanup();if(error.name!=='AbortError'&&error.name!=='RenderingCancelledException')throw error;}
    finally{preparing=false;grid.inert=false;start.disabled=previewButton.disabled=false;}
  };
  const printDefault=async()=>{if(!api.current()){api.message('Mở PDF trước.');return;}if(preparing||api.busy)return;cleanup();resetOptions();status.textContent='Đang chuẩn bị xem trước.';dialog.showModal();await refreshPrinters();await prepare(false,true);};
  const openLayout=()=>{if(!api.current()){api.message('Mở PDF trước.');return;}if(preparing||api.busy)return;cleanup();resetOptions();status.textContent='Đang tạo bản xem trước…';dialog.showModal();void refreshPrinters();void api.attempt(()=>prepare(false,true))();};
  start.onclick=api.attempt(()=>prepare(true));previewButton.onclick=api.attempt(()=>prepare(false,true));
  return {print:printDefault,openLayout};
}
