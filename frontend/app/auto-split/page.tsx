'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default function AutoSplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [duplex, setDuplex] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setResult('');
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 50 MB của OCR service.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function autoSplit() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('duplex', duplex ? 'true' : 'false');

      const response = await fetch(`${API_BASE}/ocr/auto-split`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          message = payload.detail ?? message;
        } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'solyan-auto-split.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const dividers = response.headers.get('x-solyan-auto-split-dividers') ?? '?';
      const parts = response.headers.get('x-solyan-auto-split-parts') ?? '?';
      setResult(`Đã nhận diện ${dividers} trang phân cách và tạo ${parts} phần PDF trong ZIP.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tự động tách PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">OpenCV QR + PDFium + qpdf · V1.2</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">AUTO SPLIT · QR DIVIDER · V1.2</p>
      <h1>Tự động tách PDF bằng trang QR phân cách</h1>
      <p className="subtitle">In trang QR chuẩn của SolYan, đặt giữa các bộ tài liệu rồi scan thành một PDF. Hệ thống chỉ dùng raster tạm thời để tìm QR; các phần PDF đầu ra được chọn trực tiếp bằng qpdf nên không rasterize nội dung gốc.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF đã scan</span></label>
    </section>

    <section className="workspace form-workspace">
      <a className="secondary-action" href="/solyan-auto-split-divider.svg" target="_blank" rel="noreferrer">Mở trang QR phân cách để in ↗</a>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <label className="checkbox-row"><input type="checkbox" checked={duplex} onChange={(event) => setDuplex(event.target.checked)}/><span>Scan hai mặt: bỏ cả mặt sau ngay sau mỗi trang QR phân cách.</span></label>
      <p className="hint">Trang QR phân cách luôn bị loại khỏi kết quả và không tạo file rỗng. Với scan một mặt, chỉ chính trang QR bị bỏ.</p>
      <p className="hint">Tối đa 300 trang và 50 MB. Nhận diện thử ở 150 DPI, chỉ tăng lên 300 DPI khi chưa thấy đúng marker SolYan.</p>
      <p className="hint">Nếu không tìm thấy QR phân cách, ZIP chứa một PDF giữ nguyên byte nguồn thay vì rewrite không cần thiết.</p>
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={autoSplit} disabled={!file || busy}>{busy ? 'Đang nhận diện và tách…' : 'Tự động tách và tải ZIP'}</button>
    </section>
  </main>;
}
