// Native-only Reader history and session. Never persist a filesystem path in
// localStorage, and never turn a webview string into a native file read.
import {t} from './reader-language.js';
const $=id=>document.getElementById(id);
const el=(tag,props={})=>Object.assign(document.createElement(tag),props);
export function installReaderSession({native,documents,current,activate,message,attempt}){
  if(!native?.core||!native?.event)return null;
  const invoke=(command,args)=>native.core.invoke(command,args);
  let ready=false,timer=null,tail=Promise.resolve(),restoring=new Map();
  const dialog=el('dialog',{id:'readerRecentDialog'});
  const heading=el('h2',{textContent:'Tệp PDF gần đây'});
  const note=el('p',{textContent:'Chỉ lưu đường dẫn và vị trí đọc trong hồ sơ sReader trên máy này. Không lưu nội dung PDF hoặc thay đổi chưa lưu.'});
  const list=el('div',{id:'readerRecentList'});
  const clear=el('button',{id:'readerRecentClear',textContent:'Xóa lịch sử'});
  clear.onclick=attempt(async()=>{await flush();await invoke('reader_session_clear_recent');await refresh();});
  const close=el('button',{id:'readerRecentClose',textContent:'Đóng'});
  close.onclick=()=>dialog.close();
  const actions=el('div',{className:'reader-recent-actions'});
  actions.append(clear,close);
  dialog.append(heading,note,list,actions);document.body.append(dialog);
  const button=el('button',{id:'recentFiles',textContent:'Tệp PDF gần đây…'});
  $('readerMenuPanel').append(button);
  const viewOf=d=>{
    // A hidden tab can still be awaiting PDF.js pagesinit. Never replace its
    // saved page/zoom with the uninitialized viewer defaults during a flush.
    if(d.readerPendingRestore)return [...d.readerPendingRestore];
    if(d.container.hidden&&d.readerInactiveView)return [...d.readerInactiveView];
    return [d.source,Math.max(1,Math.round(d.view?.currentPageNumber||1)),
      Math.max(.25,Math.min(4,Number(d.view?.currentScale)||1)),
      Math.max(0,Math.round(d.container?.scrollLeft||0)),
      Math.max(0,Math.round(d.container?.scrollTop||0))];
  };
  function touch(){
    if(!ready)return;
    clearTimeout(timer);
    timer=setTimeout(()=>{void flush();},300);
  }
  function flush(){
    clearTimeout(timer);timer=null;
    if(!ready)return tail;
    const tabs=[...documents.values()].filter(d=>typeof d.source==='string').slice(0,12).map(viewOf);
    const active=typeof current()?.source==='string'?current().source:null;
    // Serialized writes: a delayed older snapshot can never replace a newer one.
    tail=tail.catch(()=>{}).then(()=>invoke('reader_session_save',{tabs,active}));
    return tail.catch(e=>message(t('Không lưu được phiên đọc PDF: ')+String(e?.message||e)));
  }
  async function recent(){
    const rows=await invoke('reader_session_recent');
    return Array.isArray(rows)?rows:[];
  }
  async function refresh(){
    list.replaceChildren();
    const entries=await recent();
    if(!entries.length){list.append(el('p',{textContent:t('Chưa có PDF gần đây.')}));return;}
    for(const entry of entries){
      const [index,name,path,missing,page]=entry;
      const item=el('div',{className:'reader-recent-row'});
      const open=el('button',{className:'reader-recent-open'});
      const title=el('strong',{textContent:name});
      const location=el('span',{textContent:path});
      const info=el('small',{textContent:missing?t('Không tìm thấy tệp'):t('Trang')+' '+page});
      open.append(title,location,info);
      open.title=path;open.disabled=Boolean(missing);
      open.onclick=attempt(async()=>{
        const ok=await invoke('reader_session_open_recent',{index});
        if(ok)dialog.close();
      });
      item.append(open);list.append(item);
    }
  }
  button.onclick=attempt(async()=>{
    await refresh();heading.textContent=t('Tệp PDF gần đây');
    note.textContent=t('Chỉ lưu đường dẫn và vị trí đọc trong hồ sơ sReader trên máy này. Không lưu nội dung PDF hoặc thay đổi chưa lưu.');
    dialog.showModal();
  });
  function prepare(tabs){
    restoring=new Map();
    for(const row of tabs||[]){
      if(Array.isArray(row)&&typeof row[0]==='string')restoring.set(row[0],row);
    }
  }
  function applyRestore(doc){
    const row=doc?.readerPendingRestore;
    if(!ready||!row||!doc.readerPagesReady||current()?.id!==doc.id||!doc.container.isConnected)return;
    const [,page,zoom,left,top]=row;
    const requestedPage=Math.min(doc.pdf.numPages,Math.max(1,Number(page)||1));
    doc.readerPendingRestore=null;
    // A PDFViewer initialized while its tab was hidden can reset the page to
    // one on activation. Restore only when the tab is visible and pagesinit
    // has fired; keep other tabs' saved positions until first activation.
    doc.view.currentPageNumber=requestedPage;
    doc.view.update();
    doc.view.currentScaleValue=String(Math.max(.25,Math.min(4,Number(zoom)||1)));
    doc.view.update();
    doc.view.currentPageNumber=requestedPage;
    // PDF.js updates page dimensions synchronously when scaling. Apply the
    // offsets in this activation task, before accepting the next user input.
    // A deferred animation-frame restore can overwrite a newer page/zoom jump.
    doc.container.scrollLeft=Math.max(0,Number(left)||0);
    // Older sessions could record zero while a hidden tab was on page >1.
    // In that case retain PDF.js's requested-page position.
    if(Number(top)>0||requestedPage===1)doc.container.scrollTop=Math.max(0,Number(top)||0);
    touch();
  }
  function opened(doc){
    doc.container.addEventListener('scroll',touch,{passive:true});
    doc.readerPendingRestore=restoring.get(doc.source)||null;
    doc.readerPagesReady=false;
    doc.bus.on('pagesinit',()=>{
      doc.readerPagesReady=true;
      applyRestore(doc);
    });
    touch();
  }
  // display:none resets the container's measured scroll offsets. Capture the
  // visible position before hiding, then reuse it for flushes and reactivation.
  function deactivated(doc){doc.readerInactiveView=viewOf(doc);}
  function activated(doc){
    doc.readerPendingRestore ||= doc.readerInactiveView;
    doc.readerInactiveView=null;applyRestore(doc);
  }
  function focus(key){
    const doc=[...documents.values()].find(d=>d.source===key);
    if(doc)activate(doc.id);
  }
  function finish(skipped=0){
    // Startup opens each restored tab temporarily. Only restore the final
    // active tab now; the others retain their rows until selected by the user.
    ready=true;restoring.clear();applyRestore(current());touch();
    if(skipped>0)message(t('Đã bỏ qua PDF không còn tồn tại: ')+skipped);
  }
  return {opened,activated,deactivated,touch,flush,prepare,focus,finish,refresh};
}
