'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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

export default function PdfToMarkdownPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 50 MB của pipeline OCR.');
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
      const response = await fetch(`${API_BASE}/pdf/to-markdown`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      const engine = response.headers.get('X-SolYan-Markdown-Engine') ?? 'PP-StructureV3';
      const pages = Number(response.headers.get('X-SolYan-Markdown-Pages') ?? 0);
      const blob = await response.blob();
      downloadBlob(blob, 'solyan-pdf.md');
      setResult(`Đã tạo Markdown${pages ? ` từ ${pages} trang` : ''} bằng ${engine}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang Markdown.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">PP-StructureV3 · Layout OCR</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CONVERT · V1.3</p>
      <h1>PDF → Markdown</h1>
      <p className="subtitle">Tái sử dụng pipeline PP-StructureV3 hiện có để nhận diện bố cục và xuất Markdown, phù hợp cả PDF scan và tài liệu có cấu trúc phức tạp.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Đầu ra là Markdown do engine layout/OCR sinh ra từ cấu trúc nhận diện. Đây không phải chuyển đổi byte-perfect: font, tọa độ tuyệt đối, form, annotation và tương tác PDF không được bảo toàn.</p>
      <p className="hint"><strong>Giới hạn:</strong> tối đa 50 MB theo OCR service. Chất lượng phụ thuộc độ rõ của trang và khả năng nhận diện layout/table của PP-StructureV3.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang phân tích bố cục…' : 'Tạo Markdown và tải xuống'}</button>
    </section>
  </main>;
}
