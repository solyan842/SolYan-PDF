// Shared result shelf. Runs before tool scripts, but does no processing at Home.
(()=>{
  const bypass=new WeakSet(),sourceHashes=new Set(),blobs=new Map();let sourceNames=[];
  const createObjectURL=URL.createObjectURL.bind(URL),revokeObjectURL=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=createObjectURL(blob);blobs.set(url,blob);return url;};
  URL.revokeObjectURL=url=>{blobs.delete(url);return revokeObjectURL(url);};
  let pendingSources=Promise.resolve(),queue=Promise.resolve(),shelf;
  const english=()=>document.documentElement.lang==='en';
  const label=(vi,en)=>english()?en:vi;
  function remember(files){
    const selected=Array.from(files||[]).filter(f=>f?.name);
    if(selected.length)sourceNames=selected.map(file=>file.name);
    const pdfs=selected.filter(f=>/\.pdf$/i.test(f.name));
    pendingSources=Promise.all([pendingSources,...pdfs.map(async file=>{
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      sourceHashes.add(Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''));
    })]);
    pendingSources.catch(()=>{});
  }
  document.addEventListener('change',e=>{if(e.target?.type==='file'){const files=Array.from(e.target.files||[]),isPdfPicker=/\.pdf/i.test(e.target.accept||'');if(isPdfPicker&&!files.length)sourceNames=[];remember(files);}},true);
  document.addEventListener('drop',e=>remember(e.dataTransfer?.files),true);
  function message(row,text,kind=''){
    row.status.textContent=text;row.status.className='status-text'+(kind?' '+kind:'');
  }
  async function save(row,saveAs){
    if(row.busy)return;
    row.busy=true;row.save.disabled=row.as.disabled=true;
    message(row,label('Đang lưu kết quả…','Saving output…'));
    try{
      await pendingSources;
      const invoke=window.__TAURI__?.core?.invoke;
      if(invoke){
        const path=await invoke('stool_save_output',{bytes:Array.from(new Uint8Array(await row.blob.arrayBuffer())),name:row.name,id:row.id,saveAs,sourceHashes:Array.from(sourceHashes)});
        if(path===null){message(row,label('Đã hủy lưu. Kết quả vẫn sẵn sàng để lưu lại.','Save cancelled. Output is still available.'));return;}
        row.path=path;message(row,label('Đã lưu: ','Saved: ')+path,'success');
      }else{
        const url=URL.createObjectURL(row.blob),a=document.createElement('a');
        a.href=url;a.download=row.name;bypass.add(a);document.body.append(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
        message(row,label('Đã gửi tệp tới trình duyệt để lưu.','Sent to browser for saving.'));
      }
    }catch(error){message(row,label('Không lưu được: ','Save failed: ')+(error?.message||error),'error');}
    finally{row.busy=false;row.save.disabled=row.as.disabled=false;}
  }
  async function offer(url,name){
    const blob=blobs.get(url);if(!blob)throw Error('Output Blob unavailable');blobs.delete(url);
    const placeholder=/^solyan(?:-([a-z0-9][a-z0-9_-]*))?(\.[a-z0-9]+)$/i.exec(String(name||''));
    if(placeholder&&sourceNames.length&&window.SOLYAN_OUTPUT_NAME){let suffix=(placeholder[1]||'').replace(/^pdf-/i,'').replace(/^pdf$/i,'');name=window.SOLYAN_OUTPUT_NAME(sourceNames[0],suffix,placeholder[2])}
    if(!shelf){
      shelf=document.createElement('section');shelf.id='output-results';shelf.className='surface output-results';
      const title=document.createElement('h2');title.textContent=label('Kết quả — Lưu tệp','Results — Save files');shelf.append(title);
      (document.querySelector('.tool-main')||document.body).append(shelf);
    }
    const node=document.createElement('article');node.className='output-result';
    const filename=document.createElement('strong');filename.textContent=name;
    const actions=document.createElement('div');actions.className='output-result-actions';
    const saveButton=document.createElement('button'),asButton=document.createElement('button'),status=document.createElement('p');
    saveButton.type=asButton.type='button';saveButton.className='primary output-save';asButton.className='secondary-button output-save-as';
    saveButton.textContent=label('Lưu','Save');asButton.textContent=label('Lưu thành…','Save As…');
    status.setAttribute('role','status');
    const row={blob,name,id:crypto.randomUUID(),node,status,save:saveButton,as:asButton,busy:false,path:null};
    saveButton.addEventListener('click',()=>save(row,false));asButton.addEventListener('click',()=>save(row,true));
    actions.append(saveButton,asButton);node.append(filename,actions,status);shelf.append(node);
    message(row,label('Chưa lưu. Chọn Lưu hoặc Lưu thành để chọn nơi lưu.','Not saved. Choose Save or Save As to select a destination.'));
    shelf.scrollIntoView({block:'nearest'});
  }
  document.addEventListener('click',event=>{
    const a=event.target?.closest?.('a[download]');
    if(!a||bypass.has(a)||!a.href.startsWith('blob:'))return;
    event.preventDefault();
    // Start reading before the producing tool revokes its object URL.
    const reading=offer(a.href,a.download||'solyan-output.pdf');
    queue=queue.then(()=>reading).catch(error=>{
      const status=document.querySelector('#status');if(status){status.textContent=label('Không chuẩn bị được kết quả: ','Could not prepare output: ')+(error?.message||error);status.classList.add('error');}
    });
  },true);
})();
