// The notification is only a hint. Native requests survive until this bridge drains them.
export async function connectNativeReader({native, find, activate, open, prepareOpen, printFile, message, hasOpen, session}) {
  if (!native?.core || !native?.event) return;
  let draining=false, again=false, received=false, printDraining=false, printAgain=false, printFailed=false;
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
            const [bytes,runtime]=await Promise.all([
              invoke('reader_read_open_request',{ticket}),
              prepareOpen?prepareOpen():Promise.resolve(null)
            ]);
            await open(bytes,source,name,runtime);
          } catch(error) { message(`Không mở được PDF: ${typeof error==='string'?error:error.message}`); }
        }
      } while(again);
    } catch(error) { message(`Không nhận được tệp: ${typeof error==='string'?error:error.message}`); }
    finally {draining=false;}
  };
  const drainPrint=async()=>{
    if(printDraining){printAgain=true;return;}
    printDraining=true;
    try{
      do{
        printAgain=false;let request;
        while((request=await invoke('reader_next_print_request'))){
          received=true;const [ticket,source,name,error]=request;
          if(error){printFailed=true;message(error);continue;}
          try{
            const [bytes,runtime]=await Promise.all([invoke('reader_read_print_request',{ticket}),prepareOpen?prepareOpen():Promise.resolve(null)]);
            await printFile(bytes,source,name,runtime);
          }catch(error){printFailed=true;message('Không in được '+name+': '+String(error?.message||error));}
          finally{try{await invoke('reader_discard_print_request',{ticket});}catch{}}
        }
      }while(printAgain);
    }catch(error){printFailed=true;message('Không nhận được danh sách PDF cần in: '+String(error?.message||error));}
    finally{printDraining=false;}
    await invoke('reader_finish_print_batch',{success:!printFailed});
  };
  const printOnly=await invoke('reader_is_print_only').catch(()=>false);
  // Register before draining so Explorer requests cannot race startup.
  const unlisten=await native.event.listen('reader-open-pending',drain);
  const unlistenPrint=await native.event.listen('reader-print-pending',drainPrint);
  await drain();await drainPrint();
  // Never restore old tabs when Explorer supplied open/print requests.
  if(!received&&!hasOpen?.()&&!printOnly&&session){
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
  return ()=>{unlisten?.();unlistenPrint?.();};
}
