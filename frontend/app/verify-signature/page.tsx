'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type CertInfo = {
  subject?: string | null;
  issuer?: string | null;
  serial_number?: string | null;
  sha256_fingerprint?: string | null;
  not_valid_before?: string | null;
  not_valid_after?: string | null;
};

type SignatureResult = {
  field_name?: string | null;
  signature_type?: string | null;
  signing_time?: string | null;
  certificate?: CertInfo;
  intact: boolean;
  cryptographically_valid: boolean;
  trusted: boolean;
  bottom_line: boolean;
  trust_problem?: string | null;
  coverage?: string | null;
  modification_level?: string | null;
  docmdp_ok?: boolean | null;
  digest_algorithm?: string | null;
  signature_mechanism?: string | null;
  validation_error?: string | null;
};

type ValidationResponse = {
  signature_count: number;
  all_intact: boolean;
  all_cryptographically_valid: boolean;
  all_trusted: boolean;
  all_bottom_line: boolean;
  network_fetching: boolean;
  signatures: SignatureResult[];
};

function flag(value: boolean, yes: string, no: string) {
  return <span className={value ? 'tool-badge local' : 'tool-badge server'}>{value ? yes : no}</span>;
}

export default function VerifySignaturePage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ValidationResponse | null>(null);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setResult(null);
    setError('');
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE}/sign/validate`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      setResult(await response.json() as ValidationResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể kiểm tra chữ ký PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">pyHanko · Offline validation</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">DIGITAL SIGNATURE · V1.2</p>
      <h1>Kiểm tra chữ ký số PDF</h1>
      <p className="subtitle">Kiểm tra tính toàn vẹn, chữ ký mật mã, chuỗi tin cậy và thay đổi sau khi ký. Mặc định không fetch OCSP/CRL qua Internet.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang xác thực…' : 'Kiểm tra chữ ký'}</button>
      {error && <div className="error">{error}</div>}

      {result && <>
        <div className="workspace-head"><div><h2>{result.signature_count} chữ ký được tìm thấy</h2><p>Network fetching: {result.network_fetching ? 'bật' : 'tắt'}</p></div></div>
        {result.signature_count === 0 && <div className="empty">PDF không có embedded digital signature.</div>}
        {result.signature_count > 0 && <div className="metric-row">
          <span>Toàn vẹn: <b>{result.all_intact ? 'Có' : 'Không'}</b></span>
          <span>Crypto hợp lệ: <b>{result.all_cryptographically_valid ? 'Có' : 'Không'}</b></span>
          <span>Chain được trust: <b>{result.all_trusted ? 'Có' : 'Không'}</b></span>
          <span>Bottom line: <b>{result.all_bottom_line ? 'PASS' : 'Chưa PASS'}</b></span>
        </div>}

        {result.signatures.map((signature, index) => <article className="utility-card" key={`${signature.field_name ?? 'sig'}-${index}`}>
          <h2>Chữ ký {index + 1} · {signature.field_name || 'Không tên'}</h2>
          <div className="inline-controls">
            {flag(signature.intact, 'Intact', 'Not intact')}
            {flag(signature.cryptographically_valid, 'Crypto valid', 'Crypto invalid')}
            {flag(signature.trusted, 'Trusted', 'Untrusted')}
            {flag(signature.bottom_line, 'PASS', 'Not PASS')}
          </div>
          <div className="result-box">
            <b>Signer:</b> {signature.certificate?.subject || 'Không xác định'}<br/>
            <b>Issuer:</b> {signature.certificate?.issuer || 'Không xác định'}<br/>
            <b>Serial:</b> {signature.certificate?.serial_number || '—'}<br/>
            <b>SHA-256:</b> {signature.certificate?.sha256_fingerprint || '—'}<br/>
            <b>Thời gian ký:</b> {signature.signing_time || '—'}<br/>
            <b>Hiệu lực certificate:</b> {signature.certificate?.not_valid_before || '—'} → {signature.certificate?.not_valid_after || '—'}<br/>
            <b>Digest:</b> {signature.digest_algorithm || '—'} · <b>Mechanism:</b> {signature.signature_mechanism || '—'}<br/>
            <b>Coverage:</b> {signature.coverage || '—'} · <b>Modification:</b> {signature.modification_level || '—'}<br/>
            <b>DocMDP:</b> {signature.docmdp_ok == null ? '—' : (signature.docmdp_ok ? 'OK' : 'Vi phạm')}<br/>
            <b>Trust problem:</b> {signature.trust_problem || 'Không có / không báo cáo'}
          </div>
          {signature.validation_error && <div className="error">Validator: {signature.validation_error}</div>}
        </article>)}
        <p className="hint">“Intact/Crypto valid” trả lời chữ ký có bị phá vỡ và phép ký có đúng hay không. “Trusted” còn phụ thuộc chain chứng thư trong trust store của máy chủ. Chứng thư nội bộ/self-signed có thể crypto-valid nhưng untrusted. SolYan không tự biến chứng thư chưa được trust thành trusted.</p>
      </>}
    </section>
  </main>;
}
