(() => {
  const zone = document.getElementById('dropzone');
  const input = document.getElementById('fileInput');
  const pick = document.getElementById('pickFiles');
  const list = document.getElementById('fileList');
  const count = document.getElementById('fileCount');
  const mergeBtn = document.getElementById('mergeBtn');
  const outputName = document.getElementById('outputName');
  const status = document.getElementById('status');
  let files = [];
  let busy = false;

  const formatSize = bytes => {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  };

  const safeOutputName = value => {
    const cleaned = (value || 'Tai-lieu-da-gop.pdf').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim();
    return (cleaned || 'Tai-lieu-da-gop.pdf').toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
  };

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `status-text${kind ? ` ${kind}` : ''}`;
  }

  function render() {
    count.textContent = `Danh sách tệp (${files.length} tệp)`;
    list.innerHTML = files.map((file, index) => `<article class="file-card" draggable="${busy ? 'false' : 'true'}" data-index="${index}"><div class="page">PDF<br>${index + 1}</div><strong title="${file.name}">${file.name}</strong><span>${formatSize(file.size)}</span></article>`).join('');
    mergeBtn.disabled = busy || files.length < 2;
    pick.disabled = busy;
    if (!busy) setStatus(files.length < 2 ? 'Chọn ít nhất 2 tệp PDF để bắt đầu.' : `Sẵn sàng nối ${files.length} tệp theo thứ tự đang hiển thị.`);
  }

  function add(selected) {
    if (busy) return;
    const pdfs = Array.from(selected).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    files.push(...pdfs);
    input.value = '';
    render();
  }

  pick.addEventListener('click', () => input.click());
  input.addEventListener('change', () => add(input.files));
  ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); if (!busy) zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', event => add(event.dataTransfer.files));

  let dragged = null;
  list.addEventListener('dragstart', event => { if (!busy) dragged = Number(event.target.closest('.file-card')?.dataset.index); });
  list.addEventListener('dragover', event => event.preventDefault());
  list.addEventListener('drop', event => {
    event.preventDefault();
    if (busy) return;
    const target = Number(event.target.closest('.file-card')?.dataset.index);
    if (!Number.isInteger(dragged) || !Number.isInteger(target) || dragged === target) return;
    const [item] = files.splice(dragged, 1);
    files.splice(target, 0, item);
    dragged = null;
    render();
  });

  mergeBtn.addEventListener('click', async () => {
    if (busy || files.length < 2) return;
    if (!window.PDFLib?.PDFDocument) {
      setStatus('Thành phần xử lý PDF cục bộ chưa được đóng gói đúng.', 'error');
      return;
    }

    busy = true;
    render();
    setStatus(`Đang nối ${files.length} tệp…`);
    try {
      const result = await window.PDFLib.PDFDocument.create();
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`Đang xử lý ${index + 1}/${files.length}: ${files[index].name}`);
        const source = await window.PDFLib.PDFDocument.load(await files[index].arrayBuffer(), {
          ignoreEncryption: false,
          updateMetadata: false
        });
        const pages = await result.copyPages(source, source.getPageIndices());
        pages.forEach(page => result.addPage(page));
      }
      const bytes = await result.save({ useObjectStreams: true });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeOutputName(outputName.value);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setStatus(`Đã nối ${files.length} tệp. Chọn Lưu hoặc Lưu thành trong phần Kết quả.`, 'success');
    } catch (cause) {
      setStatus(`Không thể nối PDF: ${cause instanceof Error ? cause.message : 'tệp không hợp lệ hoặc được mã hóa.'}`, 'error');
    } finally {
      busy = false;
      mergeBtn.disabled = files.length < 2;
      pick.disabled = false;
      list.querySelectorAll('.file-card').forEach(card => card.setAttribute('draggable', 'true'));
    }
  });

  render();
})();
