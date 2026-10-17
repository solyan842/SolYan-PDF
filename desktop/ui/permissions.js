(() => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pickFile = document.getElementById('pickFile');
  const selectedFile = document.getElementById('selectedFile');
  const fileName = document.getElementById('fileName');
  const fileMeta = document.getElementById('fileMeta');
  const removeFile = document.getElementById('removeFile');
  const password = document.getElementById('password');
  const inspectBtn = document.getElementById('inspectBtn');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const summaryGrid = document.getElementById('summaryGrid');
  const permissionGrid = document.getElementById('permissionGrid');
  const detailGrid = document.getElementById('detailGrid');
  const securityNote = document.getElementById('securityNote');
  let sourceFile = null;

  const permissionLabels = {
    accessibility: 'Trợ năng',
    annotate: 'Chú thích',
    assemble: 'Lắp ghép tài liệu',
    extract: 'Trích xuất / sao chép',
    form: 'Điền biểu mẫu',
    modify: 'Chỉnh sửa',
    print: 'In',
    'print-high': 'In chất lượng cao'
  };

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
    if (!file.name.toLocaleLowerCase().endsWith('.pdf')) return setStatus('Chỉ hỗ trợ tệp PDF.', 'error');
    sourceFile = file;
    fileName.textContent = file.name;
    fileMeta.textContent = `${formatSize(file.size)} · PDF`;
    selectedFile.hidden = false;
    inspectBtn.disabled = false;
    result.hidden = true;
    setStatus('Sẵn sàng kiểm tra quyền hạn cục bộ.');
  }
  function clearFile() {
    sourceFile = null;
    fileInput.value = '';
    password.value = '';
    selectedFile.hidden = true;
    inspectBtn.disabled = true;
    result.hidden = true;
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
  function clearNode(node) { while (node.firstChild) node.firstChild.remove(); }
  function addKv(container, key, value) {
    const item = document.createElement('div'); item.className = 'kv-item';
    const label = document.createElement('span'); label.className = 'kv-label'; label.textContent = key;
    const text = document.createElement('strong'); text.className = 'kv-value'; text.textContent = String(value ?? '—');
    item.append(label, text); container.appendChild(item);
  }
  function addSummary(label, value, hint = '') {
    const card = document.createElement('div'); card.className = 'summary-card';
    const number = document.createElement('strong'); number.textContent = String(value ?? '—');
    const title = document.createElement('span'); title.textContent = label;
    card.append(number, title);
    if (hint) { const note = document.createElement('small'); note.textContent = hint; card.appendChild(note); }
    summaryGrid.appendChild(card);
  }
  function friendlyPermission(key) {
    const normalized = key.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return permissionLabels[normalized] || key;
  }
  function render(data) {
    const encryption = data.encryption || {};
    const permissions = encryption.permissions || {};
    const details = encryption.details || {};
    clearNode(summaryGrid);
    addSummary('Mã hóa', encryption.encrypted ? 'Có' : 'Không');
    addSummary('Quyền được phép', Object.values(permissions).filter(v => v === 'allowed').length);
    addSummary('Quyền bị chặn', Object.values(permissions).filter(v => v === 'not allowed').length);
    addSummary('Trang', data.structure?.pages ?? data.document?.Pages ?? '—');

    clearNode(permissionGrid);
    const entries = Object.entries(permissions);
    if (!entries.length) {
      addKv(permissionGrid, 'Trạng thái', encryption.encrypted ? 'Không có permission chi tiết từ qpdf.' : 'Tài liệu không mã hóa; không có hạn chế permission do mã hóa.');
    } else {
      entries.forEach(([key, value]) => addKv(permissionGrid, friendlyPermission(key), value === 'allowed' ? 'Được phép' : value === 'not allowed' ? 'Không được phép' : value));
    }

    clearNode(detailGrid);
    const detailEntries = Object.entries(details);
    if (!detailEntries.length) addKv(detailGrid, 'Trạng thái', encryption.encrypted ? 'Không có chi tiết bổ sung.' : 'Không mã hóa.');
    else detailEntries.forEach(([key, value]) => addKv(detailGrid, key, value));

    securityNote.className = `security-note ${encryption.encrypted ? 'warning' : 'safe'}`;
    securityNote.textContent = encryption.encrypted
      ? 'Tài liệu có mã hóa. Các quyền hiển thị phản ánh permission khai báo trong PDF; công cụ này không gỡ hoặc vượt qua mật khẩu.'
      : 'Tài liệu không mã hóa bằng cơ chế permission của PDF.';
    result.hidden = false;
  }
  async function inspectPdf() {
    if (!sourceFile || inspectBtn.disabled) return;
    inspectBtn.disabled = true; pickFile.disabled = true; result.hidden = true;
    setStatus('Đang đọc trạng thái mã hóa và quyền hạn…');
    try {
      const { endpoint, token } = await getCoreSession();
      const body = new FormData();
      body.append('file', sourceFile, sourceFile.name);
      body.append('password', password.value || '');
      const response = await fetch(`${endpoint}/pdf/info`, { method: 'POST', headers: { 'X-SolYan-Desktop-Token': token }, body });
      if (!response.ok) {
        let detail = '';
        try { const payload = await response.json(); detail = payload?.detail || JSON.stringify(payload); }
        catch (_) { try { detail = await response.text(); } catch (_) {} }
        throw new Error(detail || `Local core trả mã ${response.status}.`);
      }
      render(await response.json());
      setStatus('Kiểm tra hoàn tất. PDF gốc không bị thay đổi.', 'success');
    } catch (error) {
      setStatus(`Không thể kiểm tra quyền hạn: ${error?.message || error}`, 'error');
    } finally {
      inspectBtn.disabled = !sourceFile; pickFile.disabled = false;
    }
  }

  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click', clearFile);
  inspectBtn.addEventListener('click', inspectPdf);
  for (const event of ['dragenter','dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave','drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0]));
})();
