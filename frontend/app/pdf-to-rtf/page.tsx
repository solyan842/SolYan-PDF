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

export default function PdfToRtfPage() {
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
      const response = await fetch(`${API_BASE}/pdf/to-rtf`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      const engine = response.headers.get('X-SolYan-RTF-Engine') ?? 'LibreOffice-PDF-import';
      const blob = await response.blob();
      downloadBlob(blob, 'solyan-pdf.rtf');
      setResult(`Đã tạo RTF bằng ${engine} (${Math.max(1, Math.round(blob.size / 1024))} KB).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang RTF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">LibreOffice · Writer PDF Import</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CONVERT · V1.3</p>
      <h1>PDF → RTF</h1>
      <p className="subtitle">Nhập PDF bằng LibreOffice Writer rồi xuất Rich Text Format (.rtf), phù hợp khi cần tài liệu văn bản có thể tiếp tục chỉnh sửa trong nhiều ứng dụng.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">RTF là bản tái dựng qua LibreOffice PDF import. Bố cục phức tạp, font nhúng, vector, form, annotation và tương tác PDF có thể không được bảo toàn hoàn toàn.</p>
      <p className="hint"><strong>Giới hạn:</strong> tối đa 100 MB. Công cụ không mở khóa PDF mã hóa; hãy dùng Mở khóa PDF với mật khẩu hợp lệ trước nếu cần.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : 'Tạo RTF và tải xuống'}</button>
    </section>
  </main>;
}
