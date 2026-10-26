(() => {
  const $ = id => document.getElementById(id);
  const input=$('fileInput'),runBtn=$('runBtn'),dropzone=$('dropzone'),status=$('status');
  let file=null,busy=false;
  function setStatus(text,kind='') {
    status.textContent=text;status.classList.remove('success','error');
    if(kind)status.classList.add(kind);
  }
  function update() {runBtn.disabled=busy||!file;$('pickFile').disabled=busy;}
  function pick(next) {
    if(!next)return;
    if(!next.name.toLowerCase().endsWith('.pdf'))return setStatus('Chỉ hỗ trợ tệp PDF.','error');
    if(!next.size||next.size>100*1024*1024)return setStatus('PDF trống hoặc vượt giới hạn 100 MB.','error');
    file=next;$('fileName').textContent=next.name;
    $('fileMeta').textContent=(next.size/1048576).toFixed(2)+' MB';
    $('selectedFile').hidden=false;$('result').hidden=true;
    setStatus('Đã chọn PDF.');update();
  }
  function clear() {file=null;input.value='';$('selectedFile').hidden=true;$('result').hidden=true;setStatus('Chọn tệp PDF để bắt đầu.');update();}
  async function getSession() {
    const invoke=window.__TAURI__?.core?.invoke;
    if(!invoke)throw new Error('Chỉ chạy trong SolYan PDF Windows.');
    const [endpoint,token]=String((await invoke('desktop_service_ready',{service:'archive'}),await invoke('desktop_core_session'))).split('\n');
    if(!endpoint||!token)throw new Error('Dịch vụ cục bộ chưa sẵn sàng.');
    return {endpoint,token};
  }
  async function errorText(response) {
    try { const result=await response.json();return typeof result.detail==='string'?result.detail:'HTTP '+response.status; }
    catch(_){return 'HTTP '+response.status;}
  }
  function save(blob) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=window.SOLYAN_OUTPUT_NAME(file.name, 'archive-pdfa');
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function run(){
    if(busy||!file)return;
    busy=true;update();$('result').hidden=true;setStatus('Đang chuyển đổi PDF/A trên máy…');
    try {
      const {endpoint,token}=await getSession();
      const body=new FormData();body.append('file',file,file.name);
      const response=await fetch(endpoint+'/archive/pdfa',{method:'POST',headers:{'X-SolYan-Desktop-Token':token},body});
      if(!response.ok)throw new Error(await errorText(response));
      const output=await response.blob();
      if(!output.size)throw new Error('Tệp PDF/A kết quả trống.');
      save(output);$('resultVerdict').textContent='Đã tạo PDF/A. PDF nguồn không bị thay đổi.';
      $('result').hidden=false;setStatus('Chuyển đổi PDF/A thành công.','success');
    } catch(error) {setStatus('Không thể tạo PDF/A: '+(error?.message||error),'error');}
    finally {busy=false;update();}
  }
  $('pickFile').addEventListener('click',()=>input.click());
  input.addEventListener('change',()=>pick(input.files?.[0]));
  $('removeFile').addEventListener('click',clear);
  runBtn.addEventListener('click',run);
  for(const type of ['dragenter','dragover'])dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.add('drag')});
  for(const type of ['dragleave','drop'])dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.remove('drag')});
  dropzone.addEventListener('drop',e=>pick(e.dataTransfer?.files?.[0]));
  update();
})();