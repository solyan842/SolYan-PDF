'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { addRotation, downloadPdf, normalizeRotation, parsePages } from '../../lib/pdf-client';

export default function RotatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [angle, setAngle] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
  }

  async function rotate() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const indexes = parsePages(pages, source.getPageCount());
      const delta = normalizeRotation(angle);
      indexes.forEach((index) => {
        const page = source.getPage(index);
        page.setRotation(addRotation(page.getRotation().angle, delta));
      });
      const bytes = await source.save({ useObjectStreams: true });
      downloadPdf(bytes, 'solyan-rotated.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xoay PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
      <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Xoay PDF</h1><p className="subtitle">Xoay toàn bộ hoặc chỉ một số trang. Để trống danh sách trang để áp dụng cho tất cả.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile} /><span>+ Chọn file PDF</span></label></section>
      <section className="workspace form-workspace">
        <label className="field"><span>Trang cần xoay</span><input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="Để trống = tất cả; ví dụ 1,3,5-8" /></label>
        <label className="field"><span>Góc xoay</span><select value={angle} onChange={(e) => setAngle(Number(e.target.value))}><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>
        {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
        {error && <div className="error">{error}</div>}
        <button className="merge-button" type="button" onClick={rotate} disabled={!file || busy}>{busy ? 'Đang xoay…' : 'Xoay PDF'}</button>
      </section>
    </main>
  );
}
