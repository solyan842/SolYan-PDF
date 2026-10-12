'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';

type Meta = { title: string; author: string; subject: string; keywords: string; creator: string; producer: string };
const emptyMeta: Meta = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };

export default function MetadataPage() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected); setError('');
    if (!selected) { setMeta(emptyMeta); return; }
    try {
      const pdf = await PDFDocument.load(await selected.arrayBuffer(), { updateMetadata: false });
      setMeta({
        title: pdf.getTitle() ?? '',
        author: pdf.getAuthor() ?? '',
        subject: pdf.getSubject() ?? '',
        keywords: (pdf.getKeywords() ?? '').toString(),
        creator: pdf.getCreator() ?? '',
        producer: pdf.getProducer() ?? '',
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đọc được metadata.'); }
  }

  function update<K extends keyof Meta>(key: K, value: Meta[K]) { setMeta((current) => ({ ...current, [key]: value })); }

  async function save() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      pdf.setTitle(meta.title); pdf.setAuthor(meta.author); pdf.setSubject(meta.subject);
      pdf.setKeywords(meta.keywords.split(',').map((value) => value.trim()).filter(Boolean));
      pdf.setCreator(meta.creator); pdf.setProducer(meta.producer);
      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-metadata.pdf');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu metadata.'); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · Không upload file</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · PHASE 1</p><h1>Metadata PDF</h1><p className="subtitle">Xem và chỉnh sửa title, author, subject, keywords, creator và producer.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      {(['title','author','subject','keywords','creator','producer'] as (keyof Meta)[]).map((key)=><label className="field" key={key}><span>{key[0].toUpperCase()+key.slice(1)}</span><input value={meta[key]} onChange={(e)=>update(key,e.target.value)} disabled={!file}/></label>)}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={save} disabled={!file || busy}>{busy ? 'Đang lưu…' : 'Lưu metadata'}</button>
    </section>
  </main>;
}
