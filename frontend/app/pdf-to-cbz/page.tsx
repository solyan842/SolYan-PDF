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

export default function PdfToCbzPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [dpi, setDpi] = useState('150');
  const [firstPage, setFirstPage] = useState('');
  const [lastPage, setLastPage] = useState('');
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
    const parsedDpi = Number(dpi);
    const first = firstPage.trim() ? Number(firstPage) : null;
    const last = lastPage.trim() ? Number(lastPage) : null;
    if (!Number.isInteger(parsedDpi) || parsedDpi < 72 || parsedDpi > 300) {
      setError('DPI phải là số nguyên từ 72 đến 300.');
      return;
    }
    if (first !== null && (!Number.isInteger(first) || first < 1 || first > 1000)) {
      setError('Trang đầu phải là số nguyên từ 1 đến 1000.');
      return;
    }
    if (last !== null && (!Number.isInteger(last) || last < 1 || last > 1000)) {
      setError('Trang cuối phải là số nguyên từ 1 đến 1000.');
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
      body.append('dpi', String(parsedDpi));
      if (first !== null) body.append('first_page', String(first));
      if (last !== null) body.append('last_page', String(last));

      const response = await fetch(`${API_BASE}/pdf/to-cbz`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      const pages = Number(response.headers.get('X-SolYan-CBZ-Pages') ?? 0);
      const usedDpi = Number(response.headers.get('X-SolYan-CBZ-DPI') ?? parsedDpi);
      const blob = await response.blob();
      downloadBlob(blob, 'solyan-pdf.cbz');
      setResult(`Đã tạo CBZ gồm ${pages || 'các'} trang ở ${usedDpi} DPI (${Math.max(1, Math.round(blob.size / 1024))} KB).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang CBZ.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Poppler · CBZ</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CONVERT · V1.3</p>
      <h1>PDF → CBZ</h1>
      <p className="subtitle">Render từng trang PDF thành PNG rồi đóng gói theo thứ tự vào Comic Book ZIP (.cbz), hoàn toàn self-host bằng Poppler.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <label className="field"><span>Mật khẩu PDF (nếu có)</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} maxLength={128} placeholder="Để trống nếu PDF không mã hóa" /></label>
      <label className="field"><span>Độ phân giải</span><select value={dpi} onChange={(e)=>setDpi(e.target.value)}><option value="96">96 DPI · nhẹ</option><option value="150">150 DPI · cân bằng</option><option value="200">200 DPI · rõ</option><option value="300">300 DPI · cao</option></select></label>
      <div className="form-grid two-col">
        <label className="field"><span>Trang đầu</span><input type="number" min="1" max="1000" value={firstPage} onChange={(e)=>setFirstPage(e.target.value)} placeholder="1" /></label>
        <label className="field"><span>Trang cuối</span><input type="number" min="1" max="1000" value={lastPage} onChange={(e)=>setLastPage(e.target.value)} placeholder="Tới hết" /></label>
      </div>
      <p className="hint">CBZ là ZIP chứa ảnh trang theo thứ tự; phù hợp comic/manga hoặc tài liệu cần đọc như chuỗi ảnh. Chuyển đổi này rasterize trang PDF nên text/vector/form không còn tương tác.</p>
      <p className="hint"><strong>Giới hạn:</strong> 100 MB PDF đầu vào, tối đa 1.000 trang mỗi request, 72–300 DPI và tối đa 500 MB CBZ đầu ra.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang render…' : 'Tạo CBZ và tải xuống'}</button>
    </section>
  </main>;
}
