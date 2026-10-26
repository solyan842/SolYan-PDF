import { applyScannerPixelEffects, deterministicScannerRotation, SCANNER_QUALITY_PRESETS, scannerPageSeed, transformRgba } from './visual-effects.js';

const MAX_FILE = 100 * 1024 * 1024, MAX_PAGES = 100, MAX_PAGE_PIXELS = 25_000_000;
const $ = id => document.getElementById(id);
const mode = new URLSearchParams(location.search).get('tool') === 'scanner-effect' ? 'scanner-effect' : 'color';
const cfg = mode === 'color'
  ? { name: 'Đổi màu PDF', desc: 'Đảo màu, chuyển thang xám hoặc tạo bảng màu tương phản cao.', icon: 'color', suffix: 'color', action: 'Tạo PDF đã đổi màu' }
  : { name: 'Hiệu ứng máy scan', desc: 'Tạo bản scan raster với nhiễu, viền giấy và độ nghiêng có thể tái lập.', icon: 'scanner-effect', suffix: 'scanner', action: 'Tạo PDF hiệu ứng scan' };
document.title = cfg.name + ' — SolYan PDF';
$('crumbName').textContent = $('toolName').textContent = cfg.name;
$('toolDesc').textContent = cfg.desc;
$('toolIcon').innerHTML = window.SOLYAN_PHOSPHOR.tool(cfg.icon, 'edit');
$('runBtn').textContent = cfg.action;
$('colorOptions').hidden = mode !== 'color';
$('scannerOptions').hidden = mode !== 'scanner-effect';
let selected = null, busy = false;
function status(text, kind) {
  const node = $('status'); node.textContent = text; node.classList.remove('error', 'success');
  if (kind) node.classList.add(kind);
}
function refresh() {
  $('runBtn').disabled = busy || !selected;
  $('fileLabel').textContent = selected ? selected.name + ' · ' + (selected.size / 1048576).toFixed(2) + ' MB' : 'Chưa chọn tệp';
}
function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Không thể tạo PNG từ trang PDF.')), 'image/png'));
}
function reset(canvas) { if (canvas) { canvas.width = 1; canvas.height = 1; } }
function paperGradient(ctx, w, h, yellow, vertical) {
  const g = vertical ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, yellow ? '#ded5b6' : '#d9d9d9'); g.addColorStop(1, yellow ? '#f4edcf' : '#eeeeee'); return g;
}
function rotateCanvas(src, degrees, yellow, vertical) {
  if (Math.abs(degrees) < 0.0001) return src;
  const r = degrees * Math.PI / 180, sin = Math.abs(Math.sin(r)), cos = Math.abs(Math.cos(r));
  const w = Math.ceil(src.width * cos + src.height * sin), h = Math.ceil(src.height * cos + src.width * sin);
  if (w * h > 32_000_000) throw new Error('Canvas sau khi xoay vượt 32 triệu pixel; hãy giảm chất lượng hoặc viền.');
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'); if (!ctx) throw new Error('Canvas 2D không khả dụng.');
  ctx.fillStyle = paperGradient(ctx, w, h, yellow, vertical); ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2); ctx.rotate(r); ctx.drawImage(src, -src.width / 2, -src.height / 2); return out;
}
async function run() {
  if (!selected || busy) return;
  busy = true; refresh(); $('progressBar').hidden = false;
  let task;
  try {
    if (selected.size > MAX_FILE) throw new Error('PDF vượt giới hạn 100 MB.');
    const pdfjs = await import('./vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).toString();
    task = pdfjs.getDocument({
      data: new Uint8Array(await selected.arrayBuffer()), isEvalSupported: false, useSystemFonts: true,
      cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).toString(), cMapPacked: true,
      standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).toString(),
      wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).toString(),
    });
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) throw new Error('PDF vượt giới hạn 100 trang.');
    const output = await window.PDFLib.PDFDocument.create(), totalLimit = mode === 'color' ? 250_000_000 : 150_000_000;
    let totalPixels = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), preset = mode === 'scanner-effect' ? SCANNER_QUALITY_PRESETS[$('quality').value] : null;
      const dpi = preset ? preset.dpi : Number($('dpi').value), scale = dpi / 72, viewport = page.getViewport({ scale });
      const w = Math.ceil(viewport.width), h = Math.ceil(viewport.height), pixels = w * h;
      if (pixels > MAX_PAGE_PIXELS) throw new Error('Trang ' + n + ' vượt giới hạn 25 triệu pixel ở ' + dpi + ' DPI.');
      totalPixels += pixels; if (totalPixels > totalLimit) throw new Error('Tổng raster vượt giới hạn ' + (totalLimit / 1_000_000) + ' triệu pixel.');
      $('progressBar').value = Math.round((n - 1) / pdf.numPages * 100);
      status('Đang xử lý trang ' + n + '/' + pdf.numPages + ' · ' + dpi + ' DPI…');
      const base = document.createElement('canvas'); base.width = w; base.height = h;
      let softened, framed, finalCanvas;
      try {
        const ctx = base.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('Canvas 2D không khả dụng.');
        await page.render({ canvas: base, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
        const imageData = ctx.getImageData(0, 0, w, h);
        let physicalWidth, physicalHeight;
        if (mode === 'color') {
          imageData.data.set(transformRgba(imageData.data, {
            mode: $('colorMode').value, threshold: Number($('threshold').value),
            textColor: $('textColor').value, backgroundColor: $('backgroundColor').value,
          }));
          ctx.putImageData(imageData, 0, 0);
          physicalWidth = viewport.width / scale; physicalHeight = viewport.height / scale;
          finalCanvas = base;
        } else {
          const yellow = $('yellowish').checked;
          imageData.data.set(applyScannerPixelEffects(imageData.data, w, h, {
            colorspace: $('colorspace').value, brightness: preset.brightness, contrast: preset.contrast,
            noise: preset.noise, yellowish: yellow, seed: scannerPageSeed(n - 1),
          }));
          ctx.putImageData(imageData, 0, 0);
          softened = document.createElement('canvas'); softened.width = w; softened.height = h;
          const soft = softened.getContext('2d'); if (!soft) throw new Error('Canvas 2D không khả dụng.');
          const blur = preset.blur * Math.min(w, h) / 1000; soft.filter = blur > 0 ? 'blur(' + blur.toFixed(3) + 'px)' : 'none'; soft.drawImage(base, 0, 0); soft.filter = 'none';
          const border = Number($('border').value), fw = w + border * 2, fh = h + border * 2;
          if (fw * fh > 32_000_000) throw new Error('Canvas có viền vượt 32 triệu pixel.');
          framed = document.createElement('canvas'); framed.width = fw; framed.height = fh;
          const frame = framed.getContext('2d'); if (!frame) throw new Error('Canvas 2D không khả dụng.');
          const vertical = n % 2 === 1; frame.fillStyle = paperGradient(frame, fw, fh, yellow, vertical); frame.fillRect(0, 0, fw, fh); frame.drawImage(softened, border, border);
          finalCanvas = rotateCanvas(framed, deterministicScannerRotation(n - 1, $('rotation').value), yellow, !vertical);
          const physical = page.getViewport({ scale: 1 }); physicalWidth = physical.width; physicalHeight = physical.height;
        }
        const png = await output.embedPng(await (await canvasBlob(finalCanvas)).arrayBuffer());
        const outPage = output.addPage([physicalWidth, physicalHeight]);
        if (mode === 'color') outPage.drawImage(png, { x: 0, y: 0, width: physicalWidth, height: physicalHeight });
        else {
          const fit = Math.min(physicalWidth / finalCanvas.width, physicalHeight / finalCanvas.height);
          const dw = finalCanvas.width * fit, dh = finalCanvas.height * fit;
          outPage.drawImage(png, { x: (physicalWidth - dw) / 2, y: (physicalHeight - dh) / 2, width: dw, height: dh });
        }
      } finally { reset(base); reset(softened); reset(framed); if (finalCanvas && finalCanvas !== base && finalCanvas !== framed) reset(finalCanvas); }
    }
    $('progressBar').value = 100; status('Đang đóng gói PDF rasterized…');
    const blob = new Blob([await output.save({ useObjectStreams: true })], { type: 'application/pdf' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = window.SOLYAN_OUTPUT_NAME(selected.name, cfg.suffix); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    status('Hoàn tất ' + pdf.numPages + ' trang. PDF nguồn vẫn nguyên vẹn.', 'success');
    await task.destroy(); task = null;
  } catch (err) { status('Không thể xử lý PDF: ' + (err?.message || err), 'error'); }
  finally { if (task) await task.destroy().catch(() => {}); $('progressBar').hidden = true; busy = false; refresh(); }
}
$('fileInput').addEventListener('change', () => {
  const file = $('fileInput').files?.[0] || null;
  if (file && (file.size > MAX_FILE || (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf'))) {
    selected = null; $('fileInput').value = ''; status('Chỉ nhận PDF tối đa 100 MB.', 'error');
  } else { selected = file; status(file ? 'Tệp đã sẵn sàng xử lý.' : 'Chọn PDF để bắt đầu.'); }
  refresh();
});
$('runBtn').addEventListener('click', run);
$('dpi').addEventListener('input', () => $('dpiLabel').textContent = $('dpi').value + ' DPI');
$('threshold').addEventListener('input', () => $('thresholdLabel').textContent = $('threshold').value);
$('border').addEventListener('input', () => $('borderLabel').textContent = $('border').value + ' px');
$('colorMode').addEventListener('change', () => { $('customColors').hidden = $('colorMode').value !== 'custom'; });
refresh();
