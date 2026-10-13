'use client';

import { ChangeEvent, useState } from 'react';
import { BookletDuplexPass, BookletSpine, createBookletPdf } from '../../lib/booklet';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export default function BookletPage() {
  const [file, setFile] = useState<File | null>(null);
  const [spine, setSpine] = useState<BookletSpine>('left');
  const [gutter, setGutter] = useState(12);
  const [outerMargin, setOuterMargin] = useState(9);
  const [border, setBorder] = useState(false);
  const [duplexPass, setDuplexPass] = useState<BookletDuplexPass>('both');
  const [flipOnShortEdge, setFlipOnShortEdge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho booklet trong trình duyệt.');
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
      const bytes = await createBookletPdf(await file.arrayBuffer(), {
        spine,
        gutter,
        outerMargin,
        border,
        duplexPass,
        flipOnShortEdge,
      });
      downloadPdf(bytes, 'solyan-booklet.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo booklet.');
    } finally {
      setBusy(false);
    }
  }

  const invalid = !Number.isFinite(gutter) || gutter < 0 || gutter > 144 || !Number.isFinite(outerMargin) || outerMargin < 0 || outerMargin > 72;

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Không upload PDF</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">PRINT · SADDLE STITCH</p>
      <h1>Booklet · Dàn trang đóng ghim giữa</h1>
      <p className="subtitle">Tự thêm ô trắng đến bội số 4, đảo thứ tự trang đúng kiểu booklet và xếp 2 trang trên mỗi mặt giấy ngang.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label className="field"><span>Gáy đóng</span><select value={spine} onChange={(e)=>setSpine(e.target.value as BookletSpine)}><option value="left">Gáy trái</option><option value="right">Gáy phải / RTL</option></select></label>
        <label className="field"><span>Mặt xuất</span><select value={duplexPass} onChange={(e)=>setDuplexPass(e.target.value as BookletDuplexPass)}><option value="both">Cả mặt trước + sau</option><option value="fronts">Chỉ mặt trước</option><option value="backs">Chỉ mặt sau</option></select></label>
        <label className="field"><span>Gutter giữa (pt)</span><input type="number" min="0" max="144" step="1" value={gutter} onChange={(e)=>setGutter(Number(e.target.value))}/></label>
        <label className="field"><span>Lề ngoài (pt)</span><input type="number" min="0" max="72" step="1" value={outerMargin} onChange={(e)=>setOuterMargin(Number(e.target.value))}/></label>
        <label className="field"><span>Viền ô trang</span><select value={border ? 'yes' : 'no'} onChange={(e)=>setBorder(e.target.value === 'yes')}><option value="no">Không</option><option value="yes">Có</option></select></label>
        <label className="field"><span>Duplex cạnh ngắn</span><select value={flipOnShortEdge ? 'yes' : 'no'} onChange={(e)=>setFlipOnShortEdge(e.target.value === 'yes')} disabled={duplexPass !== 'both'}><option value="no">Không đảo mặt sau</option><option value="yes">Đảo trái/phải mặt sau</option></select></label>
      </div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Khổ giấy đầu ra lấy theo CropBox trang đầu và ép ngang. Booklet dùng 2-up; trang thiếu được để trắng. Khi in duplex thủ công, chọn Fronts/Backs riêng và tự lật chồng giấy.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy || invalid}>{busy ? 'Đang dàn booklet…' : 'Tạo Booklet PDF'}</button>
    </section>
  </main>;
}
