// The notification is only a hint. Native requests survive until this bridge drains them.
export async function connectNativeReader({native, find, activate, open, message, hasOpen, session}) {
  if (!native?.core || !native?.event) return;
  let draining=false, again=false, received=false;
  const invoke=(name,args)=>native.core.invoke(name,args);
  const drain=async()=>{
    if(draining){again=true;return;}
    draining=true;
    try {
      do {
        again=false;
        let request;
        while((request=await invoke('reader_next_open_request'))){
          received=true;
          const [ticket,source,name,error]=request;
          if(error){message(error);continue;}
          try {
            const existing=find(source);
            if(existing){await invoke('reader_discard_open_request',{ticket});activate(existing.id);continue;}
            const bytes=await invoke('reader_read_open_request',{ticket});
            await open(new File([Uint8Array.from(bytes)],name,{type:'application/pdf'}),source);
          } catch(error) { message(`Không mở được PDF: ${typeof error==='string'?error:error.message}`); }
        }
      } while(again);
    } catch(error) { message(`Không nhận được tệp: ${typeof error==='string'?error:error.message}`); }
    finally {draining=false;}
  };
  // Register before the first drain: requests arriving during startup cannot be lost.
  const unlisten=await native.event.listen('reader-open-pending',drain);
  await drain();
  // Never restore old tabs when Explorer / Open With supplied a new file.
  if(!received&&!hasOpen?.()&&session){
    try{
      const restored=await invoke('reader_session_restore');
      if(Array.isArray(restored)){
        const [tabs,active,missing]=restored;
        session.prepare(tabs);
        if(Array.isArray(tabs)&&tabs.length)await drain();
        if(typeof active==='string')session.focus(active);
        session.finish(Number(missing)||0);
      }else session.finish();
    }catch(error){message('Không thể khôi phục phiên đọc: '+String(error?.message||error));session.finish();}
  }else session?.finish();
  return unlisten;
}
