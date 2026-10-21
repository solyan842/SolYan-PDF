import {installReaderPrint} from './reader-print.js';
import {t} from './reader-language.js';
// Browser-only document transfer is loaded on demand; Windows native Reader uses IPC.
const $=id=>document.getElementById(id);
const element=(tag,props={})=>Object.assign(document.createElement(tag),props);
export function installReaderActions(api){
  let preparing=false;
  installReaderPrint(api);
  const forms=element('button',{id:'fillForm',textContent:'Điền biểu mẫu PDF'});$('readerMenuPanel').prepend(forms);
  forms.onclick=api.attempt(async()=>{const doc=api.current();if(!doc)throw Error('Mở PDF trước.');const fields=await doc.pdf.getFieldObjects();const field=[...(fields?.values()||[])].flat().find(x=>x.type!=='Sig'&&x.editable&&Number.isInteger(x.page)&&x.page>=0);if(!field){api.message(t('PDF này không có trường biểu mẫu có thể điền.'));return;}doc.view.currentPageNumber=field.page+1;doc.view.update();api.message(t('Nhấn vào trường trên trang để điền; dùng Tab để chuyển trường.'));});
  $('tools').onclick=api.attempt(async event=>{
    event.preventDefault();if(preparing||api.busy)return;const doc=api.current();
    if(!doc){if(window.__TAURI__?.core)await window.__TAURI__.core.invoke('desktop_switch_tools');else location.href='./index.html';return;}
    preparing=true;
    try{const bytes=await api.exportDocument(doc);if(window.__TAURI__?.core)await window.__TAURI__.core.invoke('desktop_switch_tools',{bytes:Array.from(bytes),name:doc.name});else{const {putTransfer}=await import('./document-transfer.js');const token=await putTransfer(new File([bytes],doc.name,{type:'application/pdf'}));window.open('./handoff.html?transfer='+token,'_blank','noopener');}api.message(t('Đã chuyển bản làm việc sang sTool PDF.'));}finally{preparing=false;}
  });
  const transfer=new URLSearchParams(location.search).get('transfer');if(transfer)void api.attempt(async()=>{const {takeTransfer}=await import('./document-transfer.js');const file=await takeTransfer(transfer);await api.openFile(file);history.replaceState(null,'',location.pathname);})();
}
