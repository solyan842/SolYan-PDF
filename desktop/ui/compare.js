(() => {
  const $ = id => document.getElementById(id);
  const leftFile = $('leftFile'), rightFile = $('rightFile'), runBtn = $('runBtn'), status = $('status'), result = $('result');
  let busy = false;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.classList.remove('error', 'success');
    if (kind) status.classList.add(kind);
  }
  function validFile(file) { return file && file.name.toLowerCase().endsWith('.pdf') && file.size <= 100 * 1024 * 1024; }
  function refresh() {
    $('leftName').textContent = leftFile.files[0] ? `${leftFile.files[0].name} · ${(leftFile.files[0].size / 1048576).toFixed(2)} MB` : 'Chưa chọn tệp';
    $('rightName').textContent = rightFile.files[0] ? `${rightFile.files[0].name} · ${(rightFile.files[0].size / 1048576).toFixed(2)} MB` : 'Chưa chọn tệp';
    runBtn.disabled = busy || !validFile(leftFile.files[0]) || !validFile(rightFile.files[0]);
  }
  async function getCoreSession() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) throw new Error('Tauri desktop API chưa sẵn sàng.');
    const raw = await invoke('desktop_core_session');
    const [endpoint, token] = String(raw).split('\n');
    if (!endpoint || !token) throw new Error('Phiên local core không hợp lệ.');
    return { endpoint, token };
  }
  function render(report) {
    $('leftPages').textContent = `${report.left.pages} trang`;
    $('rightPages').textContent = `${report.right.pages} trang`;
    $('leftSummary').textContent = report.left.name;
    $('rightSummary').textContent = report.right.name;
    $('similarity').textContent = `${Number(report.visual.averageSimilarity).toFixed(2)}%`;
    $('textCounts').textContent = `+${report.text.added} / −${report.text.removed}`;
    $('pageCountWarning').hidden = report.left.pages === report.right.pages;
    const pages = $('pageResults'); pages.replaceChildren();
    for (const page of report.visual.pages) {
      const card = document.createElement('article');
      const label = document.createElement('strong'), score = document.createElement('span'), note = document.createElement('small');
      const value = Number(page.similarity);
      card.className = 'compare-page ' + (value >= 99.5 ? 'good' : value >= 95 ? 'warn' : 'bad');
      label.textContent = `Trang ${page.page}`;
      score.textContent = `${value.toFixed(2)}%`;
      note.textContent = page.sizeMismatch ? 'Khác kích thước raster' : `${Number(page.differentPixels).toLocaleString('vi-VN')} pixel khác`;
      card.append(label, score, note); pages.append(card);
    }
    const changes = $('textChanges'); changes.replaceChildren();
    if (!report.text.changes.length) {
      const empty = document.createElement('p'); empty.className = 'local-note'; empty.textContent = 'Không phát hiện khác biệt văn bản.'; changes.append(empty);
    }
    for (const change of report.text.changes) {
      const row = document.createElement('div'), sign = document.createElement('span'), text = document.createElement('code');
      row.className = 'diff-line ' + change.type;
      sign.textContent = change.type === 'added' ? '+' : '−';
      text.textContent = change.text;
      row.append(sign, text); changes.append(row);
    }
    $('truncatedNotice').hidden = !report.text.truncated;
    result.hidden = false;
  }
  async function run() {
    if (runBtn.disabled) return;
    busy = true; refresh(); result.hidden = true;
    setStatus('Đang trích xuất văn bản và so sánh ảnh từng trang bằng Poppler…');
    try {
      const { endpoint, token } = await getCoreSession();
      const body = new FormData();
      body.append('left', leftFile.files[0], leftFile.files[0].name);
      body.append('right', rightFile.files[0], rightFile.files[0].name);
      const response = await fetch(`${endpoint}/pdf/compare`, { method: 'POST', headers: { 'X-SolYan-Desktop-Token': token }, body });
      if (!response.ok) {
        let detail = '';
        try { const payload = await response.json(); detail = payload?.detail || JSON.stringify(payload); } catch (_) { detail = await response.text(); }
        throw new Error(detail || `Local core trả mã ${response.status}.`);
      }
      render(await response.json());
      setStatus('Đã so sánh xong. Hai PDF nguồn không bị thay đổi.', 'success');
    } catch (error) { setStatus(`Không thể so sánh PDF: ${error?.message || error}`, 'error'); }
    finally { busy = false; refresh(); }
  }
  leftFile.addEventListener('change', refresh);
  rightFile.addEventListener('change', refresh);
  runBtn.addEventListener('click', run);
  refresh();
})();
