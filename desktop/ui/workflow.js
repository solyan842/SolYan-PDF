(() => {
  const $ = (id) => document.getElementById(id);
  const dropzone = $('dropzone'), fileInput = $('fileInput'), pickFile = $('pickFile');
  const selectedFile = $('selectedFile'), fileName = $('fileName'), fileMeta = $('fileMeta');
  const removeFile = $('removeFile'), runBtn = $('runBtn'), status = $('status');
  const rotateStep = $('rotateStep'), watermarkStep = $('watermarkStep');
  const numbersStep = $('numbersStep'), metadataStep = $('metadataStep');
  const rotateOptions = $('rotateOptions'), watermarkOptions = $('watermarkOptions');
  const metadataOptions = $('metadataOptions'), rotation = $('rotation');
  const watermarkText = $('watermarkText'), titleText = $('titleText');
  let sourceFile = null, busy = false;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.classList.remove('error', 'success');
    if (kind) status.classList.add(kind);
  }

  function refresh() {
    rotateOptions.hidden = !rotateStep.checked;
    watermarkOptions.hidden = !watermarkStep.checked;
    metadataOptions.hidden = !metadataStep.checked;
    runBtn.disabled = busy || !sourceFile || ![rotateStep, watermarkStep, numbersStep, metadataStep].some(x => x.checked);
    runBtn.textContent = busy ? 'Đang chạy workflow…' : 'Chạy workflow →';
  }

  function setFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) return setStatus('Chỉ hỗ trợ tệp PDF.', 'error');
    if (file.size > 100 * 1024 * 1024) return setStatus('PDF vượt giới hạn 100 MB.', 'error');
    sourceFile = file;
    fileName.textContent = file.name;
    fileMeta.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB · PDF';
    selectedFile.hidden = false;
    setStatus('Đã chọn PDF. Chọn các thao tác rồi chạy workflow.');
    refresh();
  }

  function clearFile() {
    sourceFile = null;
    fileInput.value = '';
    selectedFile.hidden = true;
    setStatus('Chọn một tệp PDF và các thao tác cần chạy.');
    refresh();
  }

  function offerOutput(bytes) {
    const name = window.SOLYAN_OUTPUT_NAME(sourceFile.name, 'workflow');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    setStatus('Đã tạo ' + name + '. Chọn Lưu hoặc Lưu thành trong phần Kết quả.', 'success');
  }

  async function run() {
    if (!sourceFile || runBtn.disabled) return;
    const steps = [rotateStep.checked, watermarkStep.checked, numbersStep.checked, metadataStep.checked];
    if (!steps.some(Boolean)) return setStatus('Chọn ít nhất một thao tác.', 'error');
    busy = true;
    refresh();
    setStatus('Đang xử lý PDF trên máy…');
    try {
      const pdf = await window.PDFLib.PDFDocument.load(await sourceFile.arrayBuffer());
      const pages = pdf.getPages();
      let font = null;
      if (watermarkStep.checked || numbersStep.checked) font = await pdf.embedFont(window.PDFLib.StandardFonts.Helvetica);

      if (rotateStep.checked) {
        const angle = Number(rotation.value);
        pages.forEach(page => page.setRotation(window.PDFLib.degrees((page.getRotation().angle + angle) % 360)));
      }
      if (watermarkStep.checked) {
        const label = watermarkText.value.trim();
        if (!label) throw new Error('Nhập nội dung watermark trước khi chạy.');
        pages.forEach(page => {
          const { width, height } = page.getSize();
          const size = Math.max(20, Math.min(width, height) / 12);
          const textWidth = font.widthOfTextAtSize(label, size);
          page.drawText(label, { x: (width - textWidth) / 2, y: height / 2, size, font, color: window.PDFLib.rgb(.35, .4, .48), opacity: .16, rotate: window.PDFLib.degrees(35) });
        });
      }
      if (numbersStep.checked) {
        pages.forEach((page, index) => {
          const label = String(index + 1), size = 10;
          const textWidth = font.widthOfTextAtSize(label, size);
          page.drawText(label, { x: (page.getWidth() - textWidth) / 2, y: 18, size, font, color: window.PDFLib.rgb(.32, .35, .4) });
        });
      }
      if (metadataStep.checked) {
        pdf.setTitle(titleText.value.trim() || sourceFile.name.replace(/\.pdf$/i, ''));
        pdf.setCreator('SolYan PDF');
        pdf.setProducer('SolYan PDF workflow');
      }
      offerOutput(await pdf.save({ useObjectStreams: true }));
    } catch (error) {
      setStatus('Không thể chạy workflow: ' + (error?.message || error), 'error');
    } finally {
      busy = false;
      refresh();
    }
  }

  pickFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0]));
  removeFile.addEventListener('click', clearFile);
  [rotateStep, watermarkStep, numbersStep, metadataStep].forEach(input => input.addEventListener('change', refresh));
  runBtn.addEventListener('click', run);
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, eventObject => { eventObject.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, eventObject => { eventObject.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', eventObject => setFile(eventObject.dataTransfer?.files?.[0]));
  refresh();
})();

