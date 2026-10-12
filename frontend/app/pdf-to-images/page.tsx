'use client';

import { ChangeEvent, useState } from 'react';
import JSZip from 'jszip';

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
  const [scale, setScale] = useState(2);
  const [format, setFormat] = useState<'png'|'jpeg'>('png');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setError(''); setProgress(''); }

  async function convert() {
    if (!file) return;
    setBusy(true); setError(''); setProgress('');
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const pdf = await task.promise;
      const zip = new JSZip();
      const digits = String(pdf.numPages).length;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setProgress(`Đang render trang ${pageNumber}/${pdf.numPages}`);
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D không khả dụng.');
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value)=>value ? resolve(value) : reject(new Error('Không tạo được ảnh.')), mime, .92));
        zip.file(`page-${String(pageNumber).padStart(digits,'0')}.${format === 'png' ? 'png' : 'jpg'}`, blob);
      }

      setProgress('Đang đóng gói ZIP…');
      const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      downloadBlob(archive, 'solyan-pdf-images.zip');
      await task.destroy();
      setProgress(`Hoàn tất ${pdf.numPages} trang.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF thành ảnh.');
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CONVERT · PHASE 4</p><h1>PDF → Ảnh</h1><p className="subtitle">Render toàn bộ trang PDF thành PNG/JPEG và đóng gói trong một file ZIP ngay trên thiết bị.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Định dạng</span><select value={format} onChange={(e)=>setFormat(e.target.value as 'png'|'jpeg')}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
      <label className="field"><span>Độ phân giải render: {scale.toFixed(1)}×</span><input type="range" min="1" max="4" step="0.5" value={scale} onChange={(e)=>setScale(Number(e.target.value))}/></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={convert} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : 'Xuất ZIP ảnh'}</button>
    </section>
  </main>;
}
