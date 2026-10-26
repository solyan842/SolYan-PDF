(() => {
  const mode = new URLSearchParams(location.search).get('tool') || 'ping';
  const config = mode === 'keyword' ? {
    name:'Vị trí từ khóa Google', icon:'keyword', label:'Từ khóa cần tìm', placeholder:'ví dụ: phần mềm đọc PDF', endpoint:'/net/keyword-position', key:'keyword',
    description:'Kiểm tra vị trí tên miền trong tối đa 100 kết quả Google Custom Search.', note:'Cần cấu hình Google Custom Search API key và Search Engine ID trong Core. Truy vấn chỉ được gửi khi bạn bấm kiểm tra.'
  } : mode === 'ip' ? {
    name:'Kiểm tra IP', icon:'ip', label:'Địa chỉ IP máy tính', placeholder:'', endpoint:'/net/local-ip', method:'GET', key:null,
    description:'Xem các địa chỉ IP cục bộ được nhận diện trên máy tính này.', note:'Đọc thông tin bộ điều hợp mạng local; không gửi truy vấn ra dịch vụ bên ngoài.'
  } : mode === 'ranking' ? {
    name:'Website Ranking', icon:'ranking', label:'Tên miền', placeholder:'example.com', endpoint:'/net/site-rank', key:'domain',
    description:'Xem dữ liệu xếp hạng website từ danh sách Tranco công khai.', note:'Dùng nguồn dữ liệu công khai tương thích Tranco. Yêu cầu chỉ được gửi khi bạn bấm kiểm tra.'
  } : {
    name:'Ping', icon:'ping', label:'Máy chủ hoặc IP công cộng', placeholder:'example.com', endpoint:'/net/ping', key:'host',
    description:'Đo khả năng kết nối tới một máy chủ hoặc IP công cộng.', note:'Để bảo vệ mạng nội bộ, địa chỉ private, loopback và reserved bị chặn. Yêu cầu chỉ được gửi khi bạn bấm kiểm tra.'
  };
  const target=document.getElementById('target'),domain=document.getElementById('keywordDomain'),domainGroup=document.getElementById('keywordDomainGroup'),button=document.getElementById('runBtn'),status=document.getElementById('status'),result=document.getElementById('result');
  document.title=`${config.name} — SolYan PDF`;
  document.getElementById('crumbName').textContent=config.name;
  document.getElementById('toolName').textContent=config.name;
  document.getElementById('toolDesc').textContent=config.description;
  document.getElementById('targetLabel').textContent=config.label;
  document.getElementById('note').textContent=config.note;
  document.getElementById('toolIcon').innerHTML=window.SOLYAN_PHOSPHOR.tool(config.icon,'vn');
  target.placeholder=config.placeholder;
  if(mode==='keyword')domainGroup.hidden=false;
  if(mode==='ip'){
    target.closest('.option-group').hidden=true;
    button.textContent='Xem địa chỉ IP →';
  }
  function setStatus(text,kind=''){status.textContent=text;status.classList.remove('error','success');if(kind)status.classList.add(kind)}
  async function run(){
    const value=target.value.trim();
    if(mode!=='ip'&&!value){setStatus('Nhập máy chủ hoặc tên miền trước khi kiểm tra.','error');target.focus();return}
    if(mode==='keyword'&&!domain.value.trim()){setStatus('Nhập tên miền cần kiểm tra.','error');domain.focus();return}
    button.disabled=true;result.hidden=true;setStatus('Đang kiểm tra qua dịch vụ local…');
    try{
      const invoke=window.__TAURI__?.core?.invoke;
      if(!invoke)throw Error('Tauri desktop API chưa sẵn sàng.');
      const raw=await invoke('desktop_core_session'),[endpoint,token]=String(raw).split('\n');
      if(!endpoint||!token)throw Error('Phiên Core local không hợp lệ.');
      const method=config.method||'POST';
      const request={method,headers:{'X-SolYan-Desktop-Token':token}};
      if(method!=='GET'){request.headers['Content-Type']='application/json';request.body=JSON.stringify(mode==='keyword'?{keyword:value,domain:domain.value.trim()}:{[config.key]:value})}
      const response=await fetch(`${endpoint}${config.endpoint}`,request);
      const payload=await response.json().catch(()=>({detail:'Phản hồi không hợp lệ từ dịch vụ mạng.'}));
      if(!response.ok)throw Error(payload.detail||`Dịch vụ trả HTTP ${response.status}.`);
      result.textContent=JSON.stringify(payload,null,2);result.hidden=false;
      const reachable=mode!=='ping'||Boolean(payload.reachable);
      const message=mode==='ip'?'Đã đọc địa chỉ IP local.':mode==='ping'?(reachable?'Máy chủ phản hồi ping.':'Không nhận được phản hồi ping.'):mode==='keyword'?(payload.position?`Tên miền đứng thứ ${payload.position} cho từ khóa này.`:'Không tìm thấy trong phạm vi 100 kết quả đã kiểm tra.'):'Đã nhận dữ liệu xếp hạng.';
      setStatus(message,reachable?'success':'error');
    }catch(error){setStatus(`Không thể kiểm tra: ${error?.message||error}`,'error')}
    finally{button.disabled=false}
  }
  button.addEventListener('click',run);
  target.addEventListener('keydown',event=>{if(event.key==='Enter')run()});
  domain.addEventListener('keydown',event=>{if(event.key==='Enter')run()});
})();

