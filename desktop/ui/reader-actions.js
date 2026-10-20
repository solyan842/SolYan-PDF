import {t} from './reader-language.js';
// Browser-only document transfer is loaded on demand; Windows native Reader uses IPC.
const $=id=>document.getElementById(id);
const element=(tag,props={})=>Object.assign(document.createElement(tag),props);
export function installReaderActions(api){
  let preparing=false,printPdf=null;const printRules=[],printSheet=[...document.styleSheets].find(s=>s.href?.split('?')[0].endsWith('/reader.css'));
  const dialog=element('dialog',{id:'readerPrintDialog'}),range=element('input',{id:'printRange',value:'all',ariaLabel:'Trang cần in'}),quality=element('select',{id:'printQuality',ariaLabel:'Độ phân giải bản in'});
  for(const dpi of [144,216])quality.append(element('option',{value:String(dpi),textContent:dpi+' dpi'}));
  const start=element('button',{id:'printStart',textContent:'In…',className:'primary'}),cancel=element('button',{textContent:'Đóng'});
  cancel.onclick=()=>dialog.close();
  dialog.append(element('h2',{textContent:'In PDF'}),element('p',{textContent:'In bản làm việc gồm biểu mẫu và phần đã chèn. PDF nguồn không thay đổi.'}),element('label',{textContent:'Trang cần in (all hoặc 1,3-5)'}),range,quality,element('p',{textContent:'Tối đa 50 trang và 80 triệu điểm ảnh mỗi đợt. Chọn khoảng nhỏ hơn khi tài liệu lớn.'}),start,cancel);document.body.append(dialog);
  const print=element('button',{id:'printDocument',textContent:'In PDF…    Ctrl+P'});$('readerMenuPanel').prepend(print);
  const forms=element('button',{id:'fillForm',textContent:'Điền biểu mẫu PDF'});$('readerMenuPanel').prepend(forms);forms.onclick=api.attempt(async()=>{const doc=api.current();if(!doc)throw Error('Mở PDF trước.');const fields=await doc.pdf.getFieldObjects();const field=[...(fields?.values()||[])].flat().find(x=>x.type!=='Sig'&&x.editable&&Number.isInteger(x.page)&&x.page>=0);if(!field){api.message(t('PDF này không có trường biểu mẫu có thể điền.'));return;}doc.view.currentPageNumber=field.page+1;doc.view.update();api.message(t('Nhấn vào trường trên trang để điền; dùng Tab để chuyển trường.'));});
  print.onclick=()=>{if(!api.current()){api.message(t('Mở PDF trước.'));return;}range.value='all';dialog.showModal();};
  function cleanup(){for(const index of printRules.splice(0).reverse())printSheet.deleteRule(index);const stage=$('readerPrintStage');if(stage){for(const canvas of stage.querySelectorAll('canvas'))canvas.width=canvas.height=0;stage.remove();}if(printPdf){void printPdf.loadingTask.destroy();printPdf=null;}}
  window.addEventListener('afterprint',cleanup);
  start.onclick=api.attempt(async()=>{
    const doc=api.current();if(!doc||preparing||api.busy)return;preparing=true;start.disabled=true;cleanup();
    try{
      const pages=window.QuickSign.pages(range.value.trim(),doc.pdf.numPages,doc.view.currentPageNumber-1);
      if(!pages.length||pages.length>50)throw Error('Chọn từ 1 đến 50 trang cho mỗi đợt in.');
      const bytes=await api.exportDocument(doc),pdf=printPdf=await api.pdfjs.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,wasmUrl:'./vendor/pdfjs/wasm/'}).promise;
      const stage=element('section',{id:'readerPrintStage'});document.body.append(stage);let pixels=0;
      for(const index of pages){
        const page=await pdf.getPage(index+1),base=page.getViewport({scale:1}),scale=Math.min(Number(quality.value)/72,Math.sqrt(12_000_000/(base.width*base.height))),viewport=page.getViewport({scale});
        const canvas=element('canvas');canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);pixels+=canvas.width*canvas.height;
        if(pixels>80_000_000)throw Error('Bản in quá lớn; chọn ít trang hơn.');
        const paper=element('div',{className:'reader-print-page'});paper.style.width=base.width+'pt';paper.style.height=base.height+'pt';paper.dataset.page=String(index+1);if(printSheet){const name='readerPrint'+index;printRules.push(printSheet.cssRules.length);printSheet.insertRule('@page '+name+' {size:'+base.width+'pt '+base.height+'pt;margin:0}',printSheet.cssRules.length);paper.style.page=name;if(index===pages[0])stage.style.page=name;}paper.append(canvas);stage.append(paper);
        await page.render({canvasContext:canvas.getContext('2d'),viewport,intent:'print',annotationMode:api.pdfjs.AnnotationMode.ENABLE_STORAGE}).promise;
      }
      stage.dataset.pixels=String(pixels);dialog.close();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      window.print();
      api.message(t('Đã mở hộp thoại in.'));
    }catch(error){cleanup();throw error;}finally{preparing=false;start.disabled=false;}
  });
  document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key.toLowerCase()==='p'){event.preventDefault();if(!dialog.open)print.click();}});
  $('tools').onclick=api.attempt(async event=>{
    event.preventDefault();if(preparing||api.busy)return;const doc=api.current();
    if(!doc){if(window.__TAURI__?.core)await window.__TAURI__.core.invoke('desktop_switch_tools');else location.href='./index.html';return;}
    preparing=true;
    try{const bytes=await api.exportDocument(doc);if(window.__TAURI__?.core)await window.__TAURI__.core.invoke('desktop_switch_tools',{bytes:Array.from(bytes),name:doc.name});else{const {putTransfer}=await import('./document-transfer.js');const token=await putTransfer(new File([bytes],doc.name,{type:'application/pdf'}));window.open('./handoff.html?transfer='+token,'_blank','noopener');}api.message(t('Đã chuyển bản làm việc sang sTool PDF.'));}finally{preparing=false;}
  });
  const transfer=new URLSearchParams(location.search).get('transfer');if(transfer)void api.attempt(async()=>{const {takeTransfer}=await import('./document-transfer.js');const file=await takeTransfer(transfer);await api.openFile(file);history.replaceState(null,'',location.pathname);})();
}
