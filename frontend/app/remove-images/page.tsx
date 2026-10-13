'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export default function RemoveImagesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setResult('');
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function removeImages() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE}/pdf/remove-images`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          message = payload.detail ?? message;
        } catch {}
        throw new Error(message);
      }

      const removed = Number(response.headers.get('X-SolYan-Images-Removed') ?? '0');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'solyan-images-removed.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setResult(removed > 0 ? `Đã xóa ${removed} Image XObject resource và tải PDF kết quả.` : 'Không tìm thấy Image XObject cần xóa; đã tải PDF đã được qpdf rewrite/kiểm tra.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xóa ảnh khỏi PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf JSON · V1.2</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">REMOVE · IMAGE XOBJECT · V1.2</p>
      <h1>Xóa ảnh nhúng khỏi PDF</h1>
      <p className="subtitle">Loại Image XObject khỏi resource của từng trang và Form XObject lồng nhau, trong khi giữ nguyên content stream, text và vector.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn: 100 MB, tối đa 2.000 trang, 10.000 nút page tree và 20.000 resource dictionaries. Công cụ xử lý resource kế thừa và Form XObject lồng nhau mà không rasterize trang.</p>
      <p className="hint"><strong>Boundary:</strong> công cụ này xóa ảnh dạng PDF Image XObject. Inline image viết trực tiếp trong content stream bằng <code>BI … ID … EI</code> chưa nằm trong phạm vi V1.2 này.</p>
      <p className="hint">Thay đổi cấu trúc PDF sẽ làm chữ ký số hiện có không còn hợp lệ. Nếu chỉ muốn lấy ảnh ra mà không sửa PDF, dùng <a href="/extract-images">Trích xuất ảnh nhúng</a>.</p>
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={removeImages} disabled={!file || busy}>{busy ? 'Đang xóa ảnh…' : 'Xóa ảnh và tải PDF'}</button>
    </section>
  </main>;
}
