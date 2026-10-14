'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';
import { normalizeRedactionBox, rebuildPdfWithRasterizedPage } from '../../lib/secure-redaction';

type Tool = 'text' | 'highlight' | 'redact' | 'rectangle' | 'image';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PAGE_COUNT = 500;
const SECURE_REDACTION_DPI = 150;
const MAX_REDACTION_PIXELS = 25_000_000;

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Không thể tạo raster PNG cho trang redact.')),
    'image/png',
  ));
}

export default function EditorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [tool, setTool] = useState<Tool>('text');
  const [page, setPage] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(40);
  const [text, setText] = useState('SolYan PDF');
  const [fontSize, setFontSize] = useState(18);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho Editor local.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setProgress('');
    setError('');
  }

  async function exportSecureRedaction(sourceBytes: Uint8Array, sourcePdf: PDFDocument) {
    const target = sourcePdf.getPage(page - 1);
    const box = normalizeRedactionBox({ x, y, width, height }, target.getWidth(), target.getHeight());

    // Burn the requested rectangle into a temporary render-only copy. The
    // original page objects are never reused for the redacted output page.
    target.drawRectangle({ ...box, color: rgb(0, 0, 0), opacity: 1 });
    const markedBytes = await sourcePdf.save({ useObjectStreams: true });

    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const task = pdfjs.getDocument({ data: markedBytes });
    try {
      const rendered = await task.promise;
      const renderedPage = await rendered.getPage(page);
      const scale = SECURE_REDACTION_DPI / 72;
      const viewport = renderedPage.getViewport({ scale });
      const canvasWidth = Math.ceil(viewport.width);
      const canvasHeight = Math.ceil(viewport.height);
      if (canvasWidth * canvasHeight > MAX_REDACTION_PIXELS) {
        throw new Error(`Trang redact vượt giới hạn 25 triệu pixel ở ${SECURE_REDACTION_DPI} DPI.`);
      }

      setProgress(`Đang rasterize an toàn trang ${page} ở ${SECURE_REDACTION_DPI} DPI…`);
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D không khả dụng.');
      await renderedPage.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;

      const png = await blobFromCanvas(canvas);
      const output = await rebuildPdfWithRasterizedPage(
        sourceBytes,
        page - 1,
        new Uint8Array(await png.arrayBuffer()),
        viewport.width / scale,
        viewport.height / scale,
      );
      canvas.width = 1;
      canvas.height = 1;
      downloadPdf(output, 'solyan-secure-redacted.pdf');
      setProgress(`Đã redact an toàn trang ${page}; trang này được rasterize ${SECURE_REDACTION_DPI} DPI và không mang theo content stream gốc.`);
    } finally {
      await task.destroy();
    }
  }

  async function exportEdited() {
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress('');
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await PDFDocument.load(sourceBytes);
      if (pdf.getPageCount() > MAX_PAGE_COUNT) throw new Error(`PDF vượt giới hạn ${MAX_PAGE_COUNT} trang cho Editor local.`);
      if (!Number.isInteger(page) || page < 1 || page > pdf.getPageCount()) throw new Error(`Trang phải nằm trong 1-${pdf.getPageCount()}.`);

      if (tool === 'redact') {
        await exportSecureRedaction(sourceBytes, pdf);
        return;
      }

      const target = pdf.getPage(page - 1);
      if (tool === 'text') {
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        target.drawText(text, { x, y, size: fontSize, font, color: rgb(.08,.13,.2) });
      } else if (tool === 'highlight') {
        target.drawRectangle({ x, y, width, height, color: rgb(1,.9,.15), opacity: .35 });
      } else if (tool === 'rectangle') {
        target.drawRectangle({ x, y, width, height, borderColor: rgb(.15,.42,1), borderWidth: 2, opacity: 0 });
      } else if (tool === 'image') {
        if (!image) throw new Error('Hãy chọn ảnh PNG hoặc JPG.');
        const bytes = await image.arrayBuffer();
        const embedded = image.type === 'image/png' || image.name.toLowerCase().endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        target.drawImage(embedded, { x, y, width, height });
      }

      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-edited.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chỉnh sửa PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local editor · pdf-lib / PDF.js</div></header>
    <section className="hero compact-hero"><p className="eyebrow">EDITOR · PHASE 2</p><h1>Chỉnh sửa PDF</h1><p className="subtitle">Thêm text/ảnh, highlight, redact an toàn hoặc khung chú thích bằng toạ độ PDF.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Công cụ</span><select value={tool} onChange={(e)=>setTool(e.target.value as Tool)}><option value="text">Thêm text</option><option value="image">Thêm ảnh</option><option value="highlight">Highlight</option><option value="redact">Redact an toàn · raster trang</option><option value="rectangle">Vẽ khung</option></select></label>
      <div className="inline-controls"><label className="field"><span>Trang</span><input type="number" min="1" value={page} onChange={(e)=>setPage(Number(e.target.value))}/></label><label className="field"><span>X</span><input type="number" value={x} onChange={(e)=>setX(Number(e.target.value))}/></label><label className="field"><span>Y</span><input type="number" value={y} onChange={(e)=>setY(Number(e.target.value))}/></label></div>
      {(tool === 'highlight' || tool === 'redact' || tool === 'rectangle' || tool === 'image') && <div className="inline-controls"><label className="field"><span>Rộng</span><input type="number" value={width} onChange={(e)=>setWidth(Number(e.target.value))}/></label><label className="field"><span>Cao</span><input type="number" value={height} onChange={(e)=>setHeight(Number(e.target.value))}/></label></div>}
      {tool === 'text' && <><label className="field"><span>Nội dung</span><input value={text} onChange={(e)=>setText(e.target.value)}/></label><label className="field"><span>Cỡ chữ</span><input type="number" min="6" max="120" value={fontSize} onChange={(e)=>setFontSize(Number(e.target.value))}/></label></>}
      {tool === 'image' && <label className="field"><span>Ảnh PNG/JPG</span><input type="file" accept="image/png,image/jpeg" onChange={(e)=>setImage(e.target.files?.[0] ?? null)}/></label>}
      {tool === 'redact' && <div className="error"><strong>Secure redaction:</strong> trang được chọn sẽ rasterize ở 150 DPI sau khi burn vùng đen, rồi PDF được dựng lại mà không copy content stream gốc của trang đó. Đổi lại, trang redact mất text/vector/form/annotation tương tác và rotation được chuẩn hoá theo hướng hiển thị; catalog cấp tài liệu như bookmark, attachment, AcroForm và metadata không được cam kết giữ nguyên trong chế độ này.</div>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn Editor local: 100 MB · 500 trang. Secure redact: tối đa 25 triệu pixel cho trang được rasterize.</p>
      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" disabled={!file || busy} onClick={exportEdited}>{busy ? 'Đang xử lý…' : tool === 'redact' ? 'Redact an toàn và tải PDF' : 'Xuất PDF đã chỉnh sửa'}</button>
    </section>
  </main>;
}
