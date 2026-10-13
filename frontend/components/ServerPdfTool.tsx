'use client';

import { ChangeEvent, useState } from 'react';

type Props = {
  title: string;
  description: string;
  endpoint:
    | '/pdf/protect'
    | '/pdf/unlock'
    | '/pdf/repair'
    | '/pdf/compress'
    | '/pdf/web-optimize'
    | '/pdf/flatten'
    | '/pdf/compress-images';
  actionLabel: string;
  outputName: string;
  passwordMode?: 'required' | 'optional';
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function ServerPdfTool({ title, description, endpoint, actionLabel, outputName, passwordMode }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
  }

  async function run() {
    if (!file || (passwordMode === 'required' && !password)) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      if (passwordMode) body.append('password', password);
      const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const detail = await response.json(); message = detail.detail ?? message; } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = outputName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xử lý PDF.');
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Xử lý bằng qpdf server</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · QPDF</p><h1>{title}</h1><p className="subtitle">{description}</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      {passwordMode && <label className="field"><span>Mật khẩu {passwordMode === 'optional' ? '(nếu có)' : ''}</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="new-password" /></label>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Tác vụ này cần backend qpdf. Giới hạn mặc định: 100 MB/file.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy || (passwordMode === 'required' && !password)}>{busy ? 'Đang xử lý…' : actionLabel}</button>
    </section>
  </main>;
}
