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
  const documentGrid = document.getElementById('documentGrid');
  const metadataGrid = document.getElementById('metadataGrid');
  const structureGrid = document.getElementById('structureGrid');
  const securityNote = document.getElementById('securityNote');
  const fontsTable = document.getElementById('fontsTable');
  const imagesTable = document.getElementById('imagesTable');
  const fileDetailGrid = document.getElementById('fileDetailGrid');
  let sourceFile = null;

  const structureLabels = {
    pages: 'Trang', fonts: 'Font', images: 'Hình ảnh', streams: 'Streams',
    reachableObjects: 'Đối tượng', formFields: 'Trường biểu mẫu', signatureFields: 'Trường chữ ký',
    embeddedFiles: 'Tệp đính kèm', outlines: 'Bookmarks', javascriptActions: 'JavaScript',
    activeAnnotations: 'Annotation chủ động', xfaEntries: 'XFA'
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
    setStatus('Sẵn sàng phân tích cục bộ.');
  }
  function clearFile() {
    sourceFile = null; fileInput.value = ''; password.value = '';
    selectedFile.hidden = true; inspectBtn.disabled = true; result.hidden = true;
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
  function fillObject(container, object, emptyText = 'Không có dữ liệu') {
    clearNode(container); const entries = Object.entries(object || {});
    if (!entries.length) return addKv(container, 'Trạng thái', emptyText);
    entries.forEach(([key, value]) => addKv(container, key, typeof value === 'object' ? JSON.stringify(value) : value));
  }
  function addSummary(label, value, hint = '') {
    const card = document.createElement('div'); card.className = 'summary-card';
    const number = document.createElement('strong'); number.textContent = String(value ?? '—');
    const title = document.createElement('span'); title.textContent = label;
    card.append(number, title);
    if (hint) { const note = document.createElement('small'); note.textContent = hint; card.appendChild(note); }
    summaryGrid.appendChild(card);
  }
  function tableText(table) {
    if (!table?.rows?.length) return 'Không có dữ liệu.';
    const suffix = table.truncated ? `\n… đã giới hạn ở ${table.rows.length} dòng` : '';
    return table.rows.join('\n') + suffix;
  }
  function render(data) {
    clearNode(summaryGrid);
    addSummary('Trang', data.structure?.pages ?? data.document?.Pages ?? '—');
    addSummary('Dung lượng', formatSize(data.file?.bytes || 0));
    addSummary('Hình ảnh', data.structure?.images ?? data.images?.count ?? 0);
    addSummary('Font', data.structure?.fonts ?? data.fonts?.count ?? 0);
    addSummary('Mã hóa', data.encryption?.encrypted ? 'Có' : 'Không');
    addSummary('Chữ ký', data.structure?.signatureFields ?? 0);
    fillObject(documentGrid, data.document);
    fillObject(metadataGrid, data.metadata);
    clearNode(structureGrid);
    Object.entries(structureLabels).forEach(([key, label]) => addKv(structureGrid, label, data.structure?.[key] ?? 0));
    const risks = [];
    if (data.structure?.javascriptActions) risks.push(`${data.structure.javascriptActions} JavaScript action`);
    if (data.structure?.activeAnnotations) risks.push(`${data.structure.activeAnnotations} annotation chủ động`);
    if (data.structure?.embeddedFiles) risks.push(`${data.structure.embeddedFiles} tệp đính kèm`);
    if (data.structure?.xfaEntries) risks.push(`${data.structure.xfaEntries} mục XFA`);
    securityNote.className = `security-note ${risks.length ? 'warning' : 'safe'}`;
    securityNote.textContent = risks.length ? `Cần chú ý: ${risks.join(' · ')}` : 'Không phát hiện JavaScript, XFA hoặc annotation chủ động trong phần cấu trúc đã kiểm tra.';
    fontsTable.textContent = tableText(data.fonts);
    imagesTable.textContent = tableText(data.images);
    clearNode(fileDetailGrid);
    addKv(fileDetailGrid, 'Tên tệp', data.file?.name || sourceFile?.name || '—');
    addKv(fileDetailGrid, 'Dung lượng byte', data.file?.bytes ?? '—');
    addKv(fileDetailGrid, 'SHA-256', data.file?.sha256 || '—');
    result.hidden = false;
  }
  async function inspectPdf() {
    if (!sourceFile || inspectBtn.disabled) return;
    inspectBtn.disabled = true; pickFile.disabled = true; result.hidden = true;
    setStatus('Đang đọc cấu trúc, metadata, font và hình ảnh…');
    try {
      const { endpoint, token } = await getCoreSession();
      const body = new FormData(); body.append('file', sourceFile, sourceFile.name); body.append('password', password.value || '');
      const response = await fetch(`${endpoint}/pdf/info`, { method: 'POST', headers: { 'X-SolYan-Desktop-Token': token }, body });
      if (!response.ok) {
        let detail = ''; try { const payload = await response.json(); detail = payload?.detail || JSON.stringify(payload); } catch (_) { try { detail = await response.text(); } catch (_) {} }
        throw new Error(detail || `Local core trả mã ${response.status}.`);
      }
      const data = await response.json(); render(data); setStatus('Phân tích hoàn tất. PDF gốc không bị thay đổi.', 'success');
    } catch (error) { setStatus(`Không thể phân tích PDF: ${error?.message || error}`, 'error'); }
    finally { inspectBtn.disabled = !sourceFile; pickFile.disabled = false; }
  }
  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click', clearFile); inspectBtn.addEventListener('click', inspectPdf);
  for (const event of ['dragenter','dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave','drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0]));
})();
