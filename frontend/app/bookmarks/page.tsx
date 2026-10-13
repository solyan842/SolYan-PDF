'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { BookmarkNode, extractPdfBookmarks, setPdfBookmarks } from '../../lib/bookmarks';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

type RemovalResult = { nodes: BookmarkNode[]; removed?: BookmarkNode };

function updateNode(nodes: BookmarkNode[], path: number[], updater: (node: BookmarkNode) => BookmarkNode): BookmarkNode[] {
  const [index, ...rest] = path;
  return nodes.map((node, current) => {
    if (current !== index) return node;
    if (!rest.length) return updater(node);
    return { ...node, children: updateNode(node.children, rest, updater) };
  });
}

function transformSiblings(nodes: BookmarkNode[], parentPath: number[], transform: (siblings: BookmarkNode[]) => BookmarkNode[]): BookmarkNode[] {
  if (!parentPath.length) return transform(nodes);
  const [index, ...rest] = parentPath;
  return nodes.map((node, current) => current === index
    ? { ...node, children: transformSiblings(node.children, rest, transform) }
    : node);
}

function removeNode(nodes: BookmarkNode[], path: number[]): RemovalResult {
  const [index, ...rest] = path;
  const next = [...nodes];
  if (!rest.length) {
    const [removed] = next.splice(index, 1);
    return { nodes: next, removed };
  }
  const childResult = removeNode(next[index].children, rest);
  next[index] = { ...next[index], children: childResult.nodes };
  return { nodes: next, removed: childResult.removed };
}

function insertAfter(nodes: BookmarkNode[], path: number[], node: BookmarkNode): BookmarkNode[] {
  const [index, ...rest] = path;
  const next = [...nodes];
  if (!rest.length) {
    next.splice(index + 1, 0, node);
    return next;
  }
  next[index] = { ...next[index], children: insertAfter(next[index].children, rest, node) };
  return next;
}

function countNodes(nodes: BookmarkNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

export default function BookmarksPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setInfo('');
    setFile(null);
    setBookmarks([]);
    setPageCount(0);
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    try {
      const bytes = await selected.arrayBuffer();
      const document = await PDFDocument.load(bytes);
      const extracted = await extractPdfBookmarks(bytes);
      setFile(selected);
      setPageCount(document.getPageCount());
      setBookmarks(extracted);
      setInfo(extracted.length ? `Đã đọc ${countNodes(extracted)} bookmark từ PDF.` : 'PDF chưa có bookmark. Bạn có thể tạo outline mới.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được bookmark PDF.');
    }
  }

  function addTopLevel() {
    setBookmarks((current) => [...current, { title: `Bookmark ${countNodes(current) + 1}`, pageNumber: 1, children: [] }]);
  }

  function addChild(path: number[]) {
    setBookmarks((current) => updateNode(current, path, (node) => ({
      ...node,
      children: [...node.children, { title: 'Bookmark con', pageNumber: node.pageNumber, children: [] }],
    })));
  }

  function remove(path: number[]) {
    setBookmarks((current) => removeNode(current, path).nodes);
  }

  function move(path: number[], delta: -1 | 1) {
    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];
    setBookmarks((current) => transformSiblings(current, parentPath, (siblings) => {
      const target = index + delta;
      if (target < 0 || target >= siblings.length) return siblings;
      const next = [...siblings];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }));
  }

  function indent(path: number[]) {
    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];
    if (index <= 0) return;
    setBookmarks((current) => transformSiblings(current, parentPath, (siblings) => {
      const next = [...siblings];
      const [node] = next.splice(index, 1);
      const previous = next[index - 1];
      next[index - 1] = { ...previous, children: [...previous.children, node] };
      return next;
    }));
  }

  function outdent(path: number[]) {
    if (path.length < 2) return;
    const parentPath = path.slice(0, -1);
    setBookmarks((current) => {
      const result = removeNode(current, path);
      if (!result.removed) return current;
      return insertAfter(result.nodes, parentPath, result.removed);
    });
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const bytes = await setPdfBookmarks(await file.arrayBuffer(), bookmarks);
      const base = file.name.replace(/\.pdf$/i, '') || 'document';
      downloadPdf(bytes, `${base}-bookmarks.pdf`);
      setInfo(bookmarks.length ? `Đã ghi ${countNodes(bookmarks)} bookmark và tải PDF.` : 'Đã xóa outline/bookmark khỏi PDF và tải file mới.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể ghi bookmark vào PDF.');
    } finally {
      setBusy(false);
    }
  }

  function renderNodes(nodes: BookmarkNode[], parentPath: number[] = [], depth = 0): React.ReactNode {
    return nodes.map((node, index) => {
      const path = [...parentPath, index];
      return <div key={path.join('-')} style={{ marginLeft: depth * 18, marginTop: 10 }}>
        <div className="result-box" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 110px auto', gap: 8, alignItems: 'end' }}>
          <label className="field"><span>Tiêu đề</span><input value={node.title} maxLength={512} onChange={(event) => setBookmarks((current) => updateNode(current, path, (item) => ({ ...item, title: event.target.value })))} /></label>
          <label className="field"><span>Trang</span><input type="number" min={1} max={pageCount || 1} value={node.pageNumber} onChange={(event) => setBookmarks((current) => updateNode(current, path, (item) => ({ ...item, pageNumber: Number(event.target.value) })))} /></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button className="ghost" type="button" onClick={() => move(path, -1)} disabled={index === 0}>↑</button>
            <button className="ghost" type="button" onClick={() => move(path, 1)} disabled={index === nodes.length - 1}>↓</button>
            <button className="ghost" type="button" onClick={() => indent(path)} disabled={index === 0}>→ Cấp</button>
            <button className="ghost" type="button" onClick={() => outdent(path)} disabled={path.length < 2}>← Cấp</button>
            <button className="ghost" type="button" onClick={() => addChild(path)}>+ Con</button>
            <button className="ghost" type="button" onClick={() => remove(path)}>Xóa</button>
          </div>
        </div>
        {node.children.length > 0 && renderNodes(node.children, path, depth + 1)}
      </div>;
    });
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Trên thiết bị · Không upload file</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">OUTLINE · V1.2</p>
      <h1>Bookmark / Mục lục PDF</h1>
      <p className="subtitle">Đọc outline hiện có, thêm mục, tạo cấp con, đổi thứ tự và gán trang đích ngay trong trình duyệt.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <>
        <div className="workspace-head"><div><h2>{countNodes(bookmarks)} bookmark · {pageCount} trang</h2><p>Trang đích ngoài phạm vi sẽ được tự giới hạn về 1-{pageCount} khi xuất.</p></div><button className="ghost" type="button" onClick={addTopLevel}>+ Thêm bookmark</button></div>
        {bookmarks.length ? renderNodes(bookmarks) : <div className="result-box">Chưa có bookmark. Bấm “+ Thêm bookmark” để tạo outline mới.</div>}
        <p className="hint">Đọc tự động hỗ trợ bookmark dùng destination trực tiếp và action GoTo. Destination đặt tên hoặc dạng lạ chưa phân giải được sẽ hiển thị trang 1 thay vì làm hỏng tài liệu.</p>
        <p className="hint"><strong>Lưu ý:</strong> ghi lại outline làm thay đổi PDF và sẽ làm chữ ký số hiện có mất hiệu lực.</p>
        <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>
      </>}
      {info && <div className="result-box">{info}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={save} disabled={!file || busy}>{busy ? 'Đang ghi outline…' : 'Xuất PDF với bookmark'}</button>
    </section>
  </main>;
}
