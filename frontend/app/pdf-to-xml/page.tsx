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

export default function PdfToXmlPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [firstPage, setFirstPage] = useState('');
  const [lastPage, setLastPage] = useState('');
  const [preciseCoordinates, setPreciseCoordinates] = useState(false);
  const [hiddenText, setHiddenText] = useState(false);
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
    const first = firstPage.trim() ? Number(firstPage) : null;
    const last = lastPage.trim() ? Number(lastPage) : null;
    if (first !== null && (!Number.isInteger(first) || first < 1)) {
      setError('Trang đầu phải là số nguyên từ 1 trở lên.');
      return;
    }
    if (last !== null && (!Number.isInteger(last) || last < 1)) {
      setError('Trang cuối phải là số nguyên từ 1 trở lên.');
      return;
    }
    if (first !== null && last !== null && first > last) {
      setError('Trang đầu không được lớn hơn trang cuối.');
      return;
    }

    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      if (password) body.append('password', password);
      if (first !== null) body.append('first_page', String(first));
      if (last !== null) body.append('last_page', String(last));
      body.append('precise_coordinates', String(preciseCoordinates));
      body.append('include_hidden_text', String(hiddenText));

      const response = await fetch(`${API_BASE}/pdf/to-xml`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      const pages = Number(response.headers.get('X-SolYan-XML-Pages') ?? 0);
      const blob = await response.blob();
      downloadBlob(blob, 'solyan-pdf.xml');
      setResult(`Đã xuất XML UTF-8${pages ? ` cho ${pages} trang` : ''} (${Math.max(1, Math.round(blob.size / 1024))} KB).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang XML.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Poppler · Layout XML</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CONVERT · V1.3</p>
      <h1>PDF → XML</h1>
      <p className="subtitle">Xuất text và tọa độ bố cục của PDF thành XML UTF-8 bằng Poppler, phù hợp xử lý dữ liệu và hậu kỳ tự động.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <label className="field"><span>Mật khẩu PDF (nếu có)</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} maxLength={128} placeholder="Để trống nếu PDF không mã hóa" /></label>
      <div className="form-grid two-col">
        <label className="field"><span>Trang đầu</span><input type="number" min="1" max="10000" value={firstPage} onChange={(e)=>setFirstPage(e.target.value)} placeholder="1" /></label>
        <label className="field"><span>Trang cuối</span><input type="number" min="1" max="10000" value={lastPage} onChange={(e)=>setLastPage(e.target.value)} placeholder="Tới hết" /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={preciseCoordinates} onChange={(e)=>setPreciseCoordinates(e.target.checked)} /><span>Giữ tọa độ chính xác hơn, không làm tròn</span></label>
      <label className="check-row"><input type="checkbox" checked={hiddenText} onChange={(e)=>setHiddenText(e.target.checked)} /><span>Bao gồm hidden text nếu PDF có</span></label>
      <p className="hint">XML giữ text, font và tọa độ trang theo schema <code>pdf2xml</code> của Poppler. Ảnh raster được bỏ qua để đầu ra luôn là một file XML độc lập, không sinh thư mục sidecar.</p>
      <p className="hint"><strong>Giới hạn:</strong> 100 MB PDF đầu vào và tối đa 100 MB XML đầu ra. Đây không phải OCR; PDF scan chỉ có ảnh cần chạy OCR trước nếu muốn có text.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : 'Xuất XML và tải xuống'}</button>
    </section>
  </main>;
}
