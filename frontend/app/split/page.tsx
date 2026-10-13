'use client';

import { ChangeEvent, useState } from 'react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { splitByApproxSize, splitByPageCount, SplitPart } from '../../lib/advanced-split';
import { copySelectedPages, parsePages } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
type SplitMode = 'manual' | 'page-count' | 'size';

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

async function zipParts(parts: SplitPart[], prefix = 'solyan-split') {
  const zip = new JSZip();
  parts.forEach((part, index) => zip.file(`${prefix}-${String(index + 1).padStart(3, '0')}.pdf`, part.bytes));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SplitMode>('manual');
  const [groups, setGroups] = useState('1');
  const [pagesPerPart, setPagesPerPart] = useState(5);
  const [targetMb, setTargetMb] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho xử lý local.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
    setResult('');
  }

  async function manualParts(source: PDFDocument): Promise<SplitPart[]> {
    const parts = groups.split(';').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) throw new Error('Hãy nhập ít nhất một nhóm trang.');
    const output: SplitPart[] = [];
    for (const part of parts) {
      const indexes = parsePages(part, source.getPageCount());
      const doc = await copySelectedPages(source, indexes);
      output.push({ indexes, bytes: await doc.save({ useObjectStreams: true }) });
    }
    return output;
  }

  async function split() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const sourceBytes = await file.arrayBuffer();
      let parts: SplitPart[];
      if (mode === 'manual') {
        parts = await manualParts(await PDFDocument.load(sourceBytes));
      } else if (mode === 'page-count') {
        parts = await splitByPageCount(sourceBytes, pagesPerPart);
      } else {
        if (!Number.isFinite(targetMb) || targetMb <= 0 || targetMb > 100) throw new Error('Dung lượng mục tiêu phải lớn hơn 0 và không vượt quá 100 MB.');
        parts = await splitByApproxSize(sourceBytes, Math.round(targetMb * 1024 * 1024));
      }
      const zip = await zipParts(parts);
      downloadBlob(zip, 'solyan-split.zip');
      const pageSummary = parts.map((part) => part.indexes.length).join(', ');
      setResult(`Đã tạo ${parts.length} file PDF trong ZIP · số trang mỗi phần: ${pageSummary}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tách PDF.');
    } finally {
      setBusy(false);
    }
  }

  const invalid = mode === 'page-count'
    ? !Number.isInteger(pagesPerPart) || pagesPerPart < 1
    : mode === 'size'
      ? !Number.isFinite(targetMb) || targetMb <= 0 || targetMb > 100
      : false;

  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
      <section className="hero compact-hero"><p className="eyebrow">CORE PDF · V1.2</p><h1>Tách PDF</h1><p className="subtitle">Tách theo nhóm trang thủ công, số trang mỗi phần hoặc dung lượng mục tiêu best-effort. Kết quả tải về trong một file ZIP.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile} /><span>+ Chọn file PDF</span></label></section>
      <section className="workspace form-workspace">
        <label className="field"><span>Cách tách</span><select value={mode} onChange={(e)=>setMode(e.target.value as SplitMode)}><option value="manual">Nhóm trang thủ công</option><option value="page-count">Theo số trang mỗi phần</option><option value="size">Theo dung lượng mục tiêu</option></select></label>
        {mode === 'manual' && <label className="field"><span>Nhóm trang cần tách</span><input value={groups} onChange={(e) => setGroups(e.target.value)} placeholder="1-3;4-6;7,9" /></label>}
        {mode === 'page-count' && <label className="field"><span>Số trang mỗi phần</span><input type="number" min="1" max="500" step="1" value={pagesPerPart} onChange={(e)=>setPagesPerPart(Number(e.target.value))}/></label>}
        {mode === 'size' && <label className="field"><span>Dung lượng mục tiêu mỗi phần (MB)</span><input type="number" min="0.1" max="100" step="0.1" value={targetMb} onChange={(e)=>setTargetMb(Number(e.target.value))}/></label>}
        {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
        {mode === 'manual' && <p className="hint">Phân cách các phần bằng dấu chấm phẩy, ví dụ: <b>1-3;4-6;7,9</b>.</p>}
        {mode === 'page-count' && <p className="hint">Chế độ này chia tuần tự và chính xác theo số trang. Giới hạn 500 trang nguồn.</p>}
        {mode === 'size' && <p className="hint">Dung lượng là <b>best-effort</b>: mỗi trang được ước lượng độc lập rồi nhóm tuần tự. Shared fonts/images có thể làm kích thước PDF thực tế khác mục tiêu; một trang đơn lẻ lớn hơn mục tiêu vẫn được giữ nguyên trong một phần. Giới hạn 200 trang nguồn.</p>}
        {result && <div className="success">{result}</div>}
        {error && <div className="error">{error}</div>}
        <button className="merge-button" type="button" onClick={split} disabled={!file || busy || invalid}>{busy ? 'Đang tách…' : 'Tách PDF và tải ZIP'}</button>
      </section>
    </main>
  );
}
