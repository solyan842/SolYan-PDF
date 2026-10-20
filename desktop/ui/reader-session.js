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
  const viewOf=d=>[d.source,Math.max(1,Math.round(d.view?.currentPageNumber||1)),
    Math.max(.25,Math.min(4,Number(d.view?.currentScale)||1)),
    Math.max(0,Math.round(d.container?.scrollLeft||0)),
    Math.max(0,Math.round(d.container?.scrollTop||0))];
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
  function opened(doc){
    doc.container.addEventListener('scroll',touch,{passive:true});
    const restored=restoring.get(doc.source);
    if(restored){
      const [,page,zoom,left,top]=restored;
      doc.bus.on('pagesinit',()=>{
        if(!doc.container.isConnected)return;
        doc.view.currentPageNumber=Math.min(doc.pdf.numPages,Math.max(1,page));
        // PDF.js needs its page location refreshed before changing zoom;
        // otherwise rapid page->zoom can jump back to the previous page.
        doc.view.update();
        doc.view.currentScaleValue=String(Math.max(.25,Math.min(4,zoom)));
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          if(doc.container.isConnected){
            doc.container.scrollLeft=Math.max(0,left);
            doc.container.scrollTop=Math.max(0,top);
          }
        }));
      });
    }
    touch();
  }
  function focus(key){
    const doc=[...documents.values()].find(d=>d.source===key);
    if(doc)activate(doc.id);
  }
  function finish(skipped=0){
    ready=true;restoring.clear();touch();
    if(skipped>0)message(t('Đã bỏ qua PDF không còn tồn tại: ')+skipped);
  }
  return {opened,touch,flush,prepare,focus,finish,refresh};
}
