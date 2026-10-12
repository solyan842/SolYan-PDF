'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { downloadPdf, parsePages } from '../../lib/pdf-client';

export default function PageNumbersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setError(''); }

  async function apply() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const indexes = parsePages(pages, pdf.getPageCount());
      indexes.forEach((index, order) => {
        const page = pdf.getPage(index);
        const { width } = page.getSize();
        const label = String(start + order);
        const size = 11;
        const textWidth = font.widthOfTextAtSize(label, size);
        page.drawText(label, { x: (width - textWidth) / 2, y: 18, size, font, color: rgb(0.32, 0.35, 0.4) });
      });
      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-numbered.pdf');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể đánh số trang.'); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Đánh số trang</h1><p className="subtitle">Thêm số trang ở giữa chân trang, áp dụng cho toàn bộ hoặc vùng trang tùy chọn.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Trang áp dụng</span><input value={pages} onChange={(e)=>setPages(e.target.value)} placeholder="Để trống = tất cả; ví dụ 2-8" /></label>
      <label className="field"><span>Bắt đầu từ số</span><input type="number" min="0" value={start} onChange={(e)=>setStart(Number(e.target.value))}/></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={apply} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Đánh số trang'}</button>
    </section>
  </main>;
}
