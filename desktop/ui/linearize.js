(() => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pickFile = document.getElementById('pickFile');
  const selectedFile = document.getElementById('selectedFile');
  const fileName = document.getElementById('fileName');
  const fileMeta = document.getElementById('fileMeta');
  const removeFile = document.getElementById('removeFile');
  const runBtn = document.getElementById('runBtn');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  let sourceFile = null;
  let busy = false;

  function setStatus(message, kind = '') { status.textContent = message; status.classList.remove('error','success'); if (kind) status.classList.add(kind); }
  function formatSize(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
  function updateControls() { runBtn.disabled = !sourceFile || busy; }
  async function coreSession() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri desktop API chưa sẵn sàng.');
    const [endpoint, token] = String(await invoke('desktop_core_session')).split('\n');
    if (!endpoint || !token) throw new Error('Phiên local core không hợp lệ.');
    return { endpoint, token };
  }
  function setFile(file) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.pdf')) return setStatus('Chỉ hỗ trợ tệp PDF.', 'error');
    if (file.size > 100 * 1024 * 1024) return setStatus('PDF vượt giới hạn 100 MB.', 'error');
    sourceFile = file; fileName.textContent = file.name; fileMeta.textContent = `${formatSize(file.size)} · PDF`;
    selectedFile.hidden = false; result.hidden = true; setStatus('Sẵn sàng tối ưu cấu trúc tải tuần tự.'); updateControls();
  }
  function clearFile() { sourceFile = null; fileInput.value = ''; selectedFile.hidden = true; result.hidden = true; setStatus('Chọn một tệp PDF để bắt đầu.'); updateControls(); }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function errorText(response) { try { const p = await response.json(); return p?.detail || JSON.stringify(p); } catch (_) { try { return await response.text(); } catch (_) { return `HTTP ${response.status}`; } } }
  async function run() {
    if (!sourceFile || busy) return;
    busy = true; updateControls(); pickFile.disabled = true; result.hidden = true; setStatus('Đang linearize PDF và kiểm tra file kết quả…');
    try {
      const { endpoint, token } = await coreSession();
      const body = new FormData(); body.append('file', sourceFile, sourceFile.name);
      const response = await fetch(`${endpoint}/pdf/web-optimize`, { method:'POST', headers:{ 'X-SolYan-Desktop-Token': token }, body });
      if (!response.ok) throw new Error(await errorText(response));
      download(await response.blob(), window.SOLYAN_OUTPUT_NAME(sourceFile.name, 'web-optimized'));
      result.hidden = false; setStatus('Hoàn tất. PDF nguồn không bị thay đổi.', 'success');
    } catch (error) { setStatus(`Không thể tối ưu PDF: ${error?.message || error}`, 'error'); }
    finally { busy = false; pickFile.disabled = false; updateControls(); }
  }
  pickFile.addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', () => setFile(fileInput.files?.[0])); removeFile.addEventListener('click', clearFile); runBtn.addEventListener('click', run);
  for (const event of ['dragenter','dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave','drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0])); updateControls();
})();
