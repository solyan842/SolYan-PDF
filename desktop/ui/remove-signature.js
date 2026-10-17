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
  const resultVerdict = document.getElementById('resultVerdict');
  const signatureSummary = document.getElementById('signatureSummary');
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
    selectedFile.hidden = false; result.hidden = true; setStatus('Sẵn sàng tạo bản PDF không còn chữ ký.'); updateControls();
  }
  function clearFile() { sourceFile = null; fileInput.value = ''; selectedFile.hidden = true; result.hidden = true; setStatus('Chọn một tệp PDF để bắt đầu.'); updateControls(); }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function errorText(response) { try { const p = await response.json(); return p?.detail || JSON.stringify(p); } catch (_) { try { return await response.text(); } catch (_) { return `HTTP ${response.status}`; } } }
  function clearNode(node) { while (node.firstChild) node.firstChild.remove(); }
  function addSummary(label, value) {
    const card = document.createElement('div'); card.className = 'summary-card';
    const number = document.createElement('strong'); number.textContent = String(value || 0);
    const title = document.createElement('span'); title.textContent = label;
    card.append(number, title); signatureSummary.appendChild(card);
  }
  async function run() {
    if (!sourceFile || busy) return;
    busy = true; updateControls(); pickFile.disabled = true; result.hidden = true; setStatus('Đang loại cấu trúc chữ ký và kiểm tra PDF kết quả…');
    try {
      const { endpoint, token } = await coreSession();
      const body = new FormData(); body.append('file', sourceFile, sourceFile.name);
      const response = await fetch(`${endpoint}/pdf/remove-signatures`, { method:'POST', headers:{ 'X-SolYan-Desktop-Token': token }, body });
      if (!response.ok) throw new Error(await errorText(response));
      const counts = {
        fields: Number(response.headers.get('X-SolYan-Signature-Fields-Removed') || 0),
        widgets: Number(response.headers.get('X-SolYan-Signature-Widgets-Removed') || 0),
        values: Number(response.headers.get('X-SolYan-Signature-Values-Removed') || 0),
        permissions: Number(response.headers.get('X-SolYan-Signature-Permissions-Removed') || 0),
        dss: Number(response.headers.get('X-SolYan-Signature-DSS-Removed') || 0)
      };
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      download(await response.blob(), 'solyan-unsigned.pdf');
      clearNode(signatureSummary);
      addSummary('Signature fields', counts.fields); addSummary('Widgets', counts.widgets); addSummary('Values', counts.values); addSummary('Permissions', counts.permissions); addSummary('DSS', counts.dss);
      resultVerdict.textContent = total ? `Đã loại ${total} mục cấu trúc chữ ký khỏi bản PDF mới.` : 'Không tìm thấy cấu trúc chữ ký cần loại; đã tạo bản PDF mới đã kiểm tra.';
      result.hidden = false; setStatus('Hoàn tất. PDF nguồn không bị thay đổi.', 'success');
    } catch (error) { setStatus(`Không thể xóa chữ ký: ${error?.message || error}`, 'error'); }
    finally { busy = false; pickFile.disabled = false; updateControls(); }
  }

  pickFile.addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', () => setFile(fileInput.files?.[0])); removeFile.addEventListener('click', clearFile); runBtn.addEventListener('click', run);
  for (const event of ['dragenter','dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave','drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0])); updateControls();
})();
