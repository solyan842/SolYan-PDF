(() => {
  const params = new URLSearchParams(location.search);
  const tool = params.get('tool') || 'word-pdf';
  const configs = {
    'word-pdf': { name:'Word sang PDF', icon:'W', desc:'Chuyển DOC/DOCX sang PDF bằng LibreOffice cục bộ.', accept:'.doc,.docx', allowed:['.doc','.docx'], inputLabel:'Word', endpoint:'/office/to-pdf', output:'pdf', engineNote:'LibreOffice 26.8.1 chạy cục bộ trong SolYan PDF.' },
    'excel-pdf': { name:'Excel sang PDF', icon:'X', desc:'Chuyển XLS/XLSX sang PDF bằng LibreOffice cục bộ.', accept:'.xls,.xlsx', allowed:['.xls','.xlsx'], inputLabel:'Excel', endpoint:'/office/to-pdf', output:'pdf', engineNote:'LibreOffice 26.8.1 chạy cục bộ trong SolYan PDF.' },
    'ppt-pdf': { name:'PowerPoint sang PDF', icon:'P', desc:'Chuyển PPT/PPTX sang PDF bằng LibreOffice cục bộ.', accept:'.ppt,.pptx', allowed:['.ppt','.pptx'], inputLabel:'PowerPoint', endpoint:'/office/to-pdf', output:'pdf', engineNote:'LibreOffice 26.8.1 chạy cục bộ trong SolYan PDF.' },
    'odf-pdf': { name:'OpenDocument sang PDF', icon:'O', desc:'Chuyển ODT/ODS/ODP sang PDF bằng LibreOffice cục bộ.', accept:'.odt,.ods,.odp', allowed:['.odt','.ods','.odp'], inputLabel:'OpenDocument', endpoint:'/office/to-pdf', output:'pdf', engineNote:'LibreOffice 26.8.1 chạy cục bộ trong SolYan PDF.' },
    'rtf-pdf': { name:'RTF sang PDF', icon:'R', desc:'Chuyển RTF sang PDF bằng LibreOffice cục bộ.', accept:'.rtf', allowed:['.rtf'], inputLabel:'RTF', endpoint:'/office/to-pdf', output:'pdf', engineNote:'LibreOffice 26.8.1 chạy cục bộ trong SolYan PDF.' },
    'pdf-word': { name:'PDF sang Word', icon:'W', desc:'Chuyển PDF sang DOCX; LibreOffice là engine chính, Bloom là fallback khi được cấu hình.', accept:'application/pdf,.pdf', allowed:['.pdf'], inputLabel:'PDF', endpoint:'/experimental/pdf-to-office', output:'docx', target:'docx', mode:'auto', engineNote:'Auto: LibreOffice-first → Bloom fallback. PDF nguồn không bị thay đổi.' },
    'pdf-ppt': { name:'PDF sang PowerPoint', icon:'P', desc:'Chuyển PDF sang PPTX; LibreOffice là engine chính, Bloom là fallback khi được cấu hình.', accept:'application/pdf,.pdf', allowed:['.pdf'], inputLabel:'PDF', endpoint:'/experimental/pdf-to-office', output:'pptx', target:'pptx', mode:'auto', engineNote:'Auto: LibreOffice-first → Bloom fallback. PDF nguồn không bị thay đổi.' }
  };
  const config = configs[tool] || configs['word-pdf'];
  const $ = id => document.getElementById(id);
  const dropzone=$('dropzone'),fileInput=$('fileInput'),pickFile=$('pickFile'),selectedFile=$('selectedFile'),selectedFileIcon=$('selectedFileIcon'),fileName=$('fileName'),fileMeta=$('fileMeta'),removeFile=$('removeFile'),runBtn=$('runBtn'),status=$('status'),result=$('result'),resultVerdict=$('resultVerdict'),summaryGrid=$('summaryGrid');
  let sourceFile=null;

  $('crumbName').textContent=config.name;
  $('toolName').textContent=config.name;
  $('toolIcon').textContent=config.icon;
  $('toolDesc').textContent=config.desc;
  $('pickTitle').textContent=`Chọn tệp ${config.inputLabel}`;
  $('pickHint').textContent=`Kéo tệp ${config.inputLabel} vào đây hoặc chọn từ máy tính.`;
  $('engineNote').textContent=config.engineNote;
  pickFile.textContent=`＋ Chọn tệp ${config.inputLabel}`;
  selectedFileIcon.textContent=config.inputLabel.toUpperCase().slice(0,4);
  fileInput.accept=config.accept;
  runBtn.textContent=`${config.name} →`;
  document.title=`${config.name} — SolYan PDF`;

  function setStatus(message,kind=''){status.textContent=message;status.classList.remove('error','success');if(kind)status.classList.add(kind)}
  function formatSize(bytes){if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1048576).toFixed(1)} MB`}
  function extension(name){const lower=name.toLocaleLowerCase();const dot=lower.lastIndexOf('.');return dot>=0?lower.slice(dot):''}
  function clearNode(node){while(node.firstChild)node.firstChild.remove()}
  function addSummary(label,value){const card=document.createElement('div');card.className='summary-card';const number=document.createElement('strong');number.textContent=String(value);const title=document.createElement('span');title.textContent=label;card.append(number,title);summaryGrid.appendChild(card)}
  function filenameFromDisposition(response){const cd=response.headers.get('Content-Disposition')||'';const m=cd.match(/filename="?([^";]+)"?/i);return m?.[1]||`solyan-converted.${config.output}`}
  function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function setFile(file){if(!file)return;const ext=extension(file.name);if(!config.allowed.includes(ext))return setStatus(`Định dạng không phù hợp. Công cụ này nhận: ${config.allowed.join(', ')}`,'error');if(file.size>100*1024*1024)return setStatus('Tệp vượt giới hạn 100 MB.','error');sourceFile=file;fileName.textContent=file.name;fileMeta.textContent=`${formatSize(file.size)} · ${config.inputLabel}`;selectedFile.hidden=false;runBtn.disabled=false;result.hidden=true;setStatus('Sẵn sàng chuyển đổi cục bộ.')}
  function clearFile(){sourceFile=null;fileInput.value='';selectedFile.hidden=true;runBtn.disabled=true;result.hidden=true;setStatus('Chọn một tệp để bắt đầu.')}
  async function getCoreSession(){const invoke=window.__TAURI__?.core?.invoke;if(!invoke)throw new Error('Tauri desktop API chưa sẵn sàng.');const raw=(await invoke('desktop_service_ready',{service:'office'}),await invoke('desktop_core_session'));const [endpoint,token]=String(raw).split('\n');if(!endpoint||!token)throw new Error('Phiên local core không hợp lệ.');return{endpoint,token}}
  async function run(){if(!sourceFile||runBtn.disabled)return;runBtn.disabled=true;pickFile.disabled=true;result.hidden=true;setStatus(`Đang chạy ${config.name}…`);try{const{endpoint,token}=await getCoreSession();const body=new FormData();body.append('file',sourceFile,sourceFile.name);if(config.target)body.append('target',config.target);if(config.mode)body.append('mode',config.mode);const response=await fetch(`${endpoint}${config.endpoint}`,{method:'POST',headers:{'X-SolYan-Desktop-Token':token},body});if(!response.ok){let detail='';try{const payload=await response.json();detail=payload?.detail||JSON.stringify(payload)}catch(_){try{detail=await response.text()}catch(_){}}throw new Error(detail||`Local core trả mã ${response.status}.`)}const name=filenameFromDisposition(response);const engine=response.headers.get('X-SolYan-Conversion-Engine');saveBlob(await response.blob(),name);clearNode(summaryGrid);if(engine)addSummary('Engine',engine);else addSummary('Engine','LibreOffice');addSummary('Đầu ra',config.output.toUpperCase());resultVerdict.textContent=`Đã tạo ${name}. Tệp nguồn không bị thay đổi.`;result.hidden=false;setStatus(`Hoàn tất và đã lưu ${name}.`,'success')}catch(error){setStatus(`Không thể chuyển đổi: ${error?.message||error}`,'error')}finally{runBtn.disabled=!sourceFile;pickFile.disabled=false}}

  pickFile.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',()=>setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click',clearFile);
  runBtn.addEventListener('click',run);
  for(const event of ['dragenter','dragover'])dropzone.addEventListener(event,e=>{e.preventDefault();dropzone.classList.add('drag')});
  for(const event of ['dragleave','drop'])dropzone.addEventListener(event,e=>{e.preventDefault();dropzone.classList.remove('drag')});
  dropzone.addEventListener('drop',e=>setFile(e.dataTransfer?.files?.[0]));
})();
