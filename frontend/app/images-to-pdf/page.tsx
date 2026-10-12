'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';

type ImageItem = { id: string; file: File };

export default function ImagesToPdfPage() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => /image\/(png|jpeg)/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name));
    setItems((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
    event.target.value = '';
    setError('');
  }

  function move(index: number, delta: -1 | 1) {
    setItems((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  async function createPdf() {
    if (!items.length) return;
    setBusy(true); setError('');
    try {
      const pdf = await PDFDocument.create();
      for (const item of items) {
        const bytes = await item.file.arrayBuffer();
        const image = item.file.type === 'image/png' || item.file.name.toLowerCase().endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const size = image.scale(1);
        const maxSide = 14400;
        const ratio = Math.min(1, maxSide / Math.max(size.width, size.height));
        const width = size.width * ratio;
        const height = size.height * ratio;
        const page = pdf.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
      }
      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-images.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo PDF từ ảnh.');
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Không upload ảnh</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CONVERT · PHASE 4</p><h1>Ảnh → PDF</h1><p className="subtitle">Ghép nhiều ảnh PNG/JPG thành một PDF, giữ thứ tự bạn chọn và xử lý hoàn toàn trong trình duyệt.</p><label className="picker"><input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple onChange={onFiles}/><span>+ Chọn ảnh</span></label></section>
    <section className="workspace">
      <div className="workspace-head"><div><h2>Thứ tự ảnh</h2><p>{items.length} ảnh</p></div>{items.length > 0 && <button className="ghost" type="button" onClick={()=>setItems([])} disabled={busy}>Xóa tất cả</button>}</div>
      {items.length === 0 ? <div className="empty">Chưa có ảnh.</div> : <ol className="file-list">{items.map((item,index)=><li className="file-row" key={item.id}><div className="file-index">{index+1}</div><div className="file-meta"><strong>{item.file.name}</strong><span>{(item.file.size/1024).toFixed(0)} KB</span></div><div className="row-actions"><button onClick={()=>move(index,-1)} disabled={index===0||busy}>↑</button><button onClick={()=>move(index,1)} disabled={index===items.length-1||busy}>↓</button><button onClick={()=>setItems((current)=>current.filter((x)=>x.id!==item.id))} disabled={busy}>×</button></div></li>)}</ol>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={createPdf} disabled={!items.length || busy}>{busy ? 'Đang tạo PDF…' : 'Tạo PDF'}</button>
    </section>
  </main>;
}
