(() => {
  const input=document.getElementById('sourceFile'),button=document.getElementById('runBtn'),status=document.getElementById('status');
  const source=document.getElementById('sourceLanguage'),target=document.getElementById('targetLanguage'),service=document.getElementById('service'),mode=document.getElementById('outputMode');
  document.getElementById('toolIcon').innerHTML=window.SOLYAN_PHOSPHOR.tool('translate','convert');
  let selected=null;
  input.addEventListener('change',()=>{selected=input.files?.[0]||null;document.getElementById('selectedFile').textContent=selected?`${selected.name} · ${(selected.size/1048576).toFixed(2)} MB`:'Chưa chọn tệp.';button.disabled=!selected;setStatus(selected?'Sẵn sàng dịch.':'Chọn PDF để bắt đầu.');});
  service.addEventListener('change',()=>{document.getElementById('privacyNote').textContent=['argos','ollama'].includes(service.value)?'Engine local: nội dung tài liệu được xử lý tại dịch vụ đã cấu hình trên máy chủ Core.':'Engine online: phần văn bản trong PDF có thể được gửi tới nhà cung cấp; credential được cấu hình ở phía dịch vụ.';});
  function setStatus(message,kind=''){status.textContent=message;status.classList.remove('error','success');if(kind)status.classList.add(kind)}
  function session(){const invoke=window.__TAURI__?.core?.invoke;if(!invoke)throw Error('Tauri desktop API chưa sẵn sàng.');return invoke('desktop_core_session').then(raw=>{const [endpoint,token]=String(raw).split('\n');if(!endpoint||!token)throw Error('Phiên Core local không hợp lệ.');return{endpoint,token}})}
  async function run(){
    if(!selected)return;
    if(!/\.pdf$/i.test(selected.name)||selected.type&&selected.type!=='application/pdf'){setStatus('Tệp đã chọn không phải PDF.','error');return}
    if(source.value===target.value){setStatus('Ngôn ngữ nguồn và đích phải khác nhau.','error');return}
    button.disabled=true;setStatus('Đang kiểm tra engine dịch…');
    try{
      const {endpoint,token}=await session(),headers={'X-SolYan-Desktop-Token':token};
      const capabilitiesResponse=await fetch(`${endpoint}/pdf/translate/capabilities`,{headers,cache:'no-store'});
      const capabilities=await capabilitiesResponse.json().catch(()=>({}));
      if(!capabilitiesResponse.ok)throw Error(capabilities.detail||`Không đọc được trạng thái engine (HTTP ${capabilitiesResponse.status}).`);
      if(!capabilities.service_configured)throw Error('Chưa cấu hình dịch vụ PDF translation trong Core.');
      const configured=(capabilities.services||[]).find(item=>item.id===service.value);
      if(!configured)throw Error(`Engine ${service.value} không có trong cấu hình hiện tại.`);
      if(configured.requires_operator_configuration&&!configured.local)document.getElementById('privacyNote').textContent='Engine này cần cấu hình operator và có thể gửi văn bản PDF ra dịch vụ bên ngoài.';
      document.getElementById('capabilities').textContent=`${capabilities.engine||'Translation adapter'} · giới hạn ${Math.round((capabilities.max_file_size||104857600)/1048576)} MB · dịch vụ: ${(capabilities.services||[]).map(item=>item.id).join(', ')}`;
      if(selected.size>(capabilities.max_file_size||104857600))throw Error('PDF vượt giới hạn kích thước của dịch vụ dịch.');
      setStatus('Đang dịch PDF… Có thể mất vài phút.');
      const body=new FormData();body.append('file',selected);body.append('source_language',source.value);body.append('target_language',target.value);body.append('service',service.value);body.append('output_mode',mode.value);body.append('thread_count','2');
      const response=await fetch(`${endpoint}/pdf/translate`,{method:'POST',headers,body});
      if(!response.ok){const payload=await response.json().catch(()=>({}));throw Error(payload.detail||`Dịch vụ trả HTTP ${response.status}.`)}
      const isLocal=response.headers.get('X-SolYan-Translation-Local')==='1',used=response.headers.get('X-SolYan-Translation-Service')||service.value;
      const filename=mode.value==='bilingual'?'solyan-translated-bilingual.pdf':'solyan-translated.pdf';
      const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      setStatus(`Đã dịch bằng ${used}${isLocal?' · xử lý local':' · dịch vụ có thể dùng mạng ngoài'}. Lưu kết quả ở khung bên dưới.`,'success');
    }catch(error){setStatus(`Không thể dịch PDF: ${error?.message||error}`,'error')}
    finally{button.disabled=!selected}
  }
  button.addEventListener('click',run);
})();
