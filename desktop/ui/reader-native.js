// The notification is only a hint. Native requests survive until this bridge drains them.
export async function connectNativeReader({native, find, activate, open, message}) {
  if (!native?.core || !native?.event) return;
  let draining=false, again=false;
  const invoke=(name,args)=>native.core.invoke(name,args);
  const drain=async()=>{
    if(draining){again=true;return;}
    draining=true;
    try {
      do {
        again=false;
        let request;
        while((request=await invoke('reader_next_open_request'))){
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
  return unlisten;
}
