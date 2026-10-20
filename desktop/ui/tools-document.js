import {putTransfer,takeTransfer} from './document-transfer.js';
export async function sendReader(file){
  if(window.__TAURI__?.core){await window.__TAURI__.core.invoke('desktop_open_reader',{bytes:Array.from(new Uint8Array(await file.arrayBuffer())),name:file.name});return;}
  const token=await putTransfer(file);window.open('./reader.html?transfer='+token,'_blank','noopener');
}
// This adapter supplies the existing input/change and download paths. It never runs an engine.
const input=document.querySelector('input[type=file][accept*="pdf"]');
if(input){
  let current=null,result=null;
  const host=document.querySelector('.tool-top')||input.parentElement,button=document.createElement('button'),status=document.createElement('span');
  button.id='sendDocumentReader';button.className='secondary-button';button.textContent='Mở PDF trong sReader';button.disabled=true;status.setAttribute('role','status');host.append(button,status);
  input.addEventListener('change',()=>{current=input.files[0]||null;result=null;button.disabled=!current;button.textContent='Mở PDF trong sReader';});
  document.addEventListener('click',event=>{const link=event.target.closest('a[download]');if(!link?.href.startsWith('blob:'))return;void (async()=>{try{const blob=await(await fetch(link.href)).blob();if(await blob.slice(0,5).text()!=='%PDF-')return;result=new File([blob],link.download||'result.pdf',{type:'application/pdf'});button.textContent='Mở kết quả trong sReader';button.disabled=false;}catch{}})();},true);
  button.onclick=async()=>{const file=result||current;if(!file)return;button.disabled=true;try{await sendReader(file);status.textContent='Đã mở bản sao trong sReader.';}catch(e){status.textContent=e.message||String(e);}finally{button.disabled=false;}};
  const token=new URLSearchParams(location.search).get('transfer');if(token)void(async()=>{try{const file=await takeTransfer(token),data=new DataTransfer();data.items.add(file);input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));const url=new URL(location.href);url.searchParams.delete('transfer');history.replaceState(null,'',url);}catch(e){status.textContent=e.message;}})();
}
