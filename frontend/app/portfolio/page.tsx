'use client';

import { ChangeEvent, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILES = 50;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

async function errorMessage(response: Response) {
  try {
    const payload = await response.json();
    return payload.detail ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

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

export default function PortfolioPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setError('');
    setResult('');

    if (selected.length > MAX_FILES) {
      setFiles([]);
      setError(`Chỉ được chọn tối đa ${MAX_FILES} file.`);
      event.target.value = '';
      return;
    }

    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      setFiles([]);
      setError(`${oversized.name} vượt giới hạn 25 MB mỗi file.`);
      event.target.value = '';
      return;
    }

    const total = selected.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TOTAL_SIZE) {
      setFiles([]);
      setError('Tổng dung lượng các file vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }

    setFiles(selected);
  }

  async function createPortfolio() {
    if (!files.length) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      files.forEach((file) => body.append('files', file));
      const response = await fetch(`${API_BASE}/pdf/portfolio`, { method: 'POST', body });
      if (!response.ok) throw new Error(await errorMessage(response));
      const count = response.headers.get('X-SolYan-Portfolio-Files') ?? String(files.length);
      downloadBlob(await response.blob(), 'solyan-portfolio.pdf');
      setResult(`Đã tạo PDF Portfolio chứa ${count} file và tải xuống.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo PDF Portfolio.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf · PDF Collection</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">PORTFOLIO · V1.5</p>
      <h1>Tạo PDF Portfolio</h1>
      <p className="subtitle">Đóng gói nhiều file vào một PDF Collection mà vẫn giữ từng file độc lập, thay vì gộp hoặc chuyển đổi nội dung của chúng.</p>
      <label className="picker"><input type="file" multiple onChange={onFiles}/><span>+ Chọn các file</span></label>
    </section>

    <section className="workspace form-workspace">
      {files.length > 0 && <>
        <div className="result-box"><strong>{files.length} file · {formatBytes(totalBytes)}</strong><p style={{ marginBottom: 0 }}>Thứ tự dưới đây là thứ tự file được đưa vào portfolio.</p></div>
        <div style={{ display: 'grid', gap: 8 }}>
          {files.map((file, index) => <div className="result-box" style={{ margin: 0 }} key={`${file.name}-${file.size}-${index}`}><strong>{index + 1}. {file.name}</strong><p style={{ marginBottom: 0 }}>{formatBytes(file.size)} · {file.type || 'application/octet-stream'}</p></div>)}
        </div>
      </>}

      <button className="merge-button" type="button" onClick={createPortfolio} disabled={!files.length || busy}>{busy ? 'Đang tạo Portfolio…' : 'Tạo PDF Portfolio'}</button>
      <p className="hint">Giới hạn: tối đa 50 file, 25 MB mỗi file, 100 MB tổng. SolYan tạo cấu trúc PDF Collection chuẩn với embedded files; không sửa byte nội dung của từng file nguồn trước khi nhúng.</p>
      <p className="hint">Khả năng hiển thị Portfolio phụ thuộc trình đọc PDF. Reader hỗ trợ PDF Collection sẽ mở danh sách file đính kèm; reader không hỗ trợ có thể chỉ hiện vỏ PDF rỗng/không có trang nhưng các embedded files vẫn nằm trong tài liệu.</p>
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  </main>;
}
