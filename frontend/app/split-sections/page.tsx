'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  createMergedSectionPdf,
  createSectionParts,
  MAX_SECTION_GRID_SIDE,
  MAX_SECTION_OUTPUT_PAGES,
  MAX_SECTION_SOURCE_PAGES,
  resolveSectionPages,
  SectionSplitMode,
} from '../../lib/split-sections';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

type OutputMode = 'merged' | 'zip';

const SPLIT_MODES: Array<{ value: SectionSplitMode; label: string }> = [
  { value: 'all', label: 'Tất cả trang' },
  { value: 'custom', label: 'Trang tùy chọn' },
  { value: 'except-first', label: 'Trừ trang đầu' },
  { value: 'except-last', label: 'Trừ trang cuối' },
  { value: 'except-first-last', label: 'Trừ trang đầu và cuối' },
];

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

export default function SplitSectionsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [columns, setColumns] = useState(2);
  const [rows, setRows] = useState(2);
  const [mode, setMode] = useState<SectionSplitMode>('all');
  const [customPages, setCustomPages] = useState('');
  const [outputMode, setOutputMode] = useState<OutputMode>('merged');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const preview = useMemo(() => {
    if (!pageCount) return { splitPages: 0, outputPages: 0, error: '' };
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns > MAX_SECTION_GRID_SIDE || rows > MAX_SECTION_GRID_SIDE) {
      return { splitPages: 0, outputPages: 0, error: `Số hàng/cột phải từ 1 đến ${MAX_SECTION_GRID_SIDE}.` };
    }
    try {
      const selected = resolveSectionPages(pageCount, mode, customPages);
      const outputPages = pageCount - selected.size + selected.size * columns * rows;
      return {
        splitPages: selected.size,
        outputPages,
        error: outputPages > MAX_SECTION_OUTPUT_PAGES ? `Cấu hình tạo ${outputPages} phần, vượt giới hạn ${MAX_SECTION_OUTPUT_PAGES}.` : '',
      };
    } catch (cause) {
      return { splitPages: 0, outputPages: 0, error: cause instanceof Error ? cause.message : 'Cấu hình trang không hợp lệ.' };
    }
  }, [pageCount, columns, rows, mode, customPages]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(null);
    setPageCount(0);
    setError('');
    setResult('');
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError('PDF vượt giới hạn 100 MB cho xử lý local.');
      event.target.value = '';
      return;
    }
    try {
      const document = await PDFDocument.load(await selected.arrayBuffer());
      if (document.getPageCount() > MAX_SECTION_SOURCE_PAGES) {
        throw new Error(`Tách section giới hạn ${MAX_SECTION_SOURCE_PAGES} trang nguồn.`);
      }
      setFile(selected);
      setPageCount(document.getPageCount());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được PDF.');
    }
  }

  async function splitSections() {
    if (!file || preview.error) return;
    setBusy(true);
    setError('');
    setResult('');
    const options = { columns, rows, mode, customPages };
    const base = file.name.replace(/\.pdf$/i, '') || 'document';
    try {
      const sourceBytes = await file.arrayBuffer();
      if (outputMode === 'merged') {
        const bytes = await createMergedSectionPdf(sourceBytes, options);
        downloadPdf(bytes, `${base}-sections.pdf`);
        setResult(`Đã tạo 1 PDF gồm ${preview.outputPages} trang/phần.`);
      } else {
        const parts = await createSectionParts(sourceBytes, options);
        const zip = new JSZip();
        parts.forEach((part) => zip.file(part.filename, part.bytes));
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        downloadBlob(blob, `${base}-sections.zip`);
        setResult(`Đã tạo ${parts.length} PDF riêng trong ZIP.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chia PDF thành section.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Trên thiết bị · Không upload file</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">SPLIT · V1.2</p>
      <h1>Chia trang PDF thành Section</h1>
      <p className="subtitle">Chia mỗi trang được chọn thành lưới hàng × cột, giữ nội dung vector/text và xuất thành một PDF hoặc nhiều file trong ZIP.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <label className="field"><span>Số cột</span><input type="number" min="1" max={MAX_SECTION_GRID_SIDE} step="1" value={columns} onChange={(event) => setColumns(Number(event.target.value))}/></label>
        <label className="field"><span>Số hàng</span><input type="number" min="1" max={MAX_SECTION_GRID_SIDE} step="1" value={rows} onChange={(event) => setRows(Number(event.target.value))}/></label>
        <label className="field"><span>Trang cần chia</span><select value={mode} onChange={(event) => setMode(event.target.value as SectionSplitMode)}>{SPLIT_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="field"><span>Đầu ra</span><select value={outputMode} onChange={(event) => setOutputMode(event.target.value as OutputMode)}><option value="merged">Gộp thành một PDF</option><option value="zip">Mỗi phần một PDF · ZIP</option></select></label>
      </div>
      {mode === 'custom' && <label className="field"><span>Trang tùy chọn</span><input type="text" value={customPages} onChange={(event) => setCustomPages(event.target.value)} placeholder="Ví dụ: 1,3-5,8"/></label>}
      {file && <div className="result-box"><strong>Preview</strong><p>{pageCount} trang nguồn · chia {preview.splitPages} trang theo lưới {columns}×{rows} · đầu ra <strong>{preview.outputPages || 0} phần/trang</strong>.</p><p>Section đi theo cột từ trái sang phải; trong mỗi cột đi từ trên xuống dưới. Trang không được chọn vẫn giữ nguyên như một phần.</p></div>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn: 100 MB, {MAX_SECTION_SOURCE_PAGES} trang nguồn, lưới tối đa {MAX_SECTION_GRID_SIDE}×{MAX_SECTION_GRID_SIDE} và {MAX_SECTION_OUTPUT_PAGES} phần đầu ra. CropBox/rotation được chuẩn hóa trước khi chia.</p>
      <p className="hint"><strong>Lưu ý:</strong> công cụ dựng lại trang từ nội dung hiển thị; form/annotation tương tác không được giữ như điều khiển tương tác và mọi chữ ký số hiện có sẽ không còn hợp lệ sau khi thay đổi PDF.</p>
      {preview.error && file && <div className="error">{preview.error}</div>}
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={splitSections} disabled={!file || busy || Boolean(preview.error) || preview.outputPages < 1}>{busy ? 'Đang chia section…' : outputMode === 'merged' ? 'Chia section và tải PDF' : 'Chia section và tải ZIP'}</button>
    </section>
  </main>;
}
