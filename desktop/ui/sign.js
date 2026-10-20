(() => {
  const verify = new URLSearchParams(location.search).get('mode') === 'verify';
  const $ = id => document.getElementById(id);
  const pdfInput = $('pdfInput'), certInput = $('certInput'), password = $('certPassword');
  const runBtn = $('runBtn'), status = $('status'), summary = $('summary');
  let pdf = null, busy = false;
  if (verify) {
    $('title').textContent = 'Kiểm tra chữ ký';
    $('crumb').textContent = 'Kiểm tra chữ ký';
    $('description').textContent = 'Kiểm tra chữ ký nhúng và tính toàn vẹn offline.';
    $('optionsTitle').textContent = 'Xác minh chữ ký';
    $('certificateOptions').hidden = true;
    $('verifyNote').hidden = false;
    runBtn.textContent = 'Kiểm tra chữ ký →';
    document.title = 'Kiểm tra chữ ký — SolYan PDF';
  }
  function setStatus(message, kind='') {
    status.textContent = message;
    status.classList.remove('error','success');
    if (kind) status.classList.add(kind);
  }
  function refresh() { runBtn.disabled = busy || !pdf || (!verify && !certInput.files?.[0]); }
  function setPdf(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) return setStatus('Chỉ nhận tệp PDF.','error');
    if (!file.size || file.size > 100*1024*1024) return setStatus('PDF trống hoặc vượt 100 MB.','error');
    pdf = file;
    $('pdfName').textContent = file.name;
    $('pdfMeta').textContent = (file.size/1048576).toFixed(2) + ' MB';
    $('selectedPdf').hidden = false;
    $('result').hidden = true;
    setStatus('Đã chọn PDF.');
    refresh();
  }
  function clearNode(node) { while (node.firstChild) node.firstChild.remove(); }
  function addSummary(label,value) {
    const card=document.createElement('div'), title=document.createElement('span'), number=document.createElement('strong');
    card.className='summary-card'; title.textContent=label; number.textContent=String(value);
    card.append(number,title); summary.appendChild(card);
  }
  function save(blob,filename) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function failReason(response) {
    try { const value=await response.json();return typeof value.detail==='string'?value.detail:'HTTP '+response.status; }
    catch (_) { return 'HTTP '+response.status; }
  }
  async function session() {
    const invoke=window.__TAURI__?.core?.invoke;
    if(!invoke)throw new Error('Chỉ sử dụng trong ứng dụng SolYan PDF Windows.');
    const [endpoint,token]=String((await invoke('desktop_service_ready',{service:'sign'}),await invoke('desktop_core_session'))).split('\n');
    if(!endpoint||!token)throw new Error('Dịch vụ PDF cục bộ chưa sẵn sàng.');
    return {endpoint,token};
  }
  async function run() {
    if(busy||!pdf)return;
    const cert=certInput.files?.[0];
    if(!verify&&(!cert||!(/\.(p12|pfx)$/i).test(cert.name)||!cert.size||cert.size>10*1024*1024))
      return setStatus('Chứng thư P12/PFX không hợp lệ hoặc vượt 10 MB.','error');
    if(!verify&&!$('fieldName').value.trim())return setStatus('Cần tên trường chữ ký.','error');
    busy=true;refresh();$('pickPdf').disabled=true;$('result').hidden=true;
    setStatus(verify?'Đang kiểm tra chữ ký offline…':'Đang ký PDF cục bộ…');
    try {
      const {endpoint,token}=await session();
      const body=new FormData();body.append('file',pdf,pdf.name);
      if(!verify) {
        body.append('certificate',cert,cert.name);
        body.append('passphrase',password.value);
        body.append('field_name',$('fieldName').value.trim());
      }
      const response=await fetch(endpoint+(verify?'/sign/validate':'/sign/pkcs12'),{
        method:'POST',headers:{'X-SolYan-Desktop-Token':token},body
      });
      if(!response.ok)throw new Error(await failReason(response));
      clearNode(summary);clearNode($('signatureDetails'));
      if(verify) {
        const value=await response.json();
        addSummary('Chữ ký',Number(value.signature_count||0));
        addSummary('Toàn vẹn',value.all_intact?'Đạt':'Không đạt');
        addSummary('Mật mã',value.all_cryptographically_valid?'Đạt':'Không đạt');
        addSummary('Tin cậy',value.all_trusted?'Đạt':'Chưa xác minh');
        for(const entry of (Array.isArray(value.signatures)?value.signatures:[])){
          const p=document.createElement('p');
          p.textContent=(entry.field_name||'Chữ ký')+': '+(entry.cryptographically_valid?'mật mã hợp lệ':'chưa hợp lệ')+' · '+(entry.trusted?'chứng thư tin cậy':'chưa xác minh độ tin cậy');
          $('signatureDetails').appendChild(p);
        }
        $('verdict').textContent=value.signature_count?'Đã kiểm tra offline. Kết quả không thay thế xác minh trực tuyến.':'Không tìm thấy chữ ký số.';
        setStatus('Kiểm tra chữ ký hoàn tất.','success');
      } else {
        save(await response.blob(),'solyan-signed.pdf');
        addSummary('Đầu ra','PDF đã ký');
        $('verdict').textContent='Đã tạo PDF có chữ ký. Hãy dùng Kiểm tra chữ ký để xác minh.';
        setStatus('Ký số hoàn tất. Tệp nguồn không bị thay đổi.','success');
      }
      $('result').hidden=false;
    } catch(error) {setStatus('Không thể xử lý: '+(error?.message||error),'error');}
    finally {password.value='';busy=false;$('pickPdf').disabled=false;refresh();}
  }
  $('pickPdf').addEventListener('click',()=>pdfInput.click());
  pdfInput.addEventListener('change',()=>setPdf(pdfInput.files?.[0]));
  $('removePdf').addEventListener('click',()=>{pdf=null;pdfInput.value='';$('selectedPdf').hidden=true;$('result').hidden=true;refresh();});
  certInput.addEventListener('change',()=>{$('certLabel').textContent=certInput.files?.[0]?.name||'Tối đa 10 MB';refresh();});
  runBtn.addEventListener('click',run);
  const zone=$('dropzone');
  for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('drag')});
  for(const type of ['dragleave','drop'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.remove('drag')});
  zone.addEventListener('drop',event=>setPdf(event.dataTransfer?.files?.[0]));
  refresh();
})();