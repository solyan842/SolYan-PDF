'use client';

import { ChangeEvent, useState } from 'react';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { downloadPdf, parsePages } from '../../lib/pdf-client';

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('SolYan PDF');
  const [pages, setPages] = useState('');
  const [opacity, setOpacity] = useState(0.18);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setError(''); }

  async function applyWatermark() {
    if (!file || !text.trim()) return;
    setBusy(true); setError('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const indexes = parsePages(pages, pdf.getPageCount());
      indexes.forEach((index) => {
        const page = pdf.getPage(index);
        const { width, height } = page.getSize();
        const fontSize = Math.max(24, Math.min(width, height) / 10);
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: height / 2,
          size: fontSize,
          font,
          color: rgb(0.35, 0.4, 0.48),
          opacity,
          rotate: degrees(35),
        });
      });
      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-watermarked.pdf');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể thêm watermark.'); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Watermark PDF</h1><p className="subtitle">Đóng watermark chữ lên toàn bộ hoặc một số trang ngay trong trình duyệt.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Nội dung watermark</span><input value={text} onChange={(e)=>setText(e.target.value)} /></label>
      <label className="field"><span>Trang áp dụng</span><input value={pages} onChange={(e)=>setPages(e.target.value)} placeholder="Để trống = tất cả; ví dụ 1,3,5-8" /></label>
      <label className="field"><span>Độ trong suốt: {Math.round(opacity * 100)}%</span><input type="range" min="0.05" max="0.6" step="0.05" value={opacity} onChange={(e)=>setOpacity(Number(e.target.value))}/></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={applyWatermark} disabled={!file || !text.trim() || busy}>{busy ? 'Đang xử lý…' : 'Thêm watermark'}</button>
    </section>
  </main>;
}
