'use client';

import { ChangeEvent, useState } from 'react';
import { createNUpPdf, NUpArrangement, NUpDirection, NUpOrientation } from '../../lib/n-up';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

type Preset = { label: string; rows: number; columns: number };
const presets: Preset[] = [
  { label: '2-up', rows: 1, columns: 2 },
  { label: '4-up', rows: 2, columns: 2 },
  { label: '6-up', rows: 2, columns: 3 },
  { label: '9-up', rows: 3, columns: 3 },
];

export default function NUpPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState(2);
  const [columns, setColumns] = useState(2);
  const [orientation, setOrientation] = useState<NUpOrientation>('landscape');
  const [arrangement, setArrangement] = useState<NUpArrangement>('rows');
  const [direction, setDirection] = useState<NUpDirection>('ltr');
  const [outerMargin, setOuterMargin] = useState(18);
  const [innerMargin, setInnerMargin] = useState(6);
  const [border, setBorder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho xử lý N-up trong trình duyệt.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
  }

  function usePreset(preset: Preset) {
    setRows(preset.rows);
    setColumns(preset.columns);
    if (preset.rows === 1 && preset.columns === 2) setOrientation('landscape');
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const bytes = await createNUpPdf(await file.arrayBuffer(), {
        rows,
        columns,
        orientation,
        arrangement,
        direction,
        outerMargin,
        innerMargin,
        border,
      });
      downloadPdf(bytes, 'solyan-n-up.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo PDF N-up.');
    } finally {
      setBusy(false);
    }
  }

  const invalidGrid = !Number.isInteger(rows) || rows < 1 || rows > 8 || !Number.isInteger(columns) || columns < 1 || columns > 8;
  const invalidMargins = !Number.isFinite(outerMargin) || outerMargin < 0 || outerMargin > 144 || !Number.isFinite(innerMargin) || innerMargin < 0 || innerMargin > 72;

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Không upload PDF</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">LAYOUT · V1.1</p>
      <h1>N-up · Nhiều trang trên một tờ</h1>
      <p className="subtitle">Xếp nhiều trang PDF lên mỗi tờ A4, giữ tỷ lệ, tự căn giữa và xử lý ngay trong trình duyệt.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <div className="inline-controls">{presets.map((preset) => <button className="ghost" type="button" key={preset.label} onClick={() => usePreset(preset)} disabled={busy}>{preset.label}</button>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label className="field"><span>Số hàng</span><input type="number" min="1" max="8" step="1" value={rows} onChange={(e)=>setRows(Number(e.target.value))}/></label>
        <label className="field"><span>Số cột</span><input type="number" min="1" max="8" step="1" value={columns} onChange={(e)=>setColumns(Number(e.target.value))}/></label>
        <label className="field"><span>Khổ A4</span><select value={orientation} onChange={(e)=>setOrientation(e.target.value as NUpOrientation)}><option value="portrait">Dọc</option><option value="landscape">Ngang</option></select></label>
        <label className="field"><span>Thứ tự</span><select value={arrangement} onChange={(e)=>setArrangement(e.target.value as NUpArrangement)}><option value="rows">Theo hàng</option><option value="columns">Theo cột</option></select></label>
        <label className="field"><span>Hướng đọc</span><select value={direction} onChange={(e)=>setDirection(e.target.value as NUpDirection)}><option value="ltr">Trái → phải</option><option value="rtl">Phải → trái</option></select></label>
        <label className="field"><span>Lề ngoài (pt)</span><input type="number" min="0" max="144" step="1" value={outerMargin} onChange={(e)=>setOuterMargin(Number(e.target.value))}/></label>
        <label className="field"><span>Lề trong (pt)</span><input type="number" min="0" max="72" step="1" value={innerMargin} onChange={(e)=>setInnerMargin(Number(e.target.value))}/></label>
        <label className="field"><span>Viền trang</span><select value={border ? 'yes' : 'no'} onChange={(e)=>setBorder(e.target.value === 'yes')}><option value="no">Không</option><option value="yes">Có</option></select></label>
      </div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn: 100 MB và 500 trang nguồn. N-up nhúng nội dung trang vào tờ mới nên annotation/form tương tác không được giữ như form tương tác.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy || invalidGrid || invalidMargins}>{busy ? 'Đang tạo N-up…' : `Tạo ${rows * columns}-up PDF`}</button>
    </section>
  </main>;
}
