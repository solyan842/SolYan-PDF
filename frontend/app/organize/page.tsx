'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { copySelectedPages, downloadPdf, parsePages } from '../../lib/pdf-client';

export default function OrganizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [order, setOrder] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
  }

  async function organize() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const indexes = parsePages(order, source.getPageCount());
      const output = await copySelectedPages(source, indexes);
      const bytes = await output.save({ useObjectStreams: true });
      downloadPdf(bytes, 'solyan-organized.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể sắp xếp PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
      <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Sắp xếp trang</h1><p className="subtitle">Nhập thứ tự trang muốn giữ. Có thể đảo thứ tự, bỏ trang hoặc chỉ trích xuất một số trang. Ví dụ: <b>3,1,2,5-7</b>.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile} /><span>+ Chọn file PDF</span></label></section>
      <section className="workspace form-workspace">
        <label className="field"><span>Thứ tự trang</span><input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="Để trống = giữ tất cả; ví dụ 3,1,2,5-7" /></label>
        <p className="hint">Trang không xuất hiện trong danh sách sẽ bị loại khỏi file kết quả.</p>
        {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
        {error && <div className="error">{error}</div>}
        <button className="merge-button" type="button" onClick={organize} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Xuất PDF đã sắp xếp'}</button>
      </section>
    </main>
  );
}
