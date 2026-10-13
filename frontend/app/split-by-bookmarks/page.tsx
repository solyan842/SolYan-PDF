'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { BookmarkNode, extractPdfBookmarks } from '../../lib/bookmarks';
import { planBookmarkChapters, splitPdfByBookmarks } from '../../lib/chapter-split';

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

function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countBookmarks(node.children), 0);
}

function maxBookmarkDepth(nodes: BookmarkNode[], depth = 0): number {
  let max = depth;
  for (const node of nodes) {
    if (node.children.length) max = Math.max(max, maxBookmarkDepth(node.children, depth + 1));
  }
  return max;
}

export default function SplitByBookmarksPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [depth, setDepth] = useState(0);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const maxDepth = maxBookmarkDepth(bookmarks);
  const preview = useMemo(() => {
    if (!bookmarks.length || !pageCount) return [];
    try {
      return planBookmarkChapters(bookmarks, pageCount, Math.min(depth, maxDepth), allowDuplicates);
    } catch {
      return [];
    }
  }, [bookmarks, pageCount, depth, maxDepth, allowDuplicates]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(null);
    setBookmarks([]);
    setPageCount(0);
    setDepth(0);
    setError('');
    setResult('');
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError('PDF vượt giới hạn 100 MB cho xử lý local.');
      event.target.value = '';
      return;
    }
    try {
      const bytes = await selected.arrayBuffer();
      const document = await PDFDocument.load(bytes);
      const extracted = await extractPdfBookmarks(bytes);
      if (!extracted.length) throw new Error('PDF không có bookmark/outline để tách theo chương.');
      setFile(selected);
      setPageCount(document.getPageCount());
      setBookmarks(extracted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được outline PDF.');
    }
  }

  async function split() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const parts = await splitPdfByBookmarks(await file.arrayBuffer(), depth, allowDuplicates);
      const zip = new JSZip();
      parts.forEach((part) => zip.file(part.filename, part.bytes));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const base = file.name.replace(/\.pdf$/i, '') || 'document';
      downloadBlob(blob, `${base}-chapters.zip`);
      setResult(`Đã tạo ${parts.length} chapter trong ZIP.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tách PDF theo bookmark.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Trên thiết bị · Không upload file</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">SPLIT · V1.2</p>
      <h1>Tách PDF theo Bookmark / Chương</h1>
      <p className="subtitle">Dùng outline của PDF để tự chia tài liệu thành chapter và tải toàn bộ kết quả trong một file ZIP.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <>
        <div className="workspace-head"><div><h2>{countBookmarks(bookmarks)} bookmark · {pageCount} trang</h2><p>Preview đang tạo {preview.length} chapter.</p></div></div>
        <label className="field"><span>Độ sâu bookmark</span><select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>{Array.from({ length: maxDepth + 1 }, (_, value) => <option key={value} value={value}>{value === 0 ? '0 — chỉ bookmark gốc' : `${value} — gồm đến cấp ${value}`}</option>)}</select></label>
        <label className="field"><span>Bookmark trùng trang</span><select value={allowDuplicates ? 'keep' : 'merge'} onChange={(event) => setAllowDuplicates(event.target.value === 'keep')}><option value="merge">Gộp thành một chapter</option><option value="keep">Giữ riêng từng bookmark</option></select></label>
        <p className="hint">Chapter được sắp theo thứ tự trang vật lý. Mỗi chapter chạy từ trang bookmark đến ngay trước bookmark kế tiếp; chapter cuối chạy đến hết tài liệu.</p>
        <div className="result-box">
          <strong>Preview chapter</strong>
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {preview.slice(0, 30).map((chapter, index) => <div key={`${chapter.startPage}-${chapter.title}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{String(index + 1).padStart(2, '0')}. {chapter.title}</span><span>Trang {chapter.startPage}{chapter.endPage !== chapter.startPage ? `–${chapter.endPage}` : ''}</span></div>)}
            {preview.length > 30 && <div>… và {preview.length - 30} chapter khác</div>}
          </div>
        </div>
        <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>
        <p className="hint"><strong>Lưu ý:</strong> file chapter được tạo bằng cách copy trang sang PDF mới; form/annotation tương tác và outline gốc không được cam kết giữ nguyên trong từng file con.</p>
      </>}
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={split} disabled={!file || busy || !preview.length}>{busy ? 'Đang tách chapter…' : 'Tách theo bookmark và tải ZIP'}</button>
    </section>
  </main>;
}
