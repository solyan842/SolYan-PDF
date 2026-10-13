'use client';

import { ChangeEvent, useState } from 'react';
import { createSinglePagePdf } from '../../lib/single-page';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export default function SinglePagePage() {
  const [file, setFile] = useState<File | null>(null);
  const [gap, setGap] = useState(0);
  const [margin, setMargin] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho xử lý local.');
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
      const bytes = await createSinglePagePdf(await file.arrayBuffer(), { gap, margin });
      downloadPdf(bytes, 'solyan-single-page.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo PDF một trang dài.');
    } finally {
      setBusy(false);
    }
  }

  const invalid = gap < 0 || gap > 144 || margin < 0 || margin > 144;

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Không upload PDF</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">LAYOUT · V1.2</p>
      <h1>PDF → Một trang dài</h1>
      <p className="subtitle">Nối các trang theo chiều dọc thành một trang PDF liên tục, giữ vector/text và tự thu nhỏ nếu vượt giới hạn kích thước PDF tương thích.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label className="field"><span>Khoảng cách giữa trang (pt)</span><input type="number" min="0" max="144" step="1" value={gap} onChange={(e)=>setGap(Number(e.target.value))}/></label>
        <label className="field"><span>Lề ngoài (pt)</span><input type="number" min="0" max="144" step="1" value={margin} onChange={(e)=>setMargin(Number(e.target.value))}/></label>
      </div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn 100 MB / 500 trang. Nếu tổng chiều cao tự nhiên vượt 14.400 pt, toàn bộ nội dung được scale đồng đều để giữ một trang PDF hợp lệ và tương thích hơn.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy || invalid}>{busy ? 'Đang ghép một trang…' : 'Tạo PDF một trang dài'}</button>
    </section>
  </main>;
}
