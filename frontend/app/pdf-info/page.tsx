'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type TableResult = { count: number; rows: string[]; truncated: boolean };
type Report = {
  file: { name: string; bytes: number; sha256: string };
  document: Record<string, string>;
  metadata: Record<string, string>;
  structure: {
    reachableObjects: number;
    dictionaries: number;
    streams: number;
    pages: number;
    fonts: number;
    images: number;
    formXObjects: number;
    formFields: number;
    signatureFields: number;
    embeddedFiles: number;
    optionalContentGroups: number;
    metadataStreams: number;
    outlines: number;
    xfaEntries: number;
    javascriptActions: number;
    activeAnnotations: number;
    annotationTypes: Record<string, number>;
    actionTypes: Record<string, number>;
    objectTypes: Record<string, number>;
    subtypes: Record<string, number>;
  };
  encryption: { encrypted: boolean; permissions: Record<string, string>; details: Record<string, string> };
  fonts: TableResult;
  images: TableResult;
  limits: { maxFileBytes: number; maxReachableObjects: number; maxRowsPerTable: number };
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function labelToken(value: string) {
  return value.startsWith('/') ? value.slice(1) : value;
}

function KeyValue({ data }: { data: Record<string, string | number> }) {
  const entries = Object.entries(data);
  if (!entries.length) return <p className="hint">Không có dữ liệu.</p>;
  return <div style={{ display: 'grid', gap: 8 }}>{entries.map(([key, value]) => <div className="result-box" key={key} style={{ margin: 0 }}><strong>{key}</strong><p style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>{String(value)}</p></div>)}</div>;
}

export default function PdfInfoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setReport(null);
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('password', password);
      const response = await fetch(`${API_BASE}/pdf/info`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      setReport(await response.json() as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể phân tích PDF.');
    } finally {
      setBusy(false);
    }
  }

  const summary = report ? [
    ['Trang', report.structure.pages],
    ['Object reachable', report.structure.reachableObjects],
    ['Stream', report.structure.streams],
    ['Font', report.fonts.count],
    ['Ảnh', report.images.count],
    ['Form field', report.structure.formFields],
    ['Chữ ký', report.structure.signatureFields],
    ['File đính kèm', report.structure.embeddedFiles],
    ['JavaScript', report.structure.javascriptActions],
    ['Active annotation', report.structure.activeAnnotations],
  ] : [];

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf + Poppler · V1.3</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">INSPECT · V1.3</p>
      <h1>Thông tin toàn bộ PDF</h1>
      <p className="subtitle">Phân tích tổng hợp metadata, trang, cấu trúc, font, ảnh, form/chữ ký, attachment, mã hóa/quyền và dấu hiệu active content mà không sửa file.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      <label className="field"><span>Mật khẩu mở PDF (nếu có)</span><input type="password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Để trống nếu PDF không mã hóa" autoComplete="off"/></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn 100 MB. Báo cáo chỉ đọc dữ liệu; metadata và tên đối tượng được render bằng text React, không chèn HTML từ PDF vào trang.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={inspect} disabled={!file || busy}>{busy ? 'Đang phân tích…' : 'Phân tích PDF'}</button>

      {report && <>
        <div className="result-box"><strong>{report.file.name}</strong><p>{formatBytes(report.file.bytes)} · SHA-256: <code style={{ overflowWrap: 'anywhere' }}>{report.file.sha256}</code></p></div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10 }}>
          {summary.map(([label, value]) => <div className="result-box" key={String(label)} style={{ margin: 0 }}><strong>{value}</strong><p style={{ marginBottom: 0 }}>{label}</p></div>)}
        </div>

        <section style={{ marginTop: 24 }}><h2>Thông tin tài liệu</h2><KeyValue data={report.document}/></section>
        <section style={{ marginTop: 24 }}><h2>Metadata</h2><KeyValue data={report.metadata}/></section>

        <section style={{ marginTop: 24 }}>
          <h2>Mã hóa & quyền</h2>
          <div className="result-box"><strong>{report.encryption.encrypted ? 'PDF có mã hóa' : 'PDF không mã hóa'}</strong></div>
          <KeyValue data={{ ...report.encryption.details, ...report.encryption.permissions }}/>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Cấu trúc PDF</h2>
          <KeyValue data={{
            'Reachable objects': report.structure.reachableObjects,
            Dictionaries: report.structure.dictionaries,
            Streams: report.structure.streams,
            Pages: report.structure.pages,
            Fonts: report.structure.fonts,
            Images: report.structure.images,
            'Form XObjects': report.structure.formXObjects,
            'Form fields': report.structure.formFields,
            'Signature fields': report.structure.signatureFields,
            'Embedded files': report.structure.embeddedFiles,
            OCG: report.structure.optionalContentGroups,
            'Metadata streams': report.structure.metadataStreams,
            Outlines: report.structure.outlines,
            XFA: report.structure.xfaEntries,
            JavaScript: report.structure.javascriptActions,
            'Active annotations': report.structure.activeAnnotations,
          }}/>
        </section>

        {Object.keys(report.structure.actionTypes).length > 0 && <section style={{ marginTop: 24 }}><h2>Action types</h2><KeyValue data={Object.fromEntries(Object.entries(report.structure.actionTypes).map(([key, value]) => [labelToken(key), value]))}/></section>}
        {Object.keys(report.structure.annotationTypes).length > 0 && <section style={{ marginTop: 24 }}><h2>Annotation types</h2><KeyValue data={Object.fromEntries(Object.entries(report.structure.annotationTypes).map(([key, value]) => [labelToken(key), value]))}/></section>}

        <section style={{ marginTop: 24 }}><h2>Fonts · {report.fonts.count}</h2>{report.fonts.truncated && <div className="error">Danh sách đã cắt ở {report.limits.maxRowsPerTable} dòng.</div>}<pre style={{ whiteSpace: 'pre', overflowX: 'auto', padding: 12, borderRadius: 10, background: 'rgba(127,127,127,0.08)' }}>{report.fonts.rows.length ? report.fonts.rows.join('\n') : 'Không phát hiện font.'}</pre></section>
        <section style={{ marginTop: 24 }}><h2>Images · {report.images.count}</h2>{report.images.truncated && <div className="error">Danh sách đã cắt ở {report.limits.maxRowsPerTable} dòng.</div>}<pre style={{ whiteSpace: 'pre', overflowX: 'auto', padding: 12, borderRadius: 10, background: 'rgba(127,127,127,0.08)' }}>{report.images.rows.length ? report.images.rows.join('\n') : 'Không phát hiện ảnh raster.'}</pre></section>

        {(report.structure.javascriptActions > 0 || report.structure.activeAnnotations > 0) && <div className="result-box" style={{ marginTop: 24 }}><strong>Có active content cần xem kỹ</strong><p>Dùng inspector chuyên biệt để xem đường dẫn/action và JavaScript dưới dạng text.</p><a className="feature-action" href="/active-content">Mở Active Content Inspector →</a></div>}
      </>}
    </section>
  </main>;
}
