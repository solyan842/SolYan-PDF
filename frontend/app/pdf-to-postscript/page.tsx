'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
type OutputFormat = 'ps' | 'eps';

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

export default function PdfToPostScriptPage() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<OutputFormat>('ps');
  const [level, setLevel] = useState<2 | 3>(3);
  const [password, setPassword] = useState('');
  const [firstPage, setFirstPage] = useState('');
  const [lastPage, setLastPage] = useState('');
  const [epsPage, setEpsPage] = useState('1');
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
      const body = new FormData();
      body.append('file', file);
      body.append('output_format', format);
      body.append('level', String(level));
      if (password) body.append('password', password);

      if (format === 'eps') {
        const page = parseOptionalPage(epsPage, 'Trang EPS') ?? 1;
        body.append('first_page', String(page));
        body.append('last_page', String(page));
      } else {
        const first = parseOptionalPage(firstPage, 'Trang đầu');
        const last = parseOptionalPage(lastPage, 'Trang cuối');
        if (first !== null && last !== null && first > last) {
          throw new Error('Trang đầu không được lớn hơn trang cuối.');
        }
        if (first !== null) body.append('first_page', String(first));
        if (last !== null) body.append('last_page', String(last));
      }

      const response = await fetch(`${API_BASE}/pdf/to-postscript`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const responseFormat = response.headers.get('X-SolYan-PostScript-Format') === 'eps' ? 'eps' : 'ps';
      const responseLevel = response.headers.get('X-SolYan-PostScript-Level') ?? String(level);
      downloadBlob(blob, `solyan-pdf.${responseFormat}`);
      setResult(`Đã tạo ${responseFormat.toUpperCase()} Level ${responseLevel} (${Math.max(1, Math.round(blob.size / 1024))} KB).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang PostScript/EPS.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Poppler · pdftops</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">CONVERT · V1.4</p>
      <h1>PDF → PostScript / EPS</h1>
      <p className="subtitle">Chuyển PDF sang PostScript nhiều trang hoặc EPS một trang bằng Poppler đã có sẵn trong backend, không thêm Ghostscript/runtime mới.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <div className="form-grid two-col">
        <label className="field"><span>Định dạng</span><select value={format} onChange={(e)=>setFormat(e.target.value as OutputFormat)}><option value="ps">PS · PostScript nhiều trang</option><option value="eps">EPS · Encapsulated PostScript một trang</option></select></label>
        <label className="field"><span>PostScript Level</span><select value={level} onChange={(e)=>setLevel(Number(e.target.value) as 2 | 3)}><option value={3}>Level 3 · mặc định</option><option value={2}>Level 2 · tương thích cũ hơn</option></select></label>
      </div>
      <label className="field"><span>Mật khẩu PDF (nếu có)</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} maxLength={128} placeholder="Để trống nếu PDF không mã hóa" /></label>
      {format === 'eps' ? <label className="field"><span>Trang xuất EPS</span><input type="number" min="1" max="10000" value={epsPage} onChange={(e)=>setEpsPage(e.target.value)} /></label> : <div className="form-grid two-col">
        <label className="field"><span>Trang đầu</span><input type="number" min="1" max="10000" value={firstPage} onChange={(e)=>setFirstPage(e.target.value)} placeholder="1" /></label>
        <label className="field"><span>Trang cuối</span><input type="number" min="1" max="10000" value={lastPage} onChange={(e)=>setLastPage(e.target.value)} placeholder="Tới hết" /></label>
      </div>}
      <p className="hint"><strong>PS:</strong> giữ nhiều trang và kích thước trang gốc. <strong>EPS:</strong> theo đặc tả chỉ chứa một trang nên phải chọn đúng một trang. Level 3 phù hợp font CID và PDF hiện đại hơn; Level 2 ưu tiên thiết bị cũ.</p>
      <div className="error"><strong>Lưu ý bảo mật:</strong> PostScript là một ngôn ngữ mô tả trang có thể được interpreter thực thi. SolYan chỉ sinh PS/EPS từ PDF bằng Poppler và không chạy file PS/EPS tải lên; chỉ mở/diễn giải đầu ra bằng phần mềm tin cậy, sandbox phù hợp.</div>
      <p className="hint"><strong>Giới hạn:</strong> 100 MB PDF đầu vào · tối đa 250 MB PS/EPS đầu ra · page index tối đa 10000 · timeout converter 180 giây.</p>
      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : `Tạo ${format.toUpperCase()} và tải xuống`}</button>
    </section>
  </main>;
}
