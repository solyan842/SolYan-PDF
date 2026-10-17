(() => {
  const $ = id => document.getElementById(id);
  const isImage = new URLSearchParams(location.search).get('tool') === 'image';
  const title = isImage ? 'OCR ảnh' : 'OCR PDF';
  const allowed = isImage ? ['.png','.jpg','.jpeg','.webp','.tif','.tiff','.bmp'] : ['.pdf'];
  const accept = isImage ? allowed.join(',') : 'application/pdf,.pdf';
  const dropzone=$('dropzone'),input=$('fileInput'),pick=$('pickFile'),selected=$('selectedFile'),runBtn=$('runBtn'),status=$('status'),result=$('result');
  let source=null, lastPayload=null;
  $('toolName').textContent=title;
  $('toolDesc').textContent=isImage?'Nhận dạng chữ từ ảnh JPG, PNG, TIFF và các ảnh scan.':'Trích xuất chữ từ PDF scan mà không thay đổi tệp gốc.';
  $('pickTitle').textContent=isImage?'Chọn ảnh cần OCR':'Chọn PDF cần OCR';
  document.title=title+' — SolYan PDF';
  input.accept=accept;
  function setStatus(value,kind=''){status.textContent=value;status.classList.remove('error','success');if(kind)status.classList.add(kind);}
  function ext(name){const i=name.lastIndexOf('.');return i>=0?name.slice(i).toLowerCase():'';}
  function setFile(file){
    if(!file)return;
    if(!allowed.includes(ext(file.name))){setStatus('Định dạng không phù hợp. Hãy chọn '+allowed.join(', '),'error');return;}
    if(!file.size||file.size>50*1024*1024){setStatus('Tệp phải có dữ liệu và không vượt quá 50 MB.','error');return;}
    source=file;lastPayload=null;result.hidden=true;selected.hidden=false;
    $('fileName').textContent=file.name;$('fileMeta').textContent=(file.size/1048576).toFixed(2)+' MB';
    runBtn.disabled=false;setStatus('Sẵn sàng nhận dạng hoàn toàn trên máy.');
  }
  function clearFile(){source=null;lastPayload=null;input.value='';selected.hidden=true;result.hidden=true;runBtn.disabled=true;setStatus('Chọn một tệp để bắt đầu.');}
  async function session(){
    const invoke=window.__TAURI__?.core?.invoke;if(!invoke)throw new Error('Chức năng này cần ứng dụng SolYan PDF Windows.');
    const [endpoint,token]=String(await invoke('desktop_core_session')).split('\n');
    if(!endpoint||!token)throw new Error('Phiên xử lý cục bộ chưa sẵn sàng.');
    return {endpoint,token};
  }
  async function run(){
    if(!source||runBtn.disabled)return;
    runBtn.disabled=true;pick.disabled=true;result.hidden=true;setStatus('Đang nhận dạng văn bản… Tài liệu scan có thể cần thêm thời gian.');
    try{
      const {endpoint,token}=await session();
      const body=new FormData();body.append('file',source,source.name);
      const response=await fetch(endpoint+'/ocr/text',{method:'POST',headers:{'X-SolYan-Desktop-Token':token},body});
      if(!response.ok){let error='';try{const data=await response.json();error=typeof data.detail==='string'?data.detail:JSON.stringify(data.detail||data);}catch(_){error=await response.text();}throw new Error(error||'OCR trả mã '+response.status);}
      const data=await response.json();if(typeof data.text!=='string')throw new Error('Kết quả OCR không hợp lệ.');
      lastPayload=data;$('recognizedText').textContent=data.text||'(Không nhận diện được văn bản)';
      $('engineInfo').textContent='Engine: '+String(data.engine||'OCR')+(data.fallback_used?' · Đã tự dùng Tesseract':' · PaddleOCR ngoại tuyến');
      result.hidden=false;setStatus('Đã nhận dạng xong. Có thể sao chép hoặc lưu kết quả.','success');
    }catch(error){setStatus('Không thể OCR: '+(error?.message||error),'error');}
    finally{runBtn.disabled=!source;pick.disabled=false;}
  }
  function download(text,name,mime){
    const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function stem(){return (source?.name||'solyan').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'-');}
  $('copyText').addEventListener('click',async()=>{if(!lastPayload)return;try{await navigator.clipboard.writeText(lastPayload.text||'');setStatus('Đã sao chép văn bản.','success');}catch(_){setStatus('Không thể sao chép tự động; hãy chọn nội dung trong ô kết quả.','error');}});
  $('saveText').addEventListener('click',()=>{if(lastPayload)download(lastPayload.text||'',stem()+'-ocr.txt','text/plain;charset=utf-8');});
  $('saveJson').addEventListener('click',()=>{if(lastPayload)download(JSON.stringify(lastPayload,null,2),stem()+'-ocr.json','application/json;charset=utf-8');});
  pick.addEventListener('click',()=>input.click());input.addEventListener('change',()=>setFile(input.files?.[0]));$('removeFile').addEventListener('click',clearFile);runBtn.addEventListener('click',run);
  for(const event of ['dragenter','dragover'])dropzone.addEventListener(event,e=>{e.preventDefault();dropzone.classList.add('drag');});
  for(const event of ['dragleave','drop'])dropzone.addEventListener(event,e=>{e.preventDefault();dropzone.classList.remove('drag');});
  dropzone.addEventListener('drop',e=>setFile(e.dataTransfer?.files?.[0]));
})();
