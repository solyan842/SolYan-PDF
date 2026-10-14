'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default function AutoRotatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [confidence, setConfidence] = useState(14);
  const [inferUndetected, setInferUndetected] = useState(false);
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

  async function autoRotate() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('confidence_threshold', String(confidence));
      body.append('infer_undetected', inferUndetected ? 'true' : 'false');

      const response = await fetch(`${API_BASE}/ocr/auto-rotate`, { method: 'POST', body });
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
      anchor.download = 'solyan-auto-rotated.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setResult('Đã phân tích hướng trang và tải PDF kết quả. Trang không đủ độ tin cậy được giữ nguyên.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tự động xoay PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Tesseract OSD + qpdf · V1.2</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">AUTO ROTATE · OCR ORIENTATION · V1.2</p>
      <h1>Tự động xoay đúng hướng trang PDF</h1>
      <p className="subtitle">Phân tích từng trang bằng Tesseract OSD trên raster tạm thời, sau đó chỉ cập nhật rotation bằng qpdf để giữ nguyên text, vector và ảnh gốc.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <label className="field-label" htmlFor="confidence">Ngưỡng tin cậy OSD: <strong>{confidence.toFixed(1)}</strong></label>
      <input id="confidence" type="range" min="0" max="40" step="0.5" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}/>
      <label className="checkbox-row"><input type="checkbox" checked={inferUndetected} onChange={(event) => setInferUndetected(event.target.checked)}/><span>Suy luận trang chưa nhận diện chỉ khi mọi trang đủ tin cậy cùng thống nhất một góc xoay.</span></label>
      <p className="hint">Mặc định 14.0 là chế độ bảo thủ: trang trống, lỗi OSD hoặc confidence thấp sẽ không bị xoay. Tối đa 300 trang và 50 MB.</p>
      <p className="hint">Auto Rotate dùng <strong>relative rotation</strong>. Nếu trang đã có rotation metadata, góc sửa được cộng tương đối thay vì ghi đè tuyệt đối.</p>
      <p className="hint">Nếu không có trang nào cần xoay, backend trả lại nguyên byte PDF để tránh làm mất hiệu lực chữ ký số không cần thiết. Khi thực sự thay đổi rotation, chữ ký số hiện có có thể không còn hợp lệ.</p>
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={autoRotate} disabled={!file || busy}>{busy ? 'Đang phân tích và xoay…' : 'Tự động xoay và tải PDF'}</button>
    </section>
  </main>;
}
