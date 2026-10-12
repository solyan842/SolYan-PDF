'use client';

import { ChangeEvent, DragEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { copySelectedPages, downloadPdf, parsePages } from '../../lib/pdf-client';

export default function OrganizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [order, setOrder] = useState('');
  const [pages, setPages] = useState<number[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError('');
    setOrder('');
    setPages([]);
    if (!selected) return;
    try {
      const doc = await PDFDocument.load(await selected.arrayBuffer());
      setPages(Array.from({ length: doc.getPageCount() }, (_, index) => index + 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được PDF.');
    }
  }

  function sync(next: number[]) {
    setPages(next);
    setOrder(next.join(','));
  }

  function drop(target: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (dragging === null || dragging === target) return;
    const next = [...pages];
    const [moved] = next.splice(dragging, 1);
    next.splice(target, 0, moved);
    sync(next);
    setDragging(null);
  }

  function removePage(index: number) {
    sync(pages.filter((_, pageIndex) => pageIndex !== index));
  }

  async function resetPages() {
    if (!file) return;
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer());
      const next = Array.from({ length: doc.getPageCount() }, (_, index) => index + 1);
      setPages(next);
      setOrder('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đặt lại danh sách trang.');
    }
  }

  async function organize() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const source = await PDFDocument.load(await file.arrayBuffer());
      const indexes = order.trim()
        ? parsePages(order, source.getPageCount())
        : (pages.length ? pages.map((page) => page - 1) : Array.from({ length: source.getPageCount() }, (_, index) => index));
      if (!indexes.length) throw new Error('Cần giữ lại ít nhất một trang.');
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
      <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Sắp xếp trang</h1><p className="subtitle">Kéo-thả các ô trang để đổi thứ tự, xóa trang không cần, hoặc nhập thứ tự thủ công như <b>3,1,2,5-7</b>.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile} /><span>+ Chọn file PDF</span></label></section>
      <section className="workspace form-workspace">
        {pages.length > 0 && <>
          <div className="workspace-head"><div><h2>{pages.length} trang đang giữ</h2><p>Kéo-thả để đổi thứ tự; bấm × để loại trang.</p></div><button className="ghost" type="button" onClick={resetPages}>Đặt lại</button></div>
          <div className="page-chip-grid">
            {pages.map((page, index) => <button
              type="button"
              draggable
              onDragStart={() => setDragging(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => drop(index, event)}
              onDragEnd={() => setDragging(null)}
              className={`page-chip ${dragging === index ? 'dragging' : ''}`}
              key={`${page}-${index}`}
              title="Kéo để đổi thứ tự"
            >
              <span>Trang {page}</span>
              <b role="button" aria-label={`Xóa trang ${page}`} onClick={(event) => { event.stopPropagation(); removePage(index); }}>×</b>
            </button>)}
          </div>
        </>}
        <label className="field"><span>Thứ tự trang thủ công</span><input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="Để trống = dùng thứ tự kéo-thả; ví dụ 3,1,2,5-7" /></label>
        <p className="hint">Nếu nhập danh sách thủ công, danh sách đó sẽ ưu tiên hơn thứ tự kéo-thả.</p>
        {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
        {error && <div className="error">{error}</div>}
        <button className="merge-button" type="button" onClick={organize} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Xuất PDF đã sắp xếp'}</button>
      </section>
    </main>
  );
}
