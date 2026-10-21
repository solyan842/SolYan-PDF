// Capture both PDF.js annotations and recognized text links, including new-tab
// and middle-click paths. Internal PDF destinations remain PDF.js's responsibility.
export function linkifyText(container){
  for(const span of container.querySelectorAll('.textLayer span')){
    if(span.childNodes.length!==1||span.firstChild.nodeType!==Node.TEXT_NODE)continue;
    const text=span.textContent,re=/https?:\/\/[^\s<>]+/g;let match,last=0;const fragment=document.createDocumentFragment();
    while((match=re.exec(text))){fragment.append(document.createTextNode(text.slice(last,match.index)));const a=document.createElement('a');a.href=match[0];a.textContent=match[0];a.className='reader-detected-link';fragment.append(a);last=re.lastIndex;}
    if(last){fragment.append(document.createTextNode(text.slice(last)));span.replaceChildren(fragment);}
  }
}
export function installLinkGuard({message}){
  let pending=false;
  const intercept=async event=>{
    const a=event.target.closest?.('.readerContainer a[href]');if(!a)return;
    const href=a.getAttribute('href');if(!href||href.startsWith('#'))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(pending)return;pending=true;
    try{
      if(!window.__TAURI__?.core){message('Liên kết bị chặn. Chỉ bản Windows có thể xác nhận và mở trình duyệt ngoài.');return;}
      const result=await window.__TAURI__.core.invoke('reader_open_pdf_link',{address:a.href});
      message(result==='opened'?'Đã mở liên kết trong trình duyệt ngoài.':'Không mở liên kết.');
    }catch(error){message(String(error));}finally{pending=false;}
  };
  document.addEventListener('click',intercept,true);
  document.addEventListener('auxclick',intercept,true);
  // PDF.js assigns externalLinkEnabled=false anchors a click handler that cancels
  // clicks. Our capture hook still sees them; they never get native navigation.
}
