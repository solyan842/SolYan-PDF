(() => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pickFile = document.getElementById('pickFile');
  const selectedFile = document.getElementById('selectedFile');
  const fileName = document.getElementById('fileName');
  const fileMeta = document.getElementById('fileMeta');
  const removeFile = document.getElementById('removeFile');
  const outputName = document.getElementById('outputName');
  const extractBtn = document.getElementById('extractBtn');
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
    extractBtn.disabled = false;
    const stem = file.name.replace(/\.pdf$/i, '') || 'tai-lieu';
    outputName.value = `${stem}-images.zip`;
    setStatus('Sẵn sàng trích xuất ảnh bằng Poppler cục bộ.');
  }

  function clearFile() {
    sourceFile = null;
    fileInput.value = '';
    selectedFile.hidden = true;
    extractBtn.disabled = true;
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

  async function extractImages() {
    if (!sourceFile || extractBtn.disabled) return;
    extractBtn.disabled = true;
    pickFile.disabled = true;
    setStatus('Đang kiểm tra và trích xuất ảnh nhúng…');
    try {
      const { endpoint, token } = await getCoreSession();
      const body = new FormData();
      body.append('file', sourceFile, sourceFile.name);
      const response = await fetch(`${endpoint}/pdf/extract-images`, {
        method: 'POST',
        headers: { 'X-SolYan-Desktop-Token': token },
        body
      });
      if (!response.ok) {
        let detail = '';
        try { detail = await response.text(); } catch (_) {}
        throw new Error(detail || `Local core trả mã ${response.status}.`);
      }
      const archive = await response.blob();
      if (!archive.size) throw new Error('Tệp ZIP kết quả rỗng.');
      const extractedCount = response.headers.get('X-SolYan-Extracted-Images');
      const rawName = (outputName.value.trim() || 'solyan-extracted-images.zip').replace(/[\\/:*?"<>|]/g, '-');
      const finalName = rawName.toLocaleLowerCase().endsWith('.zip') ? rawName : `${rawName}.zip`;
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = finalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Đã trích xuất ${extractedCount || 'các'} ảnh · ${finalName}`, 'success');
    } catch (error) {
      setStatus(`Không thể trích xuất ảnh: ${error?.message || error}`, 'error');
    } finally {
      extractBtn.disabled = !sourceFile;
      pickFile.disabled = false;
    }
  }

  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click', clearFile);
  extractBtn.addEventListener('click', extractImages);

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
