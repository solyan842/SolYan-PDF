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
  const report = document.getElementById('report');
  const verdict = document.getElementById('verdict');
  const activeSummary = document.getElementById('activeSummary');
  const javascriptSection = document.getElementById('javascriptSection');
  const javascriptList = document.getElementById('javascriptList');
  const findingsSection = document.getElementById('findingsSection');
  const findingsNote = document.getElementById('findingsNote');
  const findingsList = document.getElementById('findingsList');
  let sourceFile = null;

  function setStatus(message, kind = '') { status.textContent = message; status.classList.remove('error', 'success'); if (kind) status.classList.add(kind); }
  function formatSize(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
  function setFile(file) {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.pdf')) return setStatus('Chỉ hỗ trợ tệp PDF.', 'error');
    if (file.size > 100 * 1024 * 1024) return setStatus('PDF vượt giới hạn 100 MB.', 'error');
    sourceFile = file; fileName.textContent = file.name; fileMeta.textContent = `${formatSize(file.size)} · PDF`;
    selectedFile.hidden = false; inspectBtn.disabled = false; report.hidden = true; setStatus('Sẵn sàng kiểm tra cục bộ.');
  }
  function clearFile() { sourceFile = null; fileInput.value = ''; password.value = ''; selectedFile.hidden = true; inspectBtn.disabled = true; report.hidden = true; setStatus('Chọn một tệp PDF để bắt đầu.'); }
  async function getCoreSession() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri desktop API chưa sẵn sàng.');
    const raw = await invoke('desktop_core_session');
    const [endpoint, token] = String(raw).split('\n');
    if (!endpoint || !token) throw new Error('Phiên local core không hợp lệ.');
    return { endpoint, token };
  }
  function clearNode(node) { while (node.firstChild) node.firstChild.remove(); }
  function readable(value) { if (!value) return '—'; return String(value).startsWith('/') ? String(value).slice(1) : String(value); }
  function addSummary(label, value) {
    const card = document.createElement('div'); card.className = 'summary-card';
    const number = document.createElement('strong'); number.textContent = String(value ?? 0);
    const title = document.createElement('span'); title.textContent = label;
    card.append(number, title); activeSummary.appendChild(card);
  }
  function addFinding(item) {
    const card = document.createElement('article'); card.className = 'finding-card';
    const title = document.createElement('strong');
    title.textContent = item.actionType ? `Action · ${readable(item.actionType)}` : item.subtype ? `Annotation · ${readable(item.subtype)}` : item.key ? `${item.kind} · ${readable(item.key)}` : item.kind;
    card.appendChild(title);
    if (item.target) { const target = document.createElement('p'); target.textContent = `Target: ${item.target}`; card.appendChild(target); }
    const path = document.createElement('small'); path.textContent = `${item.objectRef ? `${item.objectRef} · ` : ''}${item.path || ''}`; card.appendChild(path);
    findingsList.appendChild(card);
  }
  function addJavascript(item, index) {
    const card = document.createElement('article'); card.className = 'finding-card script-card';
    const title = document.createElement('strong'); title.textContent = item.name || `Script ${index + 1}`;
    const meta = document.createElement('p'); meta.textContent = `Nguồn: ${item.source || 'không rõ'} · Object: ${item.objectRef || 'direct'}${item.truncated ? ' · đã cắt theo giới hạn' : ''}`;
    const path = document.createElement('small'); path.textContent = item.path || '';
    const code = document.createElement('pre'); code.className = 'script-preview'; code.textContent = item.script ?? '[Không đọc được payload JavaScript]';
    card.append(title, meta, path, code); javascriptList.appendChild(card);
  }
  function render(data) {
    clearNode(activeSummary); clearNode(javascriptList); clearNode(findingsList);
    const summary = data.summary || {};
    addSummary('JavaScript', summary.javascript); addSummary('Actions', summary.actions); addSummary('Triggers', summary.triggers);
    addSummary('Annotation', summary.activeAnnotations); addSummary('Attachment refs', summary.attachmentReferences); addSummary('Objects đã duyệt', summary.reachableObjects);
    verdict.className = `verdict-card ${data.hasActiveContent ? 'attention' : 'clear'}`;
    verdict.textContent = data.hasActiveContent ? 'Phát hiện cấu trúc cần xem xét. Finding không đồng nghĩa tài liệu chắc chắn độc hại.' : 'Không phát hiện active content trong phạm vi kiểm tra.';
    const scripts = Array.isArray(data.javascript) ? data.javascript : [];
    javascriptSection.hidden = scripts.length === 0; scripts.forEach(addJavascript);
    const findings = Array.isArray(data.findings) ? data.findings : [];
    findingsSection.hidden = findings.length === 0;
    findingsNote.hidden = !data.findingsTruncated;
    if (data.findingsTruncated) findingsNote.textContent = `Danh sách đã đạt giới hạn ${data.limits?.maxFindings || 500} findings; tài liệu có thể còn cấu trúc chưa hiển thị.`;
    findings.forEach(addFinding); report.hidden = false;
  }
  async function inspectPdf() {
    if (!sourceFile || inspectBtn.disabled) return;
    inspectBtn.disabled = true; pickFile.disabled = true; report.hidden = true; setStatus('Đang duyệt cấu trúc PDF…');
    try {
      const { endpoint, token } = await getCoreSession();
      const body = new FormData(); body.append('file', sourceFile, sourceFile.name); body.append('password', password.value || '');
      const response = await fetch(`${endpoint}/pdf/inspect-active-content`, { method: 'POST', headers: { 'X-SolYan-Desktop-Token': token }, body });
      if (!response.ok) {
        let detail = ''; try { const payload = await response.json(); detail = payload?.detail || JSON.stringify(payload); } catch (_) { try { detail = await response.text(); } catch (_) {} }
        throw new Error(detail || `Local core trả mã ${response.status}.`);
      }
      render(await response.json()); setStatus('Kiểm tra hoàn tất. Không có nội dung nào được thực thi.', 'success');
    } catch (error) { setStatus(`Không thể kiểm tra PDF: ${error?.message || error}`, 'error'); }
    finally { inspectBtn.disabled = !sourceFile; pickFile.disabled = false; }
  }
  pickFile.addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click', clearFile); inspectBtn.addEventListener('click', inspectPdf);
  for (const event of ['dragenter','dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave','drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0]));
})();
