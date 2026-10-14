'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function UnlockFormsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setResult('');
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE}/pdf/unlock-forms`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }

      const flags = Number(response.headers.get('X-SolYan-Readonly-Flags-Cleared') ?? 0);
      const locks = Number(response.headers.get('X-SolYan-Form-Locks-Removed') ?? 0);
      const xfa = Number(response.headers.get('X-SolYan-XFA-Attributes-Opened') ?? 0);
      const visited = Number(response.headers.get('X-SolYan-Form-Fields-Visited') ?? 0);
      downloadBlob(await response.blob(), 'solyan-unlocked-forms.pdf');

      if (flags + locks + xfa === 0) {
        setResult(`Không tìm thấy trường form bị khóa/read-only${visited ? ` trong ${visited} field đã kiểm tra` : ''}. PDF tải về được giữ nguyên byte-for-byte.`);
      } else {
        const details = [
          flags ? `${flags} cờ ReadOnly` : '',
          locks ? `${locks} mục Lock` : '',
          xfa ? `${xfa} thuộc tính XFA readOnly` : '',
        ].filter(Boolean).join(', ');
        setResult(`Đã mở form: ${details}. Các cờ form khác và giá trị hiện có được giữ nguyên.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể mở khóa trường form.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf JSON · AcroForm/XFA</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">FORMS · V1.3</p>
      <h1>Mở khóa trường Form PDF</h1>
      <p className="subtitle">Gỡ trạng thái ReadOnly/Lock khỏi AcroForm và chuyển XFA <code>access=&quot;readOnly&quot;</code> sang <code>open</code> để các trường có thể điền lại.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Công cụ chỉ thay đổi trạng thái field/form, không flatten và không xóa giá trị đang có. Nếu không có field bị khóa, file đầu ra giữ nguyên byte-for-byte.</p>
      <p className="hint"><strong>Không phải mở khóa mật khẩu:</strong> PDF mã hóa cần được giải mã bằng mật khẩu hợp lệ trong công cụ <a href="/unlock">Mở khóa PDF</a> trước. Công cụ này không nhằm vượt quyền truy cập tài liệu.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Mở khóa Form và tải PDF'}</button>
    </section>
  </main>;
}
