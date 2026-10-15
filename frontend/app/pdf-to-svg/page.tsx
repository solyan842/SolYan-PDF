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

function responseFilename(header: string | null, fallback: string) {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try { return decodeURIComponent(utf8[1].replace(/^"|"$/g, '')); } catch {}
  }
  const basic = header.match(/filename="?([^";]+)"?/i);
  return basic?.[1] ?? fallback;
}

export default function PdfToSvgPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [firstPage, setFirstPage] = useState('');
  const [lastPage, setLastPage] = useState('');
  const [rasterDpi, setRasterDpi] = useState('150');
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

  function parseOptionalPage(value: string, label: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
      throw new Error(`${label} phải là số nguyên từ 1 đến 10000.`);
    }
    return parsed;
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const first = parseOptionalPage(firstPage, 'Trang đầu');
      const last = parseOptionalPage(lastPage, 'Trang cuối');
      if (first !== null && last !== null && first > last) {
        throw new Error('Trang đầu không được lớn hơn trang cuối.');
      }
      const dpi = Number(rasterDpi);
      if (!Number.isInteger(dpi) || dpi < 72 || dpi > 300) {
        throw new Error('Raster DPI phải là số nguyên từ 72 đến 300.');
      }

      const body = new FormData();
      body.append('file', file);
      body.append('raster_dpi', String(dpi));
      if (password) body.append('password', password);
      if (first !== null) body.append('first_page', String(first));
      if (last !== null) body.append('last_page', String(last));

      const response = await fetch(`${API_BASE}/pdf/to-svg`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      const isZip = response.headers.get('content-type')?.startsWith('application/zip') ?? false;
      const fallback = isZip ? 'solyan-pdf-svg.zip' : `solyan-pdf-page-${first ?? 1}.svg`;
      const filename = responseFilename(response.headers.get('content-disposition'), fallback);
      downloadBlob(blob, filename);
      setResult(isZip
        ? `Đã tạo bộ SVG và đóng ZIP (${Math.max(1, Math.round(blob.size / 1024))} KB).`
        : `Đã tạo SVG (${Math.max(1, Math.round(blob.size / 1024))} KB).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang SVG.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Poppler · pdftocairo</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CONVERT · V1.5</p>
      <h1>PDF → SVG</h1>
      <p className="subtitle">Xuất từng trang PDF thành SVG bằng Poppler đã có sẵn trong backend. Một trang tải trực tiếp `.svg`; nhiều trang được đóng ZIP, không thêm runtime mới.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <label className="field"><span>Mật khẩu PDF (nếu có)</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} maxLength={128} placeholder="Để trống nếu PDF không mã hóa" /></label>
      <div className="form-grid two-col">
        <label className="field"><span>Trang đầu</span><input type="number" min="1" max="10000" value={firstPage} onChange={(e)=>setFirstPage(e.target.value)} placeholder="1" /></label>
        <label className="field"><span>Trang cuối</span><input type="number" min="1" max="10000" value={lastPage} onChange={(e)=>setLastPage(e.target.value)} placeholder="Tới hết" /></label>
      </div>
      <label className="field"><span>Raster DPI cho phần không thể giữ vector</span><select value={rasterDpi} onChange={(e)=>setRasterDpi(e.target.value)}><option value="72">72 DPI · nhẹ</option><option value="150">150 DPI · mặc định</option><option value="200">200 DPI</option><option value="300">300 DPI · chi tiết hơn</option></select></label>
      <p className="hint"><strong>Vector-first:</strong> chữ/đường/shape được Cairo giữ ở dạng vector khi biểu diễn được. Các vùng không thể biểu diễn vector có thể được raster hóa ở DPI đã chọn; tăng DPI có thể làm SVG lớn hơn.</p>
      <p className="hint"><strong>Nhiều trang:</strong> SVG là định dạng một trang/canvas, vì vậy SolYan gọi Poppler riêng cho từng trang và đóng các file `page_001.svg`, `page_002.svg`… vào ZIP.</p>
      <div className="error"><strong>Lưu ý khi nhúng web:</strong> SVG nói chung có thể chứa nội dung active. Route này chỉ sinh SVG từ PDF bằng Poppler và trả dưới dạng file tải xuống; chỉ nhúng/mở SVG trong ngữ cảnh tin cậy phù hợp.</div>
      <p className="hint"><strong>Giới hạn:</strong> 100 MB PDF đầu vào · tối đa 100 trang/lần · 64 MB cho mỗi SVG · 250 MB tổng SVG/ZIP · raster fallback 72–300 DPI · timeout 120 giây cho mỗi lần chuyển trang.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : 'Tạo SVG và tải xuống'}</button>
    </section>
  </main>;
}
