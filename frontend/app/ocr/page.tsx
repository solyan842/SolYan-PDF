'use client';

import { ChangeEvent, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
type Mode = 'text' | 'structured';

type OcrResponse = {
  mode?: string;
  text?: string;
  markdown?: string;
  pages?: unknown[];
};

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function OcrPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OcrResponse | null>(null);

  const primaryOutput = useMemo(() => {
    if (!result) return '';
    if (mode === 'structured' && result.markdown) return result.markdown;
    if (result.text) return result.text;
    return JSON.stringify(result.pages ?? [], null, 2);
  }, [mode, result]);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError('');
    setResult(null);
  }

  async function runOcr() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE}/ocr/${mode}`, { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? `HTTP ${response.status}`);
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể OCR tài liệu.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">PaddleOCR service</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">OCR · PHASE 3</p>
      <h1>OCR tài liệu</h1>
      <p className="subtitle">Nhận dạng ảnh hoặc PDF scan. Chế độ cấu trúc dùng PP-StructureV3 để giữ layout, bảng và reading order tốt hơn.</p>
      <label className="picker"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff,image/bmp,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp" onChange={onFile}/><span>+ Chọn ảnh hoặc PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Chế độ</span><select value={mode} onChange={(e)=>setMode(e.target.value as Mode)}><option value="text">OCR văn bản · PP-OCRv6</option><option value="structured">Phân tích cấu trúc · PP-StructureV3</option></select></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      <p className="hint">Lần chạy đầu có thể cần tải model trong OCR container. Giới hạn mặc định: 50 MB/file.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={runOcr} disabled={!file || busy}>{busy ? 'Đang nhận dạng…' : mode === 'text' ? 'Nhận dạng văn bản' : 'Phân tích tài liệu'}</button>
    </section>

    {result && <section className="workspace network-output">
      <div className="workspace-head"><div><h2>Kết quả</h2><p>{result.pages?.length ?? 0} trang/kết quả</p></div><div className="inline-controls"><button className="ghost" type="button" onClick={()=>downloadText(primaryOutput, mode === 'structured' ? 'solyan-ocr.md' : 'solyan-ocr.txt', 'text/plain;charset=utf-8')}>TXT/MD</button><button className="ghost" type="button" onClick={()=>downloadText(JSON.stringify(result.pages ?? [], null, 2), 'solyan-ocr.json', 'application/json')}>JSON</button></div></div>
      <pre>{primaryOutput || 'Không tìm thấy nội dung văn bản.'}</pre>
    </section>}
  </main>;
}
