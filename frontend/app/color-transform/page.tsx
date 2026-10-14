'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';
import { ColorTransformMode, transformRgba } from '../../lib/color-transform';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PAGE_COUNT = 100;
const MAX_SINGLE_PAGE_PIXELS = 25_000_000;
const MAX_TOTAL_PIXELS = 250_000_000;

const MODES: Array<{ value: ColorTransformMode; label: string }> = [
  { value: 'invert', label: 'Đảo màu toàn phần' },
  { value: 'grayscale', label: 'Thang xám' },
  { value: 'white-on-black', label: 'Chữ trắng / nền đen' },
  { value: 'black-on-white', label: 'Chữ đen / nền trắng' },
  { value: 'yellow-on-black', label: 'Chữ vàng / nền đen' },
  { value: 'green-on-black', label: 'Chữ xanh / nền đen' },
  { value: 'custom', label: 'Hai màu tùy chỉnh' },
];

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Không thể tạo raster PNG từ trang.')),
    'image/png',
  ));
}

export default function ColorTransformPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ColorTransformMode>('invert');
  const [dpi, setDpi] = useState(150);
  const [threshold, setThreshold] = useState(160);
  const [textColor, setTextColor] = useState('#ffffff');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho Color Transform local.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setProgress('');
    setError('');
  }

  async function transformPdf() {
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress('');

    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const source = await task.promise;
      try {
        if (source.numPages > MAX_PAGE_COUNT) throw new Error(`PDF vượt giới hạn ${MAX_PAGE_COUNT} trang cho Color Transform raster.`);
        const output = await PDFDocument.create();
        const scale = dpi / 72;
        let totalPixels = 0;

        for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
          setProgress(`Đang rasterize và đổi màu trang ${pageNumber}/${source.numPages}…`);
          const page = await source.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const width = Math.ceil(viewport.width);
          const height = Math.ceil(viewport.height);
          const pixels = width * height;
          if (pixels > MAX_SINGLE_PAGE_PIXELS) throw new Error(`Trang ${pageNumber} vượt giới hạn 25 triệu pixel ở ${dpi} DPI.`);
          totalPixels += pixels;
          if (totalPixels > MAX_TOTAL_PIXELS) throw new Error('Tổng raster vượt giới hạn 250 triệu pixel; hãy giảm DPI hoặc tách PDF trước.');

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Canvas 2D không khả dụng.');
          await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;

          const imageData = context.getImageData(0, 0, width, height);
          imageData.data.set(transformRgba(imageData.data, { mode, threshold, textColor, backgroundColor }));
          context.putImageData(imageData, 0, 0);

          const pngBlob = await blobFromCanvas(canvas);
          const png = await output.embedPng(await pngBlob.arrayBuffer());
          const pageWidth = viewport.width / scale;
          const pageHeight = viewport.height / scale;
          const outputPage = output.addPage([pageWidth, pageHeight]);
          outputPage.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight });

          canvas.width = 1;
          canvas.height = 1;
        }

        setProgress('Đang tạo PDF rasterized…');
        downloadPdf(await output.save({ useObjectStreams: true }), 'solyan-color-transformed-raster.pdf');
        setProgress(`Hoàn tất ${source.numPages} trang · đầu ra rasterized ${dpi} DPI.`);
      } finally {
        await task.destroy();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đổi màu PDF.');
    } finally {
      setBusy(false);
    }
  }

  const twoColor = ['white-on-black', 'black-on-white', 'yellow-on-black', 'green-on-black', 'custom'].includes(mode);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js + pdf-lib</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · V1.2 · RASTERIZED</p><h1>Đảo màu / High Contrast PDF</h1><p className="subtitle">Render từng trang thành ảnh, đổi màu pixel rồi đóng lại thành PDF. Phù hợp dark mode, in tương phản cao và trợ năng hình ảnh.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <div className="error"><strong>Cảnh báo rasterized:</strong> đầu ra không giữ text/vector/form/annotation tương tác. Chữ sẽ không còn chọn/copy như PDF gốc. Hãy dùng công cụ này chỉ khi bạn cần biến đổi màu hiển thị.</div>
      <label className="field"><span>Chế độ màu</span><select value={mode} onChange={(e)=>setMode(e.target.value as ColorTransformMode)}>{MODES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Độ phân giải raster</span><select value={dpi} onChange={(e)=>setDpi(Number(e.target.value))}><option value={96}>96 DPI · nhẹ</option><option value={150}>150 DPI · cân bằng</option><option value={200}>200 DPI · chi tiết</option></select></label>
      {twoColor && <label className="field"><span>Ngưỡng foreground/background: {threshold}</span><input type="range" min="0" max="255" step="1" value={threshold} onChange={(e)=>setThreshold(Number(e.target.value))}/></label>}
      {mode === 'custom' && <div className="inline-controls"><label className="field"><span>Màu foreground/text</span><input type="color" value={textColor} onChange={(e)=>setTextColor(e.target.value)}/></label><label className="field"><span>Màu background</span><input type="color" value={backgroundColor} onChange={(e)=>setBackgroundColor(e.target.value)}/></label></div>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn: 100 MB · 100 trang · 25 triệu pixel/trang · 250 triệu pixel tổng. Trang được xử lý tuần tự để giới hạn bộ nhớ.</p>
      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={transformPdf} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Tạo PDF đã đổi màu'}</button>
    </section>
  </main>;
}
