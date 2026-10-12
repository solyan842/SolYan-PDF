'use client';

import { ChangeEvent, useState } from 'react';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';

export default function FormsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [values, setValues] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected); setError(''); setFields([]);
    if (!selected) return;
    try {
      const pdf = await PDFDocument.load(await selected.arrayBuffer());
      const form = pdf.getForm();
      const names = form.getFields().map((field) => field.getName());
      setFields(names);
      setValues(names.map((name) => `${name}=`).join('\n'));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đọc được form PDF.'); }
  }

  async function fill() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const form = pdf.getForm();
      const pairs = new Map(values.split(/\r?\n/).map((line) => { const i = line.indexOf('='); return i >= 0 ? [line.slice(0,i).trim(), line.slice(i+1).trim()] : [line.trim(),'']; }));
      for (const field of form.getFields()) {
        const value = pairs.get(field.getName());
        if (value === undefined) continue;
        if (field instanceof PDFTextField) field.setText(value);
        else if (field instanceof PDFCheckBox) value && value !== '0' && value.toLowerCase() !== 'false' ? field.check() : field.uncheck();
        else if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) { if (value) field.select(value); }
      }
      form.updateFieldAppearances();
      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-form-filled.pdf');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể điền form PDF.'); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">AcroForm · Local</div></header>
    <section className="hero compact-hero"><p className="eyebrow">FORMS · PHASE 2</p><h1>Điền Form PDF</h1><p className="subtitle">Đọc các trường AcroForm và điền dữ liệu theo dạng <b>tên_trường=giá_trị</b>.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn PDF có form</span></label></section>
    <section className="workspace form-workspace">
      <p className="hint">{fields.length ? `${fields.length} trường: ${fields.join(', ')}` : 'Chưa phát hiện trường form.'}</p>
      <label className="field"><span>Dữ liệu form</span><textarea value={values} onChange={(e)=>setValues(e.target.value)} /></label>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" disabled={!file || busy} onClick={fill}>{busy ? 'Đang điền…' : 'Xuất PDF đã điền'}</button>
    </section>
  </main>;
}
