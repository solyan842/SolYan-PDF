'use client';

import { ChangeEvent, useState } from 'react';
import { createOverlayPdf, OverlayMode } from '../../lib/overlay';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export default function OverlayPage() {
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [overlayFile, setOverlayFile] = useState<File | null>(null);
  const [mode, setMode] = useState<OverlayMode>('repeat-first');
  const [opacity, setOpacity] = useState(1);
  const [margin, setMargin] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function select(setter: (file: File | null) => void) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] ?? null;
      if (selected && selected.size > MAX_FILE_SIZE) {
        setter(null);
        setError('Mỗi PDF phải không vượt quá 100 MB.');
        event.target.value = '';
        return;
      }
      setter(selected);
      setError('');
    };
  }

  async function run() {
    if (!baseFile || !overlayFile) return;
    setBusy(true);
    setError('');
    try {
      const bytes = await createOverlayPdf(
        await baseFile.arrayBuffer(),
        await overlayFile.arrayBuffer(),
        { mode, opacity, margin },
      );
      downloadPdf(bytes, 'solyan-overlay.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể overlay PDF.');
    } finally {
      setBusy(false);
    }
  }

  const invalid = opacity <= 0 || opacity > 1 || margin < 0 || margin > 144;

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Không upload PDF</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">COMPOSE · V1.2</p>
      <h1>Overlay PDF</h1>
      <p className="subtitle">Chồng nội dung từ một PDF lên PDF nền, giữ vector/text và xử lý hoàn toàn trong trình duyệt.</p>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>PDF nền</span><input type="file" accept="application/pdf,.pdf" onChange={select(setBaseFile)}/></label>
      <label className="field"><span>PDF overlay</span><input type="file" accept="application/pdf,.pdf" onChange={select(setOverlayFile)}/></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label className="field"><span>Cách áp overlay</span><select value={mode} onChange={(e)=>setMode(e.target.value as OverlayMode)}><option value="repeat-first">Lặp trang overlay đầu lên mọi trang nền</option><option value="match-pages">Ghép trang 1↔1, 2↔2…</option></select></label>
        <label className="field"><span>Opacity (0–1)</span><input type="number" min="0.05" max="1" step="0.05" value={opacity} onChange={(e)=>setOpacity(Number(e.target.value))}/></label>
        <label className="field"><span>Lề overlay (pt)</span><input type="number" min="0" max="144" step="1" value={margin} onChange={(e)=>setMargin(Number(e.target.value))}/></label>
      </div>
      {baseFile && <p className="selected-file">Nền: <strong>{baseFile.name}</strong></p>}
      {overlayFile && <p className="selected-file">Overlay: <strong>{overlayFile.name}</strong></p>}
      <p className="hint">Overlay được fit vào CropBox của từng trang nền và giữ tỷ lệ/rotation của trang nguồn. Chế độ ghép 1:1 sẽ giữ nguyên các trang nền vượt quá số trang overlay.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!baseFile || !overlayFile || busy || invalid}>{busy ? 'Đang overlay…' : 'Tạo PDF overlay'}</button>
    </section>
  </main>;
}
