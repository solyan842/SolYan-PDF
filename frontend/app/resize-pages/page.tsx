'use client';

import { ChangeEvent, useState } from 'react';
import { ResizePageSize, resizePdf } from '../../lib/page-geometry';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export default function ResizePagesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageSize, setPageSize] = useState<ResizePageSize>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [scalePercent, setScalePercent] = useState(100);
  const [customWidth, setCustomWidth] = useState(595.28);
  const [customHeight, setCustomHeight] = useState(841.89);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho resize trong trình duyệt.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const bytes = await resizePdf(await file.arrayBuffer(), {
        pageSize,
        orientation,
        scaleFactor: scalePercent / 100,
        customWidth,
        customHeight,
      });
      downloadPdf(bytes, 'solyan-resized-pages.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể resize PDF.');
    } finally {
      setBusy(false);
    }
  }

  const invalid = !Number.isFinite(scalePercent) || scalePercent < 10 || scalePercent > 200 ||
    (pageSize === 'CUSTOM' && (!Number.isFinite(customWidth) || !Number.isFinite(customHeight) || customWidth < 36 || customHeight < 36 || customWidth > 14400 || customHeight > 14400));

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Không upload PDF</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">PAGE GEOMETRY · V1.1</p>
      <h1>Resize / Scale trang PDF</h1>
      <p className="subtitle">Đặt toàn bộ trang vào khổ giấy mới, tự giữ tỷ lệ và căn giữa nội dung. Hỗ trợ A0–A6, Letter, Legal và kích thước tùy chỉnh.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label className="field"><span>Khổ giấy</span><select value={pageSize} onChange={(e)=>setPageSize(e.target.value as ResizePageSize)}>{['A0','A1','A2','A3','A4','A5','A6','LETTER','LEGAL','CUSTOM'].map((size)=><option key={size} value={size}>{size === 'CUSTOM' ? 'Tùy chỉnh' : size}</option>)}</select></label>
        <label className="field"><span>Hướng giấy</span><select value={orientation} onChange={(e)=>setOrientation(e.target.value as 'portrait' | 'landscape')}><option value="portrait">Dọc</option><option value="landscape">Ngang</option></select></label>
        <label className="field"><span>Tỷ lệ nội dung (%)</span><input type="number" min="10" max="200" step="1" value={scalePercent} onChange={(e)=>setScalePercent(Number(e.target.value))}/></label>
      </div>
      {pageSize === 'CUSTOM' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label className="field"><span>Chiều rộng gốc (pt)</span><input type="number" min="36" max="14400" step="0.01" value={customWidth} onChange={(e)=>setCustomWidth(Number(e.target.value))}/></label>
        <label className="field"><span>Chiều cao gốc (pt)</span><input type="number" min="36" max="14400" step="0.01" value={customHeight} onChange={(e)=>setCustomHeight(Number(e.target.value))}/></label>
      </div>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">100% = fit vừa khổ giấy mới. Dưới 100% tạo thêm khoảng trắng; trên 100% phóng lớn và phần vượt khổ giấy sẽ bị clip. Nội dung vector/text được nhúng vào trang mới nhưng annotation/form tương tác không còn là control tương tác.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy || invalid}>{busy ? 'Đang resize…' : 'Xuất PDF đã resize'}</button>
    </section>
  </main>;
}
