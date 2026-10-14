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

export default function RemoveSignaturesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
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
      const response = await fetch(`${API_BASE}/pdf/remove-signatures`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }

      const fields = Number(response.headers.get('X-SolYan-Signature-Fields-Removed') ?? 0);
      const widgets = Number(response.headers.get('X-SolYan-Signature-Widgets-Removed') ?? 0);
      const values = Number(response.headers.get('X-SolYan-Signature-Values-Removed') ?? 0);
      const permissions = Number(response.headers.get('X-SolYan-Signature-Permissions-Removed') ?? 0);
      const dss = Number(response.headers.get('X-SolYan-Signature-DSS-Removed') ?? 0);

      downloadBlob(await response.blob(), 'solyan-unsigned.pdf');
      if (fields + widgets + values + permissions + dss === 0) {
        setResult('Không tìm thấy chữ ký số nhúng. PDF tải về được giữ nguyên byte-for-byte.');
      } else {
        const details = [
          `${fields} signature field`,
          widgets ? `${widgets} widget` : '',
          values ? `${values} signature value` : '',
          permissions ? `${permissions} permission reference` : '',
          dss ? `${dss} DSS` : '',
        ].filter(Boolean).join(', ');
        setResult(`Đã loại trạng thái chữ ký số: ${details}. PDF đầu ra không còn được xem là tài liệu đã ký.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xóa chữ ký số.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf JSON · Signature-safe</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">SECURITY · V1.3</p>
      <h1>Xóa chữ ký số khỏi PDF</h1>
      <p className="subtitle">Loại các trường chữ ký số, widget, dữ liệu chữ ký và trạng thái chứng thực liên quan nhưng giữ các form field không phải chữ ký.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Công cụ này tạo một bản PDF không còn chữ ký số nhúng. Nó không xác minh người ký hoặc độ tin cậy của chứng thư; nếu cần kiểm tra trước, dùng <a href="/verify-signature">Kiểm tra chữ ký số</a>.</p>
      <p className="hint"><strong>Lưu ý:</strong> đây không phải công cụ mở khóa mật khẩu và không nhằm vượt quyền bảo vệ PDF. Với file đã mã hóa, hãy dùng mật khẩu hợp lệ trong công cụ Mở khóa trước.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Xóa chữ ký số và tải PDF'}</button>
    </section>
  </main>;
}
