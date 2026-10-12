'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function SignPage() {
  const [file, setFile] = useState<File | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [fieldName, setFieldName] = useState('Signature1');
  const [reason, setReason] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sign() {
    if (!file || !certificate) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('certificate', certificate);
      body.append('passphrase', passphrase);
      body.append('field_name', fieldName || 'Signature1');
      body.append('reason', reason);
      body.append('location', location);
      const response = await fetch(`${API_BASE}/sign/pkcs12`, { method: 'POST', body });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try { detail = (await response.json()).detail ?? detail; } catch {}
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'solyan-signed.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể ký PDF.');
    } finally { setBusy(false); }
  }

  function pick(setter: (file: File | null) => void, event: ChangeEvent<HTMLInputElement>) {
    setter(event.target.files?.[0] ?? null); setError('');
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">pyHanko · PKCS#12</div></header>
    <section className="hero compact-hero"><p className="eyebrow">DIGITAL SIGN · PHASE 5</p><h1>Ký số PDF</h1><p className="subtitle">Ký mật mã thật bằng private key và chứng thư trong file PKCS#12 (.p12/.pfx). File chứng thư chỉ được dùng trong request ký.</p></section>
    <section className="workspace form-workspace">
      <label className="field"><span>PDF cần ký</span><input type="file" accept="application/pdf,.pdf" onChange={(e)=>pick(setFile,e)}/></label>
      <label className="field"><span>Chứng thư PKCS#12</span><input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e)=>pick(setCertificate,e)}/></label>
      <label className="field"><span>Mật khẩu PKCS#12</span><input type="password" value={passphrase} onChange={(e)=>setPassphrase(e.target.value)} autoComplete="new-password"/></label>
      <label className="field"><span>Tên trường chữ ký</span><input value={fieldName} onChange={(e)=>setFieldName(e.target.value)}/></label>
      <label className="field"><span>Lý do ký</span><input value={reason} onChange={(e)=>setReason(e.target.value)}/></label>
      <label className="field"><span>Địa điểm</span><input value={location} onChange={(e)=>setLocation(e.target.value)}/></label>
      <p className="hint">Nếu PDF chưa có field tên tương ứng, pyHanko tạo field chữ ký vô hình. Đây là chữ ký số cryptographic, khác với việc chèn ảnh chữ ký.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={sign} disabled={!file || !certificate || busy}>{busy ? 'Đang ký…' : 'Ký số PDF'}</button>
    </section>
  </main>;
}
