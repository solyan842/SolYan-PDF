'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { copySelectedPages, downloadPdf, parsePages } from '../../lib/pdf-client';

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
  }

  async function split() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const parts = groups.split(';').map((part) => part.trim()).filter(Boolean);
      if (!parts.length) throw new Error('Hãy nhập ít nhất một nhóm trang.');

      for (let i = 0; i < parts.length; i += 1) {
        const indexes = parsePages(parts[i], source.getPageCount());
        const output = await copySelectedPages(source, indexes);
        const bytes = await output.save({ useObjectStreams: true });
        downloadPdf(bytes, `solyan-split-${i + 1}.pdf`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tách PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
      <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Tách PDF</h1><p className="subtitle">Nhập các nhóm trang, phân cách bằng dấu chấm phẩy. Ví dụ: <b>1-3;4-6;7,9</b>.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile} /><span>+ Chọn file PDF</span></label></section>
      <section className="workspace form-workspace">
        <label className="field"><span>Nhóm trang cần tách</span><input value={groups} onChange={(e) => setGroups(e.target.value)} placeholder="1-3;4-6;7,9" /></label>
        {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
        {error && <div className="error">{error}</div>}
        <button className="merge-button" type="button" onClick={split} disabled={!file || busy}>{busy ? 'Đang tách…' : 'Tách PDF'}</button>
      </section>
    </main>
  );
}
