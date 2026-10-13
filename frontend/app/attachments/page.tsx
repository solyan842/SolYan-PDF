'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 20;

type AttachmentItem = {
  key: string;
  filename: string;
  stream?: string | null;
  filespec?: string | null;
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

async function errorMessage(response: Response) {
  try {
    const payload = await response.json();
    return payload.detail ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export default function AttachmentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function onPdf(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setItems([]);
    setSelectedKey('');
    setError('');
    setResult('');
  }

  function onAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > MAX_ATTACHMENT_COUNT) {
      setError(`Chỉ được thêm tối đa ${MAX_ATTACHMENT_COUNT} file trong một lần.`);
      event.target.value = '';
      return;
    }
    const tooLarge = files.find((item) => item.size > MAX_ATTACHMENT_SIZE);
    if (tooLarge) {
      setError(`${tooLarge.name} vượt giới hạn 25 MB.`);
      event.target.value = '';
      return;
    }
    const total = files.reduce((sum, item) => sum + item.size, 0);
    if (total > 50 * 1024 * 1024) {
      setError('Tổng attachment vượt giới hạn 50 MB.');
      event.target.value = '';
      return;
    }
    setNewAttachments(files);
    setError('');
  }

  async function inspect(target = file) {
    if (!target) return;
    const body = new FormData();
    body.append('file', target);
    const response = await fetch(`${API_BASE}/pdf/attachments/list`, { method: 'POST', body });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json() as { attachments: AttachmentItem[]; count: number };
    setItems(payload.attachments);
    if (payload.attachments.length && !payload.attachments.some((item) => item.key === selectedKey)) {
      setSelectedKey(payload.attachments[0].key);
    }
    if (!payload.attachments.length) setSelectedKey('');
    setResult(payload.count ? `PDF có ${payload.count} attachment.` : 'PDF không có attachment.');
  }

  async function runInspect() {
    if (!file) return;
    setBusy(true); setError(''); setResult('');
    try { await inspect(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể đọc attachment.'); }
    finally { setBusy(false); }
  }

  async function add() {
    if (!file || !newAttachments.length) return;
    setBusy(true); setError(''); setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      newAttachments.forEach((item) => body.append('attachments', item));
      const response = await fetch(`${API_BASE}/pdf/attachments/add`, { method: 'POST', body });
      if (!response.ok) throw new Error(await errorMessage(response));
      const blob = await response.blob();
      downloadBlob(blob, 'solyan-with-attachments.pdf');
      setResult(`Đã thêm ${newAttachments.length} attachment. File PDF mới đã được tải xuống.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể thêm attachment.');
    } finally { setBusy(false); }
  }

  async function extract() {
    if (!file || !selectedKey) return;
    setBusy(true); setError(''); setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('key', selectedKey);
      const response = await fetch(`${API_BASE}/pdf/attachments/extract`, { method: 'POST', body });
      if (!response.ok) throw new Error(await errorMessage(response));
      const item = items.find((entry) => entry.key === selectedKey);
      downloadBlob(await response.blob(), item?.filename || selectedKey || 'attachment.bin');
      setResult(`Đã trích xuất: ${item?.filename || selectedKey}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể trích xuất attachment.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!file || !selectedKey) return;
    setBusy(true); setError(''); setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('key', selectedKey);
      const response = await fetch(`${API_BASE}/pdf/attachments/remove`, { method: 'POST', body });
      if (!response.ok) throw new Error(await errorMessage(response));
      downloadBlob(await response.blob(), 'solyan-without-attachment.pdf');
      setResult('Đã xóa attachment khỏi bản PDF mới. File gốc trên máy không bị thay đổi.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xóa attachment.');
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf server</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">ATTACHMENTS · V1.2</p>
      <h1>File đính kèm trong PDF</h1>
      <p className="subtitle">Xem, thêm, trích xuất hoặc xóa embedded files bằng qpdf. Mọi thao tác thay đổi đều tạo PDF mới; file gốc không bị ghi đè.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onPdf}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      {file && <p className="selected-file">PDF: <strong>{file.name}</strong></p>}
      <button className="ghost wide" type="button" onClick={runInspect} disabled={!file || busy}>Đọc danh sách attachment</button>

      {items.length > 0 && <label className="field"><span>Attachment</span><select value={selectedKey} onChange={(e)=>setSelectedKey(e.target.value)}>{items.map((item) => <option key={item.key} value={item.key}>{item.filename} · key: {item.key}</option>)}</select></label>}
      {items.length > 0 && <div className="inline-controls"><button className="ghost" type="button" onClick={extract} disabled={busy || !selectedKey}>Tải attachment</button><button className="ghost" type="button" onClick={remove} disabled={busy || !selectedKey}>Xóa khỏi PDF mới</button></div>}

      <label className="field"><span>Thêm attachment</span><input type="file" multiple onChange={onAttachments}/></label>
      {newAttachments.length > 0 && <p className="selected-file">Đã chọn {newAttachments.length} file · {(newAttachments.reduce((sum, item)=>sum+item.size,0)/1024/1024).toFixed(2)} MB</p>}
      <button className="merge-button" type="button" onClick={add} disabled={!file || !newAttachments.length || busy}>{busy ? 'Đang xử lý…' : 'Thêm attachment và tải PDF mới'}</button>
      <p className="hint">Giới hạn: PDF 100 MB; tối đa 20 attachment/lần; 25 MB mỗi file; 50 MB tổng. qpdf dùng attachment key nội bộ để extract/remove, vì key có thể khác tên file hiển thị.</p>
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  </main>;
}
