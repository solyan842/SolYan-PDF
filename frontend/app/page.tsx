'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { PDFDocument } from 'pdf-lib';

type PdfItem = {
  id: string;
  file: File;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function HomePage() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const totalSize = useMemo(
    () => items.reduce((sum, item) => sum + item.file.size, 0),
    [items],
  );

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    );

    if (!selected.length) return;

    setError('');
    setItems((current) => [
      ...current,
      ...selected.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
      })),
    ]);

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

  function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function mergePdfs() {
    if (items.length < 2) {
      setError('Hãy chọn ít nhất 2 file PDF để gộp.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const output = await PDFDocument.create();

      for (const item of items) {
        const bytes = await item.file.arrayBuffer();
        const source = await PDFDocument.load(bytes, {
          ignoreEncryption: false,
          updateMetadata: false,
        });
        const pageIndexes = source.getPageIndices();
        const pages = await output.copyPages(source, pageIndexes);
        pages.forEach((page) => output.addPage(page));
      }

      const merged = await output.save({ useObjectStreams: true });
      const blob = new Blob([merged as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'solyan-merged.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không thể gộp các file PDF.';
      setError(`Gộp PDF thất bại: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">SolYan PDF</div>
        <div className="privacy-pill">Xử lý cục bộ · Không upload file</div>
      </header>

      <section className="hero">
        <p className="eyebrow">CORE PDF · PHASE 1</p>
        <h1>Gộp PDF</h1>
        <p className="subtitle">
          Gộp nhiều file PDF thành một file duy nhất ngay trong trình duyệt. File của bạn không rời khỏi thiết bị.
        </p>

        <label className="picker">
          <input type="file" accept="application/pdf,.pdf" multiple onChange={onFilesSelected} />
          <span>+ Chọn file PDF</span>
        </label>
      </section>

      <section className="workspace" aria-live="polite">
        <div className="workspace-head">
          <div>
            <h2>Thứ tự file</h2>
            <p>{items.length} file · {formatBytes(totalSize)}</p>
          </div>
          {items.length > 0 && (
            <button className="ghost" type="button" onClick={() => setItems([])} disabled={busy}>
              Xóa tất cả
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="empty">Chưa có file. Chọn từ 2 file PDF trở lên để bắt đầu.</div>
        ) : (
          <ol className="file-list">
            {items.map((item, index) => (
              <li key={item.id} className="file-row">
                <div className="file-index">{index + 1}</div>
                <div className="file-meta">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <span>{formatBytes(item.file.size)}</span>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || busy} aria-label="Đưa file lên">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1 || busy} aria-label="Đưa file xuống">
                    ↓
                  </button>
                  <button type="button" onClick={() => remove(item.id)} disabled={busy} aria-label="Xóa file">
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        {error && <div className="error">{error}</div>}

        <button className="merge-button" type="button" onClick={mergePdfs} disabled={busy || items.length < 2}>
          {busy ? 'Đang gộp…' : 'Gộp PDF'}
        </button>
      </section>

      <footer>
        SolYan PDF · Browser-first · Privacy-first
      </footer>
    </main>
  );
}
