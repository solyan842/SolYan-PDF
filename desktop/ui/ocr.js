(() => {
  const pickFile = document.getElementById('pickFile');
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const selectedFile = document.getElementById('selectedFile');
  const fileName = document.getElementById('fileName');
  const fileMeta = document.getElementById('fileMeta');
  const removeFile = document.getElementById('removeFile');
  const runButton = document.getElementById('runOcr');
  const status = document.getElementById('status');
  const resultPanel = document.getElementById('resultPanel');
  const preview = document.getElementById('outputPreview');
  const engineInfo = document.getElementById('engineInfo');
  const download = document.getElementById('downloadTxt');
  const allowed = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp']);
  let selected = null;
  let result = '';

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.classList.remove('error', 'success');
    if (kind) status.classList.add(kind);
  }

  function choose(file) {
    if (!file) return;
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowed.has(extension) || file.size === 0 || file.size > 50 * 1024 * 1024) {
      setStatus('Chỉ nhận PDF/ảnh hợp lệ có dung lượng từ 1 byte đến 50 MB.', 'error');
      return;
    }
    selected = file;
    result = '';
    resultPanel.hidden = true;
    preview.value = '';
    fileName.textContent = file.name;
    fileMeta.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    selectedFile.hidden = false;
    runButton.disabled = false;
    download.disabled = true;
    setStatus('Sẵn sàng nhận dạng trên máy tính.');
  }

  function clear() {
    selected = null;
    result = '';
    fileInput.value = '';
    selectedFile.hidden = true;
    resultPanel.hidden = true;
    runButton.disabled = true;
    download.disabled = true;
    setStatus('Chọn một tệp để bắt đầu.');
  }

  async function getSession() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri desktop API chưa sẵn sàng.');
    const raw = (await invoke('desktop_service_ready',{service:'ocr'}),await invoke('desktop_core_session'));
    const [endpoint, token] = String(raw).split('\n');
    if (!endpoint || !token) throw new Error('Không có phiên Core API cục bộ.');
    return {endpoint, token};
  }

  async function recognize() {
    if (!selected || runButton.disabled) return;
    runButton.disabled = true;
    pickFile.disabled = true;
    setStatus('Đang nhận dạng OCR cục bộ. Lần chạy đầu có thể cần nạp model…');
    try {
      const {endpoint, token} = await getSession();
      const data = new FormData();
      data.append('file', selected, selected.name);
      const response = await fetch(`${endpoint}/ocr/text`, {
        method: 'POST',
        headers: {'X-SolYan-Desktop-Token': token},
        body: data
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(details.slice(0, 800) || `OCR trả lỗi HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (typeof payload.text !== 'string') throw new Error('OCR không trả về văn bản hợp lệ.');
      result = payload.text;
      preview.value = result;
      resultPanel.hidden = false;
      download.disabled = !result.length;
      const engine = String(payload.engine || 'OCR');
      engineInfo.textContent = `Engine: ${engine}${payload.fallback_used ? ' (dự phòng)' : ''}`;
      setStatus(result ? 'Đã nhận dạng xong. Có thể tải kết quả TXT.' : 'OCR hoàn tất nhưng không tìm thấy văn bản.', result ? 'success' : '');
    } catch (error) {
      result = '';
      resultPanel.hidden = true;
      download.disabled = true;
      setStatus(`OCR không thành công: ${error?.message || error}`, 'error');
    } finally {
      runButton.disabled = !selected;
      pickFile.disabled = false;
    }
  }

  function downloadTxt() {
    if (!selected || !result) return;
    const name = (selected.name.replace(/\.[^.]+$/, '') || 'solyan-ocr').replace(/[\\/:*?"<>|]/g, '-') + '-ocr.txt';
    const url = URL.createObjectURL(new Blob([result], {type: 'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => choose(fileInput.files?.[0]));
  removeFile.addEventListener('click', clear);
  runButton.addEventListener('click', recognize);
  download.addEventListener('click', downloadTxt);
  for (const event of ['dragenter', 'dragover']) {
    dropzone.addEventListener(event, e => {e.preventDefault(); dropzone.classList.add('drag');});
  }
  for (const event of ['dragleave', 'drop']) {
    dropzone.addEventListener(event, e => {e.preventDefault(); dropzone.classList.remove('drag');});
  }
  dropzone.addEventListener('drop', e => choose(e.dataTransfer?.files?.[0]));
})();
