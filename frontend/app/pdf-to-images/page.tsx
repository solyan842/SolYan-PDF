'use client';

import { ChangeEvent, useState } from 'react';
import JSZip from 'jszip';
import { parsePages } from '../../lib/pdf-client';
import {
  type PdfImageColorMode,
  type PdfImageFormat,
  type PdfImageOutputMode,
  PDF_IMAGE_DPI_OPTIONS,
  applyCanvasColorMode,
  canvasToImageBlob,
  dpiToScale,
  imageExtension,
} from '../../lib/pdf-image-export';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_SELECTED_PAGES = 200;
const MAX_PIXELS_PER_PAGE = 25_000_000;
const MAX_TOTAL_RENDER_PIXELS = 80_000_000;
const MAX_SINGLE_PIXELS = 60_000_000;
const MAX_SINGLE_DIMENSION = 16_384;
const TWO_COLUMN_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 } as const;

type PageDimension = {
  index: number;
  width: number;
  height: number;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function PdfToImagesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [dpi, setDpi] = useState<number>(150);
  const [format, setFormat] = useState<PdfImageFormat>('png');
  const [colorMode, setColorMode] = useState<PdfImageColorMode>('color');
  const [outputMode, setOutputMode] = useState<PdfImageOutputMode>('multiple');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho PDF → Ảnh local.');
      setProgress('');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
    setProgress('');
  }

  async function convert() {
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress('');
    let destroyTask: (() => Promise<void>) | null = null;

    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      destroyTask = () => task.destroy();
      const pdf = await task.promise;
      const indexes = parsePages(pages, pdf.numPages);
      if (indexes.length > MAX_SELECTED_PAGES) {
        throw new Error(`Tối đa ${MAX_SELECTED_PAGES} trang được chọn trong một lần PDF → Ảnh.`);
      }

      const scale = dpiToScale(dpi);
      const dimensions: PageDimension[] = [];
      let totalRenderPixels = 0;
      let maxWidth = 0;
      let totalHeight = 0;

      for (let order = 0; order < indexes.length; order += 1) {
        const index = indexes[order];
        setProgress(`Đang kiểm tra kích thước trang ${order + 1}/${indexes.length}…`);
        const page = await pdf.getPage(index + 1);
        const viewport = page.getViewport({ scale });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        const pixels = width * height;
        page.cleanup();

        if (pixels > MAX_PIXELS_PER_PAGE) {
          throw new Error(`Trang ${index + 1} vượt giới hạn 25 triệu pixel ở ${dpi} DPI. Hãy giảm DPI.`);
        }
        totalRenderPixels += pixels;
        if (totalRenderPixels > MAX_TOTAL_RENDER_PIXELS) {
          throw new Error(`Tổng raster vượt giới hạn 80 triệu pixel ở ${dpi} DPI. Hãy giảm DPI hoặc chọn ít trang hơn.`);
        }
        dimensions.push({ index, width, height });
        maxWidth = Math.max(maxWidth, width);
        totalHeight += height;
      }

      if (outputMode === 'single') {
        const compositePixels = maxWidth * totalHeight;
        if (maxWidth > MAX_SINGLE_DIMENSION || totalHeight > MAX_SINGLE_DIMENSION || compositePixels > MAX_SINGLE_PIXELS) {
          throw new Error(`Ảnh ghép dọc quá lớn (${maxWidth}×${totalHeight}). Hãy giảm DPI, chọn ít trang hơn hoặc dùng chế độ ZIP nhiều ảnh.`);
        }
      }

      const annotationMode = includeAnnotations ? pdfjs.AnnotationMode.ENABLE : pdfjs.AnnotationMode.DISABLE;
      const digits = String(pdf.numPages).length;

      if (outputMode === 'multiple') {
        const zip = new JSZip();
        for (let order = 0; order < dimensions.length; order += 1) {
          const { index, width, height } = dimensions[order];
          setProgress(`Đang render trang ${index + 1} · ${order + 1}/${dimensions.length} · ${dpi} DPI…`);
          const page = await pdf.getPage(index + 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D không khả dụng.');
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            background: '#ffffff',
            annotationMode,
          }).promise;
          applyCanvasColorMode(context, width, height, colorMode);
          const blob = await canvasToImageBlob(canvas, format);
          zip.file(`page-${String(index + 1).padStart(digits, '0')}.${imageExtension(format)}`, blob);
          canvas.width = 1;
          canvas.height = 1;
          page.cleanup();
        }

        setProgress('Đang đóng gói ZIP…');
        const archive = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });
        downloadBlob(archive, 'solyan-pdf-images.zip');
        setProgress(`Hoàn tất: ${dimensions.length} trang · ${dpi} DPI · ${colorMode} · ${format.toUpperCase()}.`);
      } else {
        const combined = document.createElement('canvas');
        combined.width = maxWidth;
        combined.height = totalHeight;
        const combinedContext = combined.getContext('2d');
        if (!combinedContext) throw new Error('Canvas 2D không khả dụng cho ảnh ghép.');
        combinedContext.fillStyle = '#ffffff';
        combinedContext.fillRect(0, 0, maxWidth, totalHeight);

        let offsetY = 0;
        for (let order = 0; order < dimensions.length; order += 1) {
          const { index, width, height } = dimensions[order];
          setProgress(`Đang ghép trang ${index + 1} · ${order + 1}/${dimensions.length} · ${dpi} DPI…`);
          const page = await pdf.getPage(index + 1);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D không khả dụng.');
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            background: '#ffffff',
            annotationMode,
          }).promise;
          applyCanvasColorMode(context, width, height, colorMode);
          combinedContext.drawImage(canvas, 0, offsetY);
          offsetY += height;
          canvas.width = 1;
          canvas.height = 1;
          page.cleanup();
        }

        setProgress('Đang mã hóa ảnh ghép dọc…');
        const blob = await canvasToImageBlob(combined, format);
        downloadBlob(blob, `solyan-pdf-pages.${imageExtension(format)}`);
        combined.width = 1;
        combined.height = 1;
        setProgress(`Hoàn tất: ${dimensions.length} trang đã ghép dọc thành 1 ảnh · ${dpi} DPI · ${colorMode} · ${format.toUpperCase()}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF thành ảnh.');
    } finally {
      if (destroyTask) await destroyTask().catch(() => undefined);
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js · Canvas</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">V1.5 · PDF → IMAGES</p>
      <h1>PDF → Ảnh</h1>
      <p className="subtitle">Chọn trang, DPI, màu, annotation và định dạng; xuất ZIP nhiều ảnh hoặc ghép dọc thành một ảnh duy nhất ngay trên thiết bị.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      <label className="field"><span>Trang xuất</span><input value={pages} onChange={(event)=>setPages(event.target.value)} placeholder="Để trống = tất cả; ví dụ 1,3-8"/></label>

      <div style={TWO_COLUMN_STYLE}>
        <label className="field"><span>DPI</span><select value={dpi} onChange={(event)=>setDpi(Number(event.target.value))}>{PDF_IMAGE_DPI_OPTIONS.map((value)=><option key={value} value={value}>{value} DPI{value === 150 ? ' · khuyến nghị' : ''}</option>)}</select></label>
        <label className="field"><span>Định dạng</span><select value={format} onChange={(event)=>setFormat(event.target.value as PdfImageFormat)}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
      </div>

      <div style={TWO_COLUMN_STYLE}>
        <label className="field"><span>Màu</span><select value={colorMode} onChange={(event)=>setColorMode(event.target.value as PdfImageColorMode)}><option value="color">Color</option><option value="greyscale">Greyscale</option><option value="blackwhite">Black &amp; White</option></select></label>
        <label className="field"><span>Đầu ra</span><select value={outputMode} onChange={(event)=>setOutputMode(event.target.value as PdfImageOutputMode)}><option value="multiple">Nhiều ảnh · ZIP</option><option value="single">Một ảnh · ghép dọc</option></select></label>
      </div>

      <label className="field"><span><input type="checkbox" checked={includeAnnotations} onChange={(event)=>setIncludeAnnotations(event.target.checked)}/> Render annotation/widget có appearance</span><small>Tắt để PDF.js không đưa annotation vào render page canvas.</small></label>

      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      {outputMode === 'single' && <div className="error"><strong>Ảnh ghép dọc:</strong> tất cả trang được đặt từ trên xuống dưới, bề rộng bằng trang rộng nhất. Để tương thích trình duyệt, mỗi chiều ảnh ghép bị giới hạn 16.384 px và tổng tối đa 60 triệu pixel.</div>}
      <p className="hint">Giới hạn: 100 MB · tối đa 200 trang được chọn · 25 triệu pixel/trang · 80 triệu pixel tổng render. WebP phụ thuộc khả năng mã hóa Canvas của trình duyệt; nếu không hỗ trợ, công cụ sẽ báo lỗi thay vì xuất sai đuôi file. TIFF không được thêm vì Canvas không có encoder TIFF native.</p>
      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={convert} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : outputMode === 'multiple' ? 'Xuất ZIP ảnh' : 'Xuất 1 ảnh ghép dọc'}</button>
    </section>
  </main>;
}
