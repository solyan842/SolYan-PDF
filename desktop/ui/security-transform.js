(() => {
  const configs = {
    protect: {
      title: 'Bảo vệ PDF', icon: '♢', endpoint: '/pdf/protect', filename: 'solyan-protected.pdf',
      description: 'Mã hóa PDF bằng AES-256 và đặt quyền in, chỉnh sửa, trích xuất theo nhu cầu.',
      button: 'Bảo vệ và tạo PDF mới →',
      working: 'Đang mã hóa PDF bằng AES-256 và kiểm tra file kết quả…',
      done: 'Đã tạo PDF được bảo vệ mới. Tệp nguồn không bị thay đổi.'
    },
    unlock: {
      title: 'Mở khóa PDF', icon: '◇', endpoint: '/pdf/unlock', filename: 'solyan-unlocked.pdf',
      description: 'Gỡ mã hóa khỏi PDF khi bạn có mật khẩu hoặc quyền truy cập hợp pháp vào tài liệu.',
      button: 'Mở khóa và tạo PDF mới →',
      working: 'Đang giải mã PDF và kiểm tra file kết quả…',
      done: 'Đã tạo PDF mở khóa mới. Tệp nguồn không bị thay đổi.'
    }
  };

  const mode = new URLSearchParams(location.search).get('tool') || '';
  const config = configs[mode];
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pickFile = document.getElementById('pickFile');
  const selectedFile = document.getElementById('selectedFile');
  const fileName = document.getElementById('fileName');
  const fileMeta = document.getElementById('fileMeta');
  const removeFile = document.getElementById('removeFile');
  const protectOptions = document.getElementById('protectOptions');
  const unlockOptions = document.getElementById('unlockOptions');
  const password = document.getElementById('password');
  const ownerPassword = document.getElementById('ownerPassword');
  const printMode = document.getElementById('printMode');
  const modifyMode = document.getElementById('modifyMode');
  const allowExtract = document.getElementById('allowExtract');
  const unlockPassword = document.getElementById('unlockPassword');
  const runBtn = document.getElementById('runBtn');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const resultMessage = document.getElementById('resultMessage');
  let sourceFile = null;
  let busy = false;

  if (!config) {
    document.getElementById('toolTitle').textContent = 'Công cụ chưa khả dụng';
    document.getElementById('toolDescription').textContent = 'Cấu hình công cụ bảo mật không hợp lệ.';
    pickFile.disabled = true;
    runBtn.disabled = true;
    return;
  }

  document.title = `${config.title} — SolYan PDF`;
  document.getElementById('breadcrumb').textContent = `Công cụ › ${config.title}`;
  document.getElementById('toolIcon').textContent = config.icon;
  document.getElementById('toolTitle').textContent = config.title;
  document.getElementById('toolDescription').textContent = config.description;
  protectOptions.hidden = mode !== 'protect';
  unlockOptions.hidden = mode !== 'unlock';
  runBtn.textContent = config.button;

  function setStatus(message, kind = '') { status.textContent = message; status.classList.remove('error','success'); if (kind) status.classList.add(kind); }
  function formatSize(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
  function isReady() { return !!sourceFile && !busy && (mode !== 'protect' || password.value.length > 0); }
  function updateControls() { runBtn.disabled = !isReady(); }
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
    selectedFile.hidden = false; result.hidden = true;
    setStatus(mode === 'protect' ? 'Nhập mật khẩu và chọn quyền hạn để tiếp tục.' : 'Nhập mật khẩu hiện tại nếu PDF yêu cầu.');
    updateControls();
  }
  function clearFile() { sourceFile = null; fileInput.value = ''; selectedFile.hidden = true; result.hidden = true; setStatus('Chọn một tệp PDF để bắt đầu.'); updateControls(); }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function errorText(response) { try { const p = await response.json(); return p?.detail || JSON.stringify(p); } catch (_) { try { return await response.text(); } catch (_) { return `HTTP ${response.status}`; } } }
  async function run() {
    if (!isReady()) { updateControls(); return; }
    busy = true; updateControls(); pickFile.disabled = true; result.hidden = true; setStatus(config.working);
    try {
      const { endpoint, token } = await coreSession();
      const body = new FormData();
      body.append('file', sourceFile, sourceFile.name);
      if (mode === 'protect') {
        body.append('password', password.value);
        if (ownerPassword.value) body.append('owner_password', ownerPassword.value);
        body.append('print_mode', printMode.value);
        body.append('modify_mode', modifyMode.value);
        body.append('allow_extract', String(allowExtract.checked));
      } else {
        body.append('password', unlockPassword.value || '');
      }
      const response = await fetch(`${endpoint}${config.endpoint}`, { method:'POST', headers:{ 'X-SolYan-Desktop-Token': token }, body });
      if (!response.ok) throw new Error(await errorText(response));
      download(await response.blob(), config.filename);
      resultMessage.textContent = config.done; result.hidden = false; setStatus('Hoàn tất. PDF nguồn không bị thay đổi.', 'success');
    } catch (error) { setStatus(`Không thể ${mode === 'protect' ? 'bảo vệ' : 'mở khóa'} PDF: ${error?.message || error}`, 'error'); }
    finally { busy = false; pickFile.disabled = false; updateControls(); }
  }

  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click', clearFile);
  runBtn.addEventListener('click', run);
  password.addEventListener('input', updateControls);
  for (const event of ['dragenter','dragover']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave','drop']) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0]));
  updateControls();
})();
