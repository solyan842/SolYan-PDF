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

export default function RemoveAnnotationsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'comments' | 'all'>('comments');
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
      body.append('remove_all_non_widget', String(mode === 'all'));
      const response = await fetch(`${API_BASE}/pdf/remove-annotations`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      const comments = Number(response.headers.get('X-SolYan-Comments-Removed') ?? 0);
      const other = Number(response.headers.get('X-SolYan-Other-Annotations-Removed') ?? 0);
      const widgets = Number(response.headers.get('X-SolYan-Widgets-Preserved') ?? 0);
      downloadBlob(await response.blob(), 'solyan-without-comments.pdf');
      setResult(`Đã xóa ${comments} comment/markup${other ? ` và ${other} annotation khác` : ''}; giữ ${widgets} Widget/Form.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xóa annotation.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf JSON · Form-safe</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CLEANUP · V1.2</p>
      <h1>Xóa comment / annotation</h1>
      <p className="subtitle">Xóa ghi chú và markup mà không phá Widget/Form. Chế độ mặc định giữ riêng Link và FileAttachment để không chồng chức năng với Làm sạch PDF và File đính kèm.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Chế độ</span><select value={mode} onChange={(e)=>setMode(e.target.value as 'comments' | 'all')}><option value="comments">An toàn — chỉ xóa comment / markup</option><option value="all">Xóa mọi annotation trừ Widget/Form</option></select></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Safe mode xóa Text, FreeText, Line, Square, Circle, Polygon, PolyLine, Highlight, Underline, Squiggly, StrikeOut, Stamp, Caret, Ink và Popup. Widget/Form luôn được giữ. Chế độ “mọi annotation” sẽ xóa cả Link và FileAttachment annotation nhưng vẫn giữ Widget.</p>
      <p className="hint"><strong>Lưu ý:</strong> xóa annotation không phải secure redaction. Nếu cần xóa dữ liệu nhạy cảm khỏi nội dung PDF, dùng công cụ Redact.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Xóa annotation và tải PDF'}</button>
    </section>
  </main>;
}
