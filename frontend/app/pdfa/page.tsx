'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function PdfaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setError(''); }

  async function convert() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('file', file);
      const response = await fetch(`${API_BASE}/archive/pdfa`, { method: 'POST', body });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try { detail = (await response.json()).detail ?? detail; } catch {}
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'solyan-archive-pdfa.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tạo PDF/A.'); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">OCRmyPDF · internal PDF/A</div></header>
    <section className="hero compact-hero"><p className="eyebrow">ARCHIVE · PHASE 5</p><h1>PDF/A</h1><p className="subtitle">Thử chuyển sang PDF/A bằng OCRmyPDF internal backend và pikepdf validator, không fallback Ghostscript.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn PDF</span></label></section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Một số PDF không thể đạt PDF/A nếu font/tài nguyên không đáp ứng chuẩn. Khi đó công cụ trả lỗi thay vì xuất file không đạt chuẩn.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={convert} disabled={!file || busy}>{busy ? 'Đang chuyển…' : 'Tạo PDF/A'}</button>
    </section>
  </main>;
}
