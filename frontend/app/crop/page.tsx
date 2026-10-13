'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { cropPdf } from '../../lib/page-geometry';
import { downloadPdf, parsePages } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export default function CropPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSelection, setPageSelection] = useState('');
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  const [top, setTop] = useState(0);
  const [bottom, setBottom] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(null);
    setPageCount(0);
    setError('');
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError('PDF vượt giới hạn 100 MB cho crop trong trình duyệt.');
      event.target.value = '';
      return;
    }
    try {
      const document = await PDFDocument.load(await selected.arrayBuffer());
      setPageCount(document.getPageCount());
      setFile(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được PDF.');
    }
  }

  async function run() {
    if (!file || !pageCount) return;
    setBusy(true);
    setError('');
    try {
      const indexes = parsePages(pageSelection, pageCount);
      const bytes = await cropPdf(await file.arrayBuffer(), { left, right, top, bottom }, indexes);
      downloadPdf(bytes, 'solyan-cropped.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể crop PDF.');
    } finally {
      setBusy(false);
    }
  }

  const invalid = [left, right, top, bottom].some((value) => !Number.isFinite(value) || value < 0 || value > 14400);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Không upload PDF</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">PAGE GEOMETRY · V1.1</p>
      <h1>Crop PDF</h1>
      <p className="subtitle">Cắt lề theo đơn vị point trên các trang bạn chọn, giữ nội dung vector/text và rotation của trang.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Trang cần crop</span><input value={pageSelection} onChange={(e)=>setPageSelection(e.target.value)} placeholder="Để trống = tất cả; ví dụ 1,3,5-8"/></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <label className="field"><span>Cắt trái (pt)</span><input type="number" min="0" max="14400" step="1" value={left} onChange={(e)=>setLeft(Number(e.target.value))}/></label>
        <label className="field"><span>Cắt phải (pt)</span><input type="number" min="0" max="14400" step="1" value={right} onChange={(e)=>setRight(Number(e.target.value))}/></label>
        <label className="field"><span>Cắt trên (pt)</span><input type="number" min="0" max="14400" step="1" value={top} onChange={(e)=>setTop(Number(e.target.value))}/></label>
        <label className="field"><span>Cắt dưới (pt)</span><input type="number" min="0" max="14400" step="1" value={bottom} onChange={(e)=>setBottom(Number(e.target.value))}/></label>
      </div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong> · {pageCount} trang</p>}
      <div className="error" style={{ color: '#b54708', background: '#fffaeb', borderColor: '#fedf89' }}>Crop thay đổi page boxes, <strong>không phải secure redaction</strong>. Nội dung nằm ngoài vùng crop có thể vẫn còn trong file và có thể được công cụ chuyên dụng khôi phục/đọc.</div>
      <p className="hint">1 inch = 72 pt. Với trang có /Rotate, lề được tính trong hệ tọa độ PDF gốc và rotation vẫn được giữ nguyên.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy || invalid}>{busy ? 'Đang crop…' : 'Xuất PDF đã crop'}</button>
    </section>
  </main>;
}
