(() => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pickFile = document.getElementById('pickFile');
  const selectedFile = document.getElementById('selectedFile');
  const fileName = document.getElementById('fileName');
  const fileMeta = document.getElementById('fileMeta');
  const removeFile = document.getElementById('removeFile');
  const outputName = document.getElementById('outputName');
  const repairBtn = document.getElementById('repairBtn');
  const status = document.getElementById('status');
  let sourceFile = null;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.classList.remove('error', 'success');
    if (kind) status.classList.add(kind);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setFile(file) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.pdf')) {
      setStatus('Chỉ hỗ trợ tệp PDF.', 'error');
      return;
    }
    sourceFile = file;
    fileName.textContent = file.name;
    fileMeta.textContent = `${formatSize(file.size)} · PDF`;
    selectedFile.hidden = false;
    repairBtn.disabled = false;
    const stem = file.name.replace(/\.pdf$/i, '') || 'tai-lieu';
    outputName.value = `${stem}-repaired.pdf`;
    setStatus('Sẵn sàng sửa lỗi bằng qpdf cục bộ.');
  }

  function clearFile() {
    sourceFile = null;
    fileInput.value = '';
    selectedFile.hidden = true;
    repairBtn.disabled = true;
    setStatus('Chọn một tệp PDF để bắt đầu.');
  }

  async function getCoreSession() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri desktop API chưa sẵn sàng.');
    const raw = await invoke('desktop_core_session');
    const [endpoint, token] = String(raw).split('\n');
    if (!endpoint || !token) throw new Error('Phiên local core không hợp lệ.');
    return { endpoint, token };
  }

  async function repair() {
    if (!sourceFile || repairBtn.disabled) return;
    repairBtn.disabled = true;
    pickFile.disabled = true;
    setStatus('Đang khởi động local core và sửa cấu trúc PDF…');
    try {
      const { endpoint, token } = await getCoreSession();
      const body = new FormData();
      body.append('file', sourceFile, sourceFile.name);
      const response = await fetch(`${endpoint}/pdf/repair`, {
        method: 'POST',
        headers: { 'X-SolYan-Desktop-Token': token },
        body
      });
      if (!response.ok) {
        let detail = '';
        try { detail = await response.text(); } catch (_) {}
        throw new Error(detail || `Local core trả mã ${response.status}.`);
      }
      const repaired = await response.blob();
      if (!repaired.size) throw new Error('Tệp kết quả rỗng.');
      const name = (outputName.value.trim() || 'solyan-repaired.pdf').replace(/[\\/:*?"<>|]/g, '-');
      const finalName = name.toLocaleLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
      const url = URL.createObjectURL(repaired);
      const link = document.createElement('a');
      link.href = url;
      link.download = finalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Đã sửa xong · ${finalName}`, 'success');
    } catch (error) {
      setStatus(`Không thể sửa tệp: ${error?.message || error}`, 'error');
    } finally {
      repairBtn.disabled = !sourceFile;
      pickFile.disabled = false;
    }
  }

  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click', clearFile);
  repairBtn.addEventListener('click', repair);

  for (const event of ['dragenter', 'dragover']) {
    dropzone.addEventListener(event, e => {
      e.preventDefault();
      dropzone.classList.add('drag');
    });
  }
  for (const event of ['dragleave', 'drop']) {
    dropzone.addEventListener(event, e => {
      e.preventDefault();
      dropzone.classList.remove('drag');
    });
  }
  dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0]));
})();
