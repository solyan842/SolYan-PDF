(() => {
  const zone = document.getElementById('dropzone');
  const input = document.getElementById('fileInput');
  const pick = document.getElementById('pickFiles');
  const list = document.getElementById('fileList');
  const count = document.getElementById('fileCount');
  const mergeBtn = document.getElementById('mergeBtn');
  const status = document.getElementById('status');
  let files = [];

  const formatSize = bytes => {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  };

  function render() {
    count.textContent = `Danh sách tệp (${files.length} tệp)`;
    list.innerHTML = files.map((file, index) => `<article class="file-card" draggable="true" data-index="${index}"><div class="page">PDF<br>${index + 1}</div><strong title="${file.name}">${file.name}</strong><span>${formatSize(file.size)}</span></article>`).join('');
  }

  function add(selected) {
    const pdfs = Array.from(selected).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    files.push(...pdfs);
    render();
  }

  pick.addEventListener('click', () => input.click());
  input.addEventListener('change', () => add(input.files));
  ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', event => add(event.dataTransfer.files));

  let dragged = null;
  list.addEventListener('dragstart', event => { dragged = Number(event.target.closest('.file-card')?.dataset.index); });
  list.addEventListener('dragover', event => event.preventDefault());
  list.addEventListener('drop', event => {
    event.preventDefault();
    const target = Number(event.target.closest('.file-card')?.dataset.index);
    if (!Number.isInteger(dragged) || !Number.isInteger(target) || dragged === target) return;
    const [item] = files.splice(dragged, 1);
    files.splice(target, 0, item);
    dragged = null;
    render();
  });

  mergeBtn.addEventListener('click', () => {
    if (files.length < 2) {
      status.textContent = 'Hãy chọn ít nhất 2 tệp PDF để nối.';
      status.style.color = '#c53b52';
      return;
    }
    status.textContent = `Đã sẵn sàng nối ${files.length} tệp. D2 sẽ nối nút này vào backend local hiện có.`;
    status.style.color = '#18794e';
  });
})();
