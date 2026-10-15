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

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

export default function PdfToCsvPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 50 MB của pipeline nhận diện bảng.');
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
      const response = await fetch(`${API_BASE}/pdf/to-csv`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      const files = Number(response.headers.get('X-SolYan-CSV-Files') ?? 1);
      const engine = response.headers.get('X-SolYan-CSV-Engine') ?? 'PP-StructureV3';
      const isZip = response.headers.get('Content-Type')?.includes('application/zip') ?? false;
      const fallback = isZip ? 'solyan-pdf-csv.zip' : 'solyan-pdf.csv';
      const blob = await response.blob();
      downloadBlob(blob, responseFilename(response, fallback));
      setResult(files > 1
        ? `Đã trích ${files} bảng/trang dữ liệu bằng ${engine} và đóng gói thành ZIP.`
        : `Đã trích 1 bảng/trang dữ liệu thành CSV bằng ${engine}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang CSV.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">PP-StructureV3 · Table extraction</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CONVERT · V1.3</p>
      <h1>PDF → CSV</h1>
      <p className="subtitle">Nhận diện bảng trong PDF bằng pipeline PP-StructureV3 hiện có rồi xuất dữ liệu dạng CSV UTF-8. Một trang có dữ liệu tạo một CSV; nhiều trang có dữ liệu được đóng gói thành ZIP.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Các bảng được nhận diện trên cùng một trang được xếp nối tiếp trong CSV của trang đó. Trang không có ô bảng hữu ích sẽ không tạo CSV. Chuỗi có dạng công thức bảng tính được vô hiệu hóa khi xuất để giảm rủi ro CSV formula injection.</p>
      <p className="hint"><strong>Giới hạn:</strong> tối đa 50 MB. Đây là nhận diện cấu trúc/OCR nên kết quả phụ thuộc chất lượng PDF; không phải bản sao byte-perfect của bảng gốc.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang nhận diện bảng…' : 'Tạo CSV và tải xuống'}</button>
    </section>
  </main>;
}
