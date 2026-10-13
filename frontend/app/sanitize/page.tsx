'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type Counts = {
  actions: number;
  links: number;
  metadata: number;
  embedded: number;
  activeAnnotations: number;
};

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

function headerCount(response: Response, name: string) {
  const parsed = Number(response.headers.get(name) ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SanitizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [removeActions, setRemoveActions] = useState(true);
  const [removeLinks, setRemoveLinks] = useState(true);
  const [removeMetadata, setRemoveMetadata] = useState(true);
  const [removeEmbeddedFiles, setRemoveEmbeddedFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
    setCounts(null);
  }

  async function run() {
    if (!file || ![removeActions, removeLinks, removeMetadata, removeEmbeddedFiles].some(Boolean)) return;
    setBusy(true);
    setError('');
    setCounts(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('remove_actions', String(removeActions));
      body.append('remove_links', String(removeLinks));
      body.append('remove_metadata', String(removeMetadata));
      body.append('remove_embedded_files', String(removeEmbeddedFiles));
      const response = await fetch(`${API_BASE}/pdf/sanitize`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      setCounts({
        actions: headerCount(response, 'X-SolYan-Sanitize-Actions-Removed'),
        links: headerCount(response, 'X-SolYan-Sanitize-Links-Removed'),
        metadata: headerCount(response, 'X-SolYan-Sanitize-Metadata-Removed'),
        embedded: headerCount(response, 'X-SolYan-Sanitize-Embedded-Files-Removed'),
        activeAnnotations: headerCount(response, 'X-SolYan-Sanitize-Active-Annotations-Removed'),
      });
      downloadBlob(await response.blob(), 'solyan-sanitized.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể làm sạch PDF.');
    } finally {
      setBusy(false);
    }
  }

  const anySelected = [removeActions, removeLinks, removeMetadata, removeEmbeddedFiles].some(Boolean);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf JSON · V1.2</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">SECURITY · V1.2</p>
      <h1>Làm sạch PDF</h1>
      <p className="subtitle">Loại các vector nội dung hoạt động phổ biến đã được regression-test: JavaScript/actions, link, metadata và file đính kèm.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>JavaScript / actions / active annotations</span><select value={removeActions ? 'yes' : 'no'} onChange={(e)=>setRemoveActions(e.target.value === 'yes')}><option value="yes">Loại bỏ</option><option value="no">Giữ lại</option></select></label>
      <label className="field"><span>Link annotations</span><select value={removeLinks ? 'yes' : 'no'} onChange={(e)=>setRemoveLinks(e.target.value === 'yes')}><option value="yes">Loại bỏ</option><option value="no">Giữ lại</option></select></label>
      <label className="field"><span>Metadata (Info + XMP)</span><select value={removeMetadata ? 'yes' : 'no'} onChange={(e)=>setRemoveMetadata(e.target.value === 'yes')}><option value="yes">Loại bỏ</option><option value="no">Giữ lại</option></select></label>
      <label className="field"><span>File đính kèm / EmbeddedFiles / AF</span><select value={removeEmbeddedFiles ? 'yes' : 'no'} onChange={(e)=>setRemoveEmbeddedFiles(e.target.value === 'yes')}><option value="yes">Loại bỏ</option><option value="no">Giữ lại</option></select></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint"><strong>Lưu ý:</strong> đây là làm sạch các cấu trúc PDF đã được kiểm thử, không phải antivirus và không bảo đảm phát hiện mọi khai thác PDF có thể tồn tại. File được qpdf rewrite; chữ ký số hiện có sẽ không còn hợp lệ sau khi nội dung bị thay đổi.</p>
      {counts && <div className="result-box">Đã loại: {counts.actions} action/JS, {counts.links} link, {counts.metadata} metadata, {counts.embedded} cấu trúc file đính kèm, {counts.activeAnnotations} active annotation.</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || !anySelected || busy}>{busy ? 'Đang làm sạch…' : 'Làm sạch và tải PDF'}</button>
    </section>
  </main>;
}
