'use client';

import { ChangeEvent, useState } from 'react';
import { chooseAutoRenameSuggestion, extractAutoRenameLines, AutoRenameSuggestion } from '../../lib/auto-rename';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PAGE_COUNT = 500;
const MAX_TITLE_LINES = 200;

function downloadOriginal(bytes: ArrayBuffer, filename: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function analyze(file: File): Promise<{ suggestion: AutoRenameSuggestion; bytes: ArrayBuffer; pages: number; lines: number }> {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > MAX_PAGE_COUNT) throw new Error(`PDF vượt giới hạn ${MAX_PAGE_COUNT} trang cho Auto Rename local.`);
    const titleLines = await extractAutoRenameLines(pdf, MAX_TITLE_LINES);
    return {
      suggestion: chooseAutoRenameSuggestion(titleLines, file.name),
      bytes,
      pages: pdf.numPages,
      lines: titleLines.length,
    };
  } finally {
    await task.destroy();
  }
}

export default function AutoRenamePage() {
  const [file, setFile] = useState<File | null>(null);
  const [suggestion, setSuggestion] = useState<AutoRenameSuggestion | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setSuggestion(null);
      setBytes(null);
      setError('PDF vượt giới hạn 100 MB cho Auto Rename local.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setSuggestion(null);
    setBytes(null);
    setDetails('');
    setError('');
  }

  async function runAnalysis() {
    if (!file) return;
    setBusy(true);
    setError('');
    setSuggestion(null);
    setBytes(null);
    try {
      const result = await analyze(file);
      setSuggestion(result.suggestion);
      setBytes(result.bytes);
      setDetails(`${result.pages} trang · đã xét ${result.lines}/${MAX_TITLE_LINES} dòng text đầu tiên`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể phân tích tên PDF.');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!bytes || !suggestion) return;
    downloadOriginal(bytes, suggestion.filename);
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js · không rewrite file</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · V1.2</p><h1>Tự động đặt tên PDF</h1><p className="subtitle">Phân tích tối đa 200 dòng text bằng PDF.js, ưu tiên dòng có cỡ chữ hiển thị lớn nhất rồi đề xuất tên file an toàn. PDF tải xuống giữ nguyên byte gốc.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn 100 MB / 500 trang. Tài liệu scan không có text layer sẽ giữ tên file gốc; dùng OCR trước nếu muốn suy tên từ nội dung scan.</p>
      {suggestion && <div className="success">
        <strong>Tên đề xuất: {suggestion.filename}</strong>
        <div>{details}</div>
        {suggestion.fallback ? <div>Không tìm thấy tiêu đề text phù hợp · giữ tên gốc.</div> : <div>Nguồn: trang {suggestion.page} · cỡ hiển thị xấp xỉ {suggestion.fontSize?.toFixed(1)}</div>}
      </div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={runAnalysis} disabled={!file || busy}>{busy ? 'Đang phân tích…' : 'Phân tích tên PDF'}</button>
      {suggestion && bytes && <button className="secondary-button" type="button" onClick={download}>Tải PDF với tên đề xuất</button>}
    </section>
  </main>;
}
