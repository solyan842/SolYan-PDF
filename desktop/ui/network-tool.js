(() => {
  const mode = new URLSearchParams(location.search).get('tool') || 'ping';
  const config = mode === 'ranking' ? {
    name:'Website Ranking', icon:'ranking', label:'Tên miền', placeholder:'example.com', endpoint:'/net/site-rank', key:'domain',
    description:'Xem dữ liệu xếp hạng website từ danh sách Tranco công khai.', note:'Dùng nguồn dữ liệu công khai tương thích Tranco. Yêu cầu chỉ được gửi khi bạn bấm kiểm tra.'
  } : {
    name:'Ping', icon:'ping', label:'Máy chủ hoặc IP công cộng', placeholder:'example.com', endpoint:'/net/ping', key:'host',
    description:'Đo khả năng kết nối tới một máy chủ hoặc IP công cộng.', note:'Để bảo vệ mạng nội bộ, địa chỉ private, loopback và reserved bị chặn. Yêu cầu chỉ được gửi khi bạn bấm kiểm tra.'
  };
  const target=document.getElementById('target'),button=document.getElementById('runBtn'),status=document.getElementById('status'),result=document.getElementById('result');
  document.title=`${config.name} — SolYan PDF`;
  document.getElementById('crumbName').textContent=config.name;
  document.getElementById('toolName').textContent=config.name;
  document.getElementById('toolDesc').textContent=config.description;
  document.getElementById('targetLabel').textContent=config.label;
  document.getElementById('note').textContent=config.note;
  document.getElementById('toolIcon').innerHTML=window.SOLYAN_PHOSPHOR.tool(config.icon,'vn');
  target.placeholder=config.placeholder;
  function setStatus(text,kind=''){status.textContent=text;status.classList.remove('error','success');if(kind)status.classList.add(kind)}
  async function run(){
    const value=target.value.trim();
    if(!value){setStatus('Nhập máy chủ hoặc tên miền trước khi kiểm tra.','error');target.focus();return}
    button.disabled=true;result.hidden=true;setStatus('Đang kiểm tra qua dịch vụ local…');
    try{
      const invoke=window.__TAURI__?.core?.invoke;
      if(!invoke)throw Error('Tauri desktop API chưa sẵn sàng.');
      const raw=await invoke('desktop_core_session'),[endpoint,token]=String(raw).split('\n');
      if(!endpoint||!token)throw Error('Phiên Core local không hợp lệ.');
      const response=await fetch(`${endpoint}${config.endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-SolYan-Desktop-Token':token},body:JSON.stringify({[config.key]:value})});
      const payload=await response.json().catch(()=>({detail:'Phản hồi không hợp lệ từ dịch vụ mạng.'}));
      if(!response.ok)throw Error(payload.detail||`Dịch vụ trả HTTP ${response.status}.`);
      result.textContent=JSON.stringify(payload,null,2);result.hidden=false;
      const reachable=mode!=='ping'||Boolean(payload.reachable);
      setStatus(mode==='ping'?(reachable?'Máy chủ phản hồi ping.':'Không nhận được phản hồi ping.'):'Đã nhận dữ liệu xếp hạng.',reachable?'success':'error');
    }catch(error){setStatus(`Không thể kiểm tra: ${error?.message||error}`,'error')}
    finally{button.disabled=false}
  }
  button.addEventListener('click',run);
  target.addEventListener('keydown',event=>{if(event.key==='Enter')run()});
})();

