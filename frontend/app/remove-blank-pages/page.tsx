'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function RemoveBlankPagesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(10);
  const [whitePercent, setWhitePercent] = useState(99.9);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
    setResult('');
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('threshold', String(threshold));
      body.append('white_percent', String(whitePercent));
      const response = await fetch(`${API_BASE}/pdf/remove-blank-pages`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const detail = await response.json(); message = detail.detail ?? message; } catch {}
        throw new Error(message);
      }

      const removed = response.headers.get('X-SolYan-Blank-Pages-Removed') ?? '0';
      const pages = response.headers.get('X-SolYan-Blank-Pages') ?? '';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'solyan-without-blank-pages.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setResult(pages ? `Đã loại ${removed} trang trắng: ${pages}.` : 'Không phát hiện trang trắng; PDF đã được giữ nguyên số trang.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể loại trang trắng.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf + Poppler server</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CLEANUP · POPPLER + QPDF</p>
      <h1>Xóa trang trắng</h1>
      <p className="subtitle">Trang có text luôn được giữ. Chỉ trang không có text mới được render grayscale để đo độ trắng trước khi qpdf loại khỏi tài liệu.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Ngưỡng trắng pixel (0–255)</span><input type="number" min="0" max="255" step="1" value={threshold} onChange={(e)=>setThreshold(Number(e.target.value))}/></label>
      <label className="field"><span>Tỷ lệ pixel trắng tối thiểu (%)</span><input type="number" min="0.1" max="100" step="0.1" value={whitePercent} onChange={(e)=>setWhitePercent(Number(e.target.value))}/></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Mặc định 10 / 99.9% tương đương pixel grayscale ≥245 phải chiếm ít nhất 99.9% trang. Giới hạn: 100 MB, 300 trang; trang text được giữ không cần raster.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy || threshold < 0 || threshold > 255 || whitePercent <= 0 || whitePercent > 100}>{busy ? 'Đang phân tích…' : 'Xóa trang trắng'}</button>
    </section>
  </main>;
}
