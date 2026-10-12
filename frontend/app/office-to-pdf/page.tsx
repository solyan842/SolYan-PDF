'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function OfficeToPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
  }

  async function convert() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE}/office/to-pdf`, { method: 'POST', body });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try { detail = (await response.json()).detail ?? detail; } catch {}
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${file.name.replace(/\.[^.]+$/, '') || 'document'}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển Office sang PDF.');
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">LibreOffice service</div></header>
    <section className="hero compact-hero"><p className="eyebrow">OFFICE · PHASE 4</p><h1>Office → PDF</h1><p className="subtitle">Chuyển Word, Excel, PowerPoint, OpenDocument và RTF sang PDF bằng LibreOffice headless.</p><label className="picker"><input type="file" accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf" onChange={onFile}/><span>+ Chọn file Office</span></label></section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      <p className="hint">Giới hạn mặc định 100 MB/file. Font trên server ảnh hưởng trực tiếp độ giống bản gốc.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={convert} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : 'Chuyển sang PDF'}</button>
    </section>
  </main>;
}
