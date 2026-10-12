'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';

type PdfItem = { id: string; file: File };

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function MergePage() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!selected.length) return;
    setError('');
    setItems((current) => [...current, ...selected.map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, file }))]);
    event.target.value = '';
  }

  function move(index: number, direction: -1 | 1) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  async function mergePdfs() {
    if (items.length < 2) return;
    setBusy(true); setError('');
    try {
      const output = await PDFDocument.create();
      for (const item of items) {
        const source = await PDFDocument.load(await item.file.arrayBuffer(), { ignoreEncryption: false, updateMetadata: false });
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach((page) => output.addPage(page));
      }
      downloadPdf(await output.save({ useObjectStreams: true }), 'solyan-merged.pdf');
    } catch (cause) {
      setError(`Gộp PDF thất bại: ${cause instanceof Error ? cause.message : 'Không thể gộp các file PDF.'}`);
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Gộp PDF</h1><p className="subtitle">Gộp nhiều file PDF thành một file duy nhất ngay trong trình duyệt.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" multiple onChange={onFilesSelected}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace"><div className="workspace-head"><div><h2>Thứ tự file</h2><p>{items.length} file · {formatBytes(totalSize)}</p></div>{items.length > 0 && <button className="ghost" type="button" onClick={() => setItems([])} disabled={busy}>Xóa tất cả</button>}</div>
    {items.length === 0 ? <div className="empty">Chưa có file. Chọn từ 2 file PDF trở lên để bắt đầu.</div> : <ol className="file-list">{items.map((item,index)=><li key={item.id} className="file-row"><div className="file-index">{index+1}</div><div className="file-meta"><strong title={item.file.name}>{item.file.name}</strong><span>{formatBytes(item.file.size)}</span></div><div className="row-actions"><button type="button" onClick={()=>move(index,-1)} disabled={index===0||busy}>↑</button><button type="button" onClick={()=>move(index,1)} disabled={index===items.length-1||busy}>↓</button><button type="button" onClick={()=>setItems((current)=>current.filter((x)=>x.id!==item.id))} disabled={busy}>×</button></div></li>)}</ol>}
    {error && <div className="error">{error}</div>}<button className="merge-button" type="button" onClick={mergePdfs} disabled={busy||items.length<2}>{busy?'Đang gộp…':'Gộp PDF'}</button></section>
  </main>;
}
