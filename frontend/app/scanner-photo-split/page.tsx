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

export default function ScannerPhotoSplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [angleThreshold, setAngleThreshold] = useState(10);
  const [tolerance, setTolerance] = useState(30);
  const [minArea, setMinArea] = useState(10000);
  const [minContourArea, setMinContourArea] = useState(500);
  const [borderSize, setBorderSize] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setResult('');
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('File vượt giới hạn 50 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('angle_threshold', String(angleThreshold));
      body.append('tolerance', String(tolerance));
      body.append('min_area', String(minArea));
      body.append('min_contour_area', String(minContourArea));
      body.append('border_size', String(borderSize));
      const response = await fetch(`${API_BASE}/ocr/scanner-photo-split`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      downloadBlob(await response.blob(), 'solyan-scanned-photos.zip');
      setResult('Đã tách các vùng ảnh phát hiện được thành PNG và tải một file ZIP theo thứ tự trang → vị trí.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tách ảnh scan.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">OpenCV + PDFium · V1.3</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">SCAN · V1.3</p>
      <h1>Tách ảnh từ bản scan</h1>
      <p className="subtitle">Nhận diện nhiều ảnh đặt trên cùng mặt máy scan, crop từng ảnh, tự deskew khi góc lệch đủ lớn và xuất PNG trong một ZIP.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/tiff,image/bmp,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp" onChange={onFile}/><span>+ Chọn PDF hoặc ảnh scan</span></label>
    </section>

    <section className="workspace form-workspace">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <label className="field"><span>Ngưỡng deskew (độ)</span><input type="number" min={0} max={45} step={1} value={angleThreshold} onChange={(e)=>setAngleThreshold(Number(e.target.value))}/></label>
        <label className="field"><span>Sai số màu nền</span><input type="number" min={0} max={255} step={1} value={tolerance} onChange={(e)=>setTolerance(Number(e.target.value))}/></label>
        <label className="field"><span>Diện tích vùng tối thiểu (px²)</span><input type="number" min={100} max={100000000} step={100} value={minArea} onChange={(e)=>setMinArea(Number(e.target.value))}/></label>
        <label className="field"><span>Contour tối thiểu (px²)</span><input type="number" min={0} max={100000000} step={100} value={minContourArea} onChange={(e)=>setMinContourArea(Number(e.target.value))}/></label>
        <label className="field"><span>Viền giữ thêm (px)</span><input type="number" min={0} max={500} step={1} value={borderSize} onChange={(e)=>setBorderSize(Number(e.target.value))}/></label>
      </div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Mặc định bám bộ tham số upstream phổ biến: 10° / tolerance 30 / min area 10.000 / contour 500 / border 1. PDF được render tạm bằng PDFium ở tối đa 300 DPI rồi mới phân tích; bản PDF gốc không bị sửa.</p>
      <p className="hint">Giới hạn: 50 MB input, tối đa 100 trang PDF, 500 ảnh đầu ra, 250 MB PNG đã mã hóa và trần raster tổng để tránh file scan bất thường làm tràn RAM.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang nhận diện và tách…' : 'Tách ảnh và tải ZIP'}</button>
    </section>
  </main>;
}
