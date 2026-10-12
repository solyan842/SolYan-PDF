'use client';

import { ChangeEvent, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
type Mode = 'text' | 'structured' | 'xlsx';

type OcrResponse = {
  mode?: string;
  text?: string;
  markdown?: string;
  pages?: unknown[];
};

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  downloadBlob(blob, filename);
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

function responseFilename(header: string | null, fallback: string) {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try { return decodeURIComponent(utf8[1].trim()); } catch { return utf8[1].trim(); }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain?.[1]?.trim() || fallback;
}

export default function OcrPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OcrResponse | null>(null);
  const [downloadInfo, setDownloadInfo] = useState('');

  const primaryOutput = useMemo(() => {
    if (!result) return '';
    if (mode === 'structured' && result.markdown) return result.markdown;
    if (result.text) return result.text;
    return JSON.stringify(result.pages ?? [], null, 2);
  }, [mode, result]);

  function resetOutput() {
    setError('');
    setResult(null);
    setDownloadInfo('');
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    resetOutput();
  }

  function onMode(nextMode: Mode) {
    setMode(nextMode);
    resetOutput();
  }

  async function runOcr() {
    if (!file) return;
    setBusy(true);
    resetOutput();
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${API_BASE}/ocr/${mode}`, { method: 'POST', body });

      if (mode === 'xlsx') {
        if (!response.ok) {
          let message = `HTTP ${response.status}`;
          try {
            const payload = await response.json();
            message = payload.detail ?? message;
          } catch {
            const text = await response.text();
            if (text) message = text;
          }
          throw new Error(message);
        }
        const blob = await response.blob();
        const filename = responseFilename(response.headers.get('content-disposition'), 'solyan-ocr-tables.xlsx');
        downloadBlob(blob, filename);
        const pages = response.headers.get('x-solyan-ocr-pages');
        const workbooks = response.headers.get('x-solyan-ocr-table-workbooks');
        setDownloadInfo(`Đã tạo ${filename}${pages ? ` · ${pages} trang` : ''}${workbooks ? ` · ${workbooks} bảng` : ''}.`);
        return;
      }

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? `HTTP ${response.status}`);
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể OCR tài liệu.');
    } finally {
      setBusy(false);
    }
  }

  const actionLabel = busy
    ? mode === 'xlsx' ? 'Đang tạo Excel…' : 'Đang nhận dạng…'
    : mode === 'text' ? 'Nhận dạng văn bản'
      : mode === 'structured' ? 'Phân tích tài liệu'
        : 'Tạo Excel từ bảng scan';

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">PaddleOCR service</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">OCR · PHASE 3</p>
      <h1>OCR tài liệu</h1>
      <p className="subtitle">Nhận dạng ảnh hoặc PDF scan. PP-StructureV3 có thể giữ layout, bảng và reading order, hoặc xuất trực tiếp các bảng nhận dạng thành file Excel.</p>
      <label className="picker"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff,image/bmp,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp" onChange={onFile}/><span>+ Chọn ảnh hoặc PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Chế độ</span><select value={mode} onChange={(e)=>onMode(e.target.value as Mode)}><option value="text">OCR văn bản · PP-OCRv6</option><option value="structured">Phân tích cấu trúc · PP-StructureV3</option><option value="xlsx">Bảng scan → Excel (.xlsx) · PP-StructureV3</option></select></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      <p className="hint">Lần chạy đầu có thể cần tải model trong OCR container. Giới hạn mặc định: 50 MB/file. Chế độ Excel tạo một workbook và tách từng bảng nhận dạng thành worksheet riêng.</p>
      {error && <div className="error">{error}</div>}
      {downloadInfo && <p className="selected-file">{downloadInfo}</p>}
      <button className="merge-button" type="button" onClick={runOcr} disabled={!file || busy}>{actionLabel}</button>
    </section>

    {result && <section className="workspace network-output">
      <div className="workspace-head"><div><h2>Kết quả</h2><p>{result.pages?.length ?? 0} trang/kết quả</p></div><div className="inline-controls"><button className="ghost" type="button" onClick={()=>downloadText(primaryOutput, mode === 'structured' ? 'solyan-ocr.md' : 'solyan-ocr.txt', 'text/plain;charset=utf-8')}>TXT/MD</button><button className="ghost" type="button" onClick={()=>downloadText(JSON.stringify(result.pages ?? [], null, 2), 'solyan-ocr.json', 'application/json')}>JSON</button></div></div>
      <pre>{primaryOutput || 'Không tìm thấy nội dung văn bản.'}</pre>
    </section>}
  </main>;
}
