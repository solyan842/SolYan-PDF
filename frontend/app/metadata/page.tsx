'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';
import {
  type CustomPdfMetadata,
  clearAllPdfMetadata,
  dateToLocalInput,
  localInputToDate,
  readCustomPdfMetadata,
  readTrappedMetadata,
  removeInfoKey,
  replaceCustomPdfMetadata,
  writeTrappedMetadata,
} from '../../lib/pdf-metadata';

type Meta = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
  trapped: '' | 'True' | 'False' | 'Unknown';
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_CUSTOM_FIELDS = 50;
const emptyMeta: Meta = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  creationDate: '',
  modificationDate: '',
  trapped: '',
};

const STANDARD_FIELDS: Array<{ key: keyof Pick<Meta, 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer'>; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'subject', label: 'Subject' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'creator', label: 'Creator' },
  { key: 'producer', label: 'Producer' },
];

const TWO_COLUMN_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 } as const;

export default function MetadataPage() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta>(emptyMeta);
  const [custom, setCustom] = useState<CustomPdfMetadata[]>([]);
  const [deleteAll, setDeleteAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(null);
    setMeta(emptyMeta);
    setCustom([]);
    setDeleteAll(false);
    setError('');
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }

    try {
      const pdf = await PDFDocument.load(await selected.arrayBuffer(), { updateMetadata: false });
      let creationDate = '';
      let modificationDate = '';
      try { creationDate = dateToLocalInput(pdf.getCreationDate()); } catch {}
      try { modificationDate = dateToLocalInput(pdf.getModificationDate()); } catch {}
      setMeta({
        title: pdf.getTitle() ?? '',
        author: pdf.getAuthor() ?? '',
        subject: pdf.getSubject() ?? '',
        keywords: (pdf.getKeywords() ?? '').toString(),
        creator: pdf.getCreator() ?? '',
        producer: pdf.getProducer() ?? '',
        creationDate,
        modificationDate,
        trapped: readTrappedMetadata(pdf),
      });
      setCustom(readCustomPdfMetadata(pdf));
      setFile(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được metadata.');
      event.target.value = '';
    }
  }

  function update<K extends keyof Meta>(key: K, value: Meta[K]) {
    setMeta((current) => ({ ...current, [key]: value }));
  }

  function updateCustom(index: number, key: keyof CustomPdfMetadata, value: string) {
    setCustom((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }

  function addCustom() {
    if (custom.length >= MAX_CUSTOM_FIELDS) {
      setError(`Tối đa ${MAX_CUSTOM_FIELDS} custom metadata fields.`);
      return;
    }
    setCustom((current) => [...current, { key: '', value: '' }]);
    setError('');
  }

  function removeCustom(index: number) {
    setCustom((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });

      if (deleteAll) {
        clearAllPdfMetadata(pdf);
        downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-metadata-removed.pdf');
        return;
      }

      if (meta.title) pdf.setTitle(meta.title); else removeInfoKey(pdf, 'Title');
      if (meta.author) pdf.setAuthor(meta.author); else removeInfoKey(pdf, 'Author');
      if (meta.subject) pdf.setSubject(meta.subject); else removeInfoKey(pdf, 'Subject');
      if (meta.creator) pdf.setCreator(meta.creator); else removeInfoKey(pdf, 'Creator');
      if (meta.producer) pdf.setProducer(meta.producer); else removeInfoKey(pdf, 'Producer');

      const keywords = meta.keywords.split(',').map((value) => value.trim()).filter(Boolean);
      if (keywords.length) pdf.setKeywords(keywords); else removeInfoKey(pdf, 'Keywords');

      const creationDate = localInputToDate(meta.creationDate, 'Creation date');
      const modificationDate = localInputToDate(meta.modificationDate, 'Modification date');
      if (creationDate) pdf.setCreationDate(creationDate); else removeInfoKey(pdf, 'CreationDate');
      if (modificationDate) pdf.setModificationDate(modificationDate); else removeInfoKey(pdf, 'ModDate');

      writeTrappedMetadata(pdf, meta.trapped);
      replaceCustomPdfMetadata(pdf, custom);
      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-metadata.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu metadata.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · Document Info · XMP removal</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">V1.5 · METADATA</p>
      <h1>Metadata PDF</h1>
      <p className="subtitle">Xem/chỉnh sửa trường chuẩn, ngày tạo/sửa, Trapped và custom Document Information; hoặc xóa toàn bộ metadata ở chế độ riêng.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      <label className="field"><span><input type="checkbox" checked={deleteAll} onChange={(event)=>setDeleteAll(event.target.checked)} disabled={!file}/> Xóa toàn bộ metadata</span><small>Xóa Document Information, catalog XMP /Metadata và /PieceInfo. Đây là thao tác destructive riêng.</small></label>

      <fieldset disabled={!file || deleteAll} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16 }}>
        {STANDARD_FIELDS.map(({ key, label })=><label className="field" key={key}><span>{label}</span><input value={meta[key]} onChange={(event)=>update(key, event.target.value)} /></label>)}

        <div style={TWO_COLUMN_STYLE}>
          <label className="field"><span>Creation date</span><input type="datetime-local" value={meta.creationDate} onChange={(event)=>update('creationDate', event.target.value)}/></label>
          <label className="field"><span>Modification date</span><input type="datetime-local" value={meta.modificationDate} onChange={(event)=>update('modificationDate', event.target.value)}/></label>
        </div>

        <label className="field"><span>Trapped</span><select value={meta.trapped} onChange={(event)=>update('trapped', event.target.value as Meta['trapped'])}><option value="">Không đặt</option><option value="Unknown">Unknown</option><option value="True">True</option><option value="False">False</option></select></label>

        <div className="result-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><strong>Custom Document Information</strong><button type="button" className="secondary-button" onClick={addCustom}>+ Thêm field</button></div>
          <p className="hint" style={{ marginBottom: 12 }}>Tối đa 50 field. Key: A-Z/a-z/0-9 và <code>._:-</code>, tối đa 64 ký tự; value tối đa 4096 ký tự và hỗ trợ Unicode.</p>
          {custom.length === 0 && <p className="hint">Chưa có custom metadata.</p>}
          {custom.map((row, index)=><div key={`${index}-${row.key}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 0.8fr) minmax(220px, 1.5fr) auto', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input aria-label={`Custom metadata key ${index + 1}`} value={row.key} maxLength={64} placeholder="Department" onChange={(event)=>updateCustom(index, 'key', event.target.value)}/>
            <input aria-label={`Custom metadata value ${index + 1}`} value={row.value} maxLength={4096} placeholder="Engineering" onChange={(event)=>updateCustom(index, 'value', event.target.value)}/>
            <button type="button" className="secondary-button" onClick={()=>removeCustom(index)}>Xóa</button>
          </div>)}
        </div>
      </fieldset>

      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Chế độ chỉnh sửa không tự đồng bộ một XMP packet tùy biến với Document Information. Nếu cần loại bỏ XMP/history, dùng “Xóa toàn bộ metadata”; công cụ Sanitization vẫn là lựa chọn riêng cho quy trình làm sạch rộng hơn.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={save} disabled={!file || busy}>{busy ? 'Đang xử lý…' : deleteAll ? 'Xóa toàn bộ metadata' : 'Lưu metadata'}</button>
    </section>
  </main>;
}
