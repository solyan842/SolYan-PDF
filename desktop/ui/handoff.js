import {putTransfer,takeTransfer} from './document-transfer.js';
import {sendReader} from './tools-document.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
try{
  let file;const native=params.get('native');
  if(native){if(!window.__TAURI__?.core)throw Error('Native transfer unavailable.');const [name,bytes]=await window.__TAURI__.core.invoke('desktop_take_handoff',{token:native});file=new File([Uint8Array.from(bytes)],name,{type:'application/pdf'});}
  else file=await takeTransfer(params.get('transfer')||'');
  history.replaceState(null,'',location.pathname);$('transferName').textContent=file.name;$('transferStatus').textContent='Chọn thao tác để tiếp tục với bản PDF này.';
  for(const [route,label]of [['merge.html','Nối PDF'],['repair.html','Sửa PDF'],['info.html','Thông tin PDF'],['transform.html?tool=compress','Nén PDF'],['security-transform.html?tool=protect','Bảo vệ PDF'],['ocr.html','OCR PDF']]){
    const button=document.createElement('button');button.textContent=label;button.className='secondary-button';button.dataset.route=route;button.onclick=async()=>{try{const token=await putTransfer(file);location.href='./'+route+(route.includes('?')?'&':'?')+'transfer='+token;}catch(e){$('transferStatus').textContent=e.message;}};$('transferTools').append(button);
  }
  $('transferReader').disabled=false;$('transferReader').onclick=()=>sendReader(file).catch(e=>$('transferStatus').textContent=e.message);
}catch(error){$('transferName').textContent='Không nhận được PDF';$('transferStatus').textContent=error.message;}
