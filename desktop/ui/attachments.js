(() => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pickFile = document.getElementById('pickFile');
  const selectedFile = document.getElementById('selectedFile');
  const fileName = document.getElementById('fileName');
  const fileMeta = document.getElementById('fileMeta');
  const removeFile = document.getElementById('removeFile');
  const attachmentWorkspace = document.getElementById('attachmentWorkspace');
  const attachmentCount = document.getElementById('attachmentCount');
  const attachmentList = document.getElementById('attachmentList');
  const emptyAttachments = document.getElementById('emptyAttachments');
  const refreshBtn = document.getElementById('refreshBtn');
  const attachmentInput = document.getElementById('attachmentInput');
  const pickAttachments = document.getElementById('pickAttachments');
  const pendingAttachments = document.getElementById('pendingAttachments');
  const addBtn = document.getElementById('addBtn');
  const status = document.getElementById('status');
  let sourceFile = null;
  let pendingFiles = [];
  let busy = false;

  function setStatus(message, kind = '') { status.textContent = message; status.classList.remove('error','success'); if (kind) status.classList.add(kind); }
  function formatSize(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
  async function coreSession() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri desktop API chưa sẵn sàng.');
    const [endpoint, token] = String(await invoke('desktop_core_session')).split('\n');
    if (!endpoint || !token) throw new Error('Phiên local core không hợp lệ.');
    return { endpoint, token };
  }
  function auth(token) { return { 'X-SolYan-Desktop-Token': token }; }
  function clearNode(node) { while (node.firstChild) node.firstChild.remove(); }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function responseFilename(response, fallback) {
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i); return match?.[1] || fallback;
  }
  async function responseError(response) {
    try { const payload = await response.json(); return payload?.detail || JSON.stringify(payload); } catch (_) { try { return await response.text(); } catch (_) { return `HTTP ${response.status}`; } }
  }
  function updateControls() {
    pickAttachments.disabled = !sourceFile || busy;
    addBtn.disabled = !sourceFile || pendingFiles.length === 0 || busy;
    refreshBtn.disabled = !sourceFile || busy;
  }
  function renderPending() {
    clearNode(pendingAttachments);
    pendingFiles.forEach((file, index) => {
      const row = document.createElement('div'); row.className = 'pending-item';
      const body = document.createElement('span'); body.textContent = `${file.name} · ${formatSize(file.size)}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'pending-remove'; remove.textContent = '×'; remove.title = 'Bỏ tệp';
      remove.addEventListener('click', () => { pendingFiles.splice(index, 1); renderPending(); updateControls(); });
      row.append(body, remove); pendingAttachments.appendChild(row);
    });
  }
  function renderInventory(items) {
    clearNode(attachmentList); const list = Array.isArray(items) ? items : [];
    attachmentCount.textContent = `${list.length} tệp đính kèm`;
    emptyAttachments.hidden = list.length !== 0;
    list.forEach((item, index) => {
      const card = document.createElement('article'); card.className = 'attachment-card';
      const icon = document.createElement('div'); icon.className = 'attachment-file-icon'; icon.textContent = 'FILE';
      const body = document.createElement('div'); body.className = 'attachment-card-body';
      const title = document.createElement('strong'); title.textContent = item.filename || item.key || `Attachment ${index + 1}`;
      const meta = document.createElement('span'); meta.textContent = `Key: ${item.key || '—'}${item.stream ? ` · stream ${item.stream}` : ''}`;
      body.append(title, meta);
      const actions = document.createElement('div'); actions.className = 'attachment-actions';
      const extract = document.createElement('button'); extract.type = 'button'; extract.className = 'secondary-button'; extract.textContent = 'Trích xuất';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = 'Xóa khỏi bản mới';
      extract.addEventListener('click', () => extractAttachment(item));
      remove.addEventListener('click', () => removeAttachment(item));
      actions.append(extract, remove); card.append(icon, body, actions); attachmentList.appendChild(card);
    });
  }
  async function setSource(file) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.pdf')) return setStatus('Chỉ hỗ trợ tệp PDF.', 'error');
    if (file.size > 100 * 1024 * 1024) return setStatus('PDF vượt giới hạn 100 MB.', 'error');
    sourceFile = file; pendingFiles = []; renderPending(); fileName.textContent = file.name; fileMeta.textContent = `${formatSize(file.size)} · PDF`;
    selectedFile.hidden = false; attachmentWorkspace.hidden = false; updateControls(); await listAttachments();
  }
  function clearSource() {
    sourceFile = null; pendingFiles = []; fileInput.value = ''; attachmentInput.value = ''; selectedFile.hidden = true; attachmentWorkspace.hidden = true;
    clearNode(attachmentList); renderPending(); updateControls(); setStatus('Chọn PDF để bắt đầu.');
  }
  async function listAttachments() {
    if (!sourceFile || busy) return;
    busy = true; updateControls(); setStatus('Đang đọc danh sách attachment…');
    try {
      const { endpoint, token } = await coreSession(); const body = new FormData(); body.append('file', sourceFile, sourceFile.name);
      const response = await fetch(`${endpoint}/pdf/attachments/list`, { method:'POST', headers:auth(token), body });
      if (!response.ok) throw new Error(await responseError(response));
      const data = await response.json(); renderInventory(data.attachments); setStatus(`Đã đọc ${data.count || 0} attachment.`, 'success');
    } catch (error) { renderInventory([]); setStatus(`Không thể đọc attachment: ${error?.message || error}`, 'error'); }
    finally { busy = false; updateControls(); }
  }
  async function extractAttachment(item) {
    if (!sourceFile || busy) return; busy = true; updateControls(); setStatus(`Đang trích xuất ${item.filename || item.key}…`);
    try {
      const { endpoint, token } = await coreSession(); const body = new FormData(); body.append('file', sourceFile, sourceFile.name); body.append('key', item.key);
      const response = await fetch(`${endpoint}/pdf/attachments/extract`, { method:'POST', headers:auth(token), body });
      if (!response.ok) throw new Error(await responseError(response));
      downloadBlob(await response.blob(), responseFilename(response, item.filename || item.key || 'attachment.bin'));
      setStatus('Đã trích xuất attachment.', 'success');
    } catch (error) { setStatus(`Không thể trích xuất: ${error?.message || error}`, 'error'); }
    finally { busy = false; updateControls(); }
  }
  async function removeAttachment(item) {
    if (!sourceFile || busy) return; busy = true; updateControls(); setStatus(`Đang tạo PDF mới không có ${item.filename || item.key}…`);
    try {
      const { endpoint, token } = await coreSession(); const body = new FormData(); body.append('file', sourceFile, sourceFile.name); body.append('key', item.key);
      const response = await fetch(`${endpoint}/pdf/attachments/remove`, { method:'POST', headers:auth(token), body });
      if (!response.ok) throw new Error(await responseError(response));
      downloadBlob(await response.blob(), responseFilename(response, 'solyan-without-attachment.pdf'));
      setStatus('Đã tạo PDF mới. File nguồn không bị thay đổi.', 'success');
    } catch (error) { setStatus(`Không thể xóa attachment: ${error?.message || error}`, 'error'); }
    finally { busy = false; updateControls(); }
  }
  function choosePending(files) {
    const selected = Array.from(files || []);
    if (selected.length > 20) return setStatus('Chỉ được thêm tối đa 20 attachment mỗi lần.', 'error');
    if (selected.some(file => file.size > 25 * 1024 * 1024)) return setStatus('Mỗi attachment không được vượt 25 MB.', 'error');
    const total = selected.reduce((sum, file) => sum + file.size, 0);
    if (total > 50 * 1024 * 1024) return setStatus('Tổng attachment không được vượt 50 MB.', 'error');
    pendingFiles = selected; renderPending(); updateControls(); setStatus(selected.length ? `Đã chọn ${selected.length} attachment để thêm.` : 'Chưa chọn attachment.');
  }
  async function addAttachments() {
    if (!sourceFile || !pendingFiles.length || busy) return; busy = true; updateControls(); setStatus('Đang tạo PDF mới có attachment…');
    try {
      const { endpoint, token } = await coreSession(); const body = new FormData(); body.append('file', sourceFile, sourceFile.name); pendingFiles.forEach(file => body.append('attachments', file, file.name));
      const response = await fetch(`${endpoint}/pdf/attachments/add`, { method:'POST', headers:auth(token), body });
      if (!response.ok) throw new Error(await responseError(response));
      downloadBlob(await response.blob(), responseFilename(response, 'solyan-with-attachments.pdf'));
      setStatus('Đã tạo PDF mới có attachment. File nguồn không bị thay đổi.', 'success');
    } catch (error) { setStatus(`Không thể thêm attachment: ${error?.message || error}`, 'error'); }
    finally { busy = false; updateControls(); }
  }

  pickFile.addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', () => setSource(fileInput.files?.[0])); removeFile.addEventListener('click', clearSource);
  refreshBtn.addEventListener('click', listAttachments); pickAttachments.addEventListener('click', () => attachmentInput.click()); attachmentInput.addEventListener('change', () => choosePending(attachmentInput.files)); addBtn.addEventListener('click', addAttachments);
  for (const event of ['dragenter','dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave','drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => setSource(e.dataTransfer?.files?.[0]));
  updateControls();
})();
