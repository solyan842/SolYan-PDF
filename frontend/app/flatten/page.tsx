'use client';

import { ChangeEvent, useState } from 'react';
import { downloadPdf } from '../../lib/pdf-client';
import { RasterizedPageReplacement, rebuildPdfWithRasterizedPages } from '../../lib/secure-redaction';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PAGE_COUNT = 200;
const MAX_PIXELS_PER_PAGE = 25_000_000;
const MAX_TOTAL_PIXELS = 80_000_000;
const DPI_OPTIONS = [96, 150, 200] as const;

type FlattenMode = 'forms_annotations' | 'full_page';

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Không thể tạo ảnh raster cho trang PDF.')),
    'image/png',
  ));
}

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

export default function FlattenPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<FlattenMode>('forms_annotations');
  const [dpi, setDpi] = useState<number>(150);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setProgress('');
    setError('');
  }

  async function flattenFormsAndAnnotations(selected: File) {
    setProgress('Đang flatten form field và annotation bằng qpdf…');
    const body = new FormData();
    body.append('file', selected);
    const response = await fetch(`${API_BASE}/pdf/flatten`, { method: 'POST', body });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const detail = await response.json();
        message = detail.detail ?? message;
      } catch {}
      throw new Error(message);
    }
    downloadBlob(await response.blob(), 'solyan-flattened.pdf');
    setProgress('Hoàn tất: form field/widget và annotation đã được đóng băng bằng qpdf; text/vector gốc vẫn được giữ.');
  }

  async function flattenFullPage(selected: File) {
    const sourceBytes = new Uint8Array(await selected.arrayBuffer());
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: sourceBytes.slice() });

    try {
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PAGE_COUNT) {
        throw new Error(`Full Page Flatten local hỗ trợ tối đa ${MAX_PAGE_COUNT} trang mỗi lần.`);
      }

      const replacements: RasterizedPageReplacement[] = [];
      const renderScale = dpi / 72;
      let totalPixels = 0;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setProgress(`Đang rasterize toàn trang ${pageNumber}/${pdf.numPages} ở ${dpi} DPI…`);
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: renderScale });
        const canvasWidth = Math.ceil(viewport.width);
        const canvasHeight = Math.ceil(viewport.height);
        const pixels = canvasWidth * canvasHeight;

        if (pixels > MAX_PIXELS_PER_PAGE) {
          throw new Error(`Trang ${pageNumber} vượt giới hạn 25 triệu pixel ở ${dpi} DPI. Hãy chọn DPI thấp hơn.`);
        }
        totalPixels += pixels;
        if (totalPixels > MAX_TOTAL_PIXELS) {
          throw new Error(`Tổng raster vượt giới hạn 80 triệu pixel ở ${dpi} DPI. Hãy chọn DPI thấp hơn hoặc chia PDF.`);
        }

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D không khả dụng.');
        await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;

        const png = await blobFromCanvas(canvas);
        replacements.push({
          pageIndex: pageNumber - 1,
          pngBytes: new Uint8Array(await png.arrayBuffer()),
          pageWidth: baseViewport.width,
          pageHeight: baseViewport.height,
        });
        canvas.width = 1;
        canvas.height = 1;
        await page.cleanup();
      }

      setProgress('Đang dựng PDF mới chỉ từ ảnh raster của từng trang…');
      const output = await rebuildPdfWithRasterizedPages(sourceBytes, replacements);
      downloadPdf(output, 'solyan-full-page-flattened.pdf');
      setProgress(`Hoàn tất: ${pdf.numPages} trang đã được rasterize ở ${dpi} DPI; text không còn selectable và nội dung tương tác trên trang đã bị loại.`);
    } finally {
      await task.destroy().catch(() => undefined);
    }
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress('');
    try {
      if (mode === 'forms_annotations') await flattenFormsAndAnnotations(file);
      else await flattenFullPage(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể Flatten PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">qpdf + Local raster</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">V1.5 · FLATTEN</p>
      <h1>Flatten PDF</h1>
      <p className="subtitle">Đóng băng form/annotation nhưng vẫn giữ text-vector, hoặc rasterize toàn bộ trang để tạo bản “in phẳng” không còn text selectable.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Chế độ Flatten</span><select value={mode} onChange={(event)=>{ setMode(event.target.value as FlattenMode); setError(''); setProgress(''); }}>
        <option value="forms_annotations">Forms + annotations · qpdf · giữ text/vector</option>
        <option value="full_page">Full Page · local raster · text không selectable</option>
      </select></label>

      {mode === 'full_page' && <label className="field"><span>Độ phân giải raster</span><select value={dpi} onChange={(event)=>setDpi(Number(event.target.value))}>
        {DPI_OPTIONS.map((value)=><option key={value} value={value}>{value} DPI{value === 150 ? ' · khuyến nghị' : ''}</option>)}
      </select></label>}

      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}

      {mode === 'forms_annotations'
        ? <p className="hint"><strong>Forms + annotations:</strong> dùng qpdf tạo appearance rồi flatten annotation/widget vào content stream. Giữ text/vector và phù hợp khi chỉ cần khóa giao diện form/comment.</p>
        : <div className="error"><strong>Full Page Flatten:</strong> mọi trang được render thành PNG rồi dựng thành PDF mới. Text sẽ không còn chọn/copy; form, annotation, link và vector trên trang mất tính tương tác. Outline, attachment và cấu trúc tài liệu cấp cao không được cam kết giữ. Giới hạn: 100 MB · 200 trang · 25 triệu pixel/trang · 80 triệu pixel tổng.</div>}

      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang xử lý…' : mode === 'forms_annotations' ? 'Flatten form + annotation' : 'Full Page Flatten'}</button>
    </section>
  </main>;
}
