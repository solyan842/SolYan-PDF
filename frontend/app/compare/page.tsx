'use client';

import { ChangeEvent, useState } from 'react';
import { diffLines, DiffLine } from '../../lib/text-diff';

type PdfInfo = { name: string; pages: number; text: string };
type VisualPage = { page: number; similarity: number; differentPixels: number; totalPixels: number; sizeMismatch: boolean };

async function loadPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  return { task, pdf: await task.promise };
}

async function extractPdf(file: File): Promise<PdfInfo> {
  const { task, pdf } = await loadPdf(file);
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.push(`--- Trang ${i} ---\n${line}`);
  }
  const info = { name: file.name, pages: pdf.numPages, text: pageTexts.join('\n') };
  await task.destroy();
  return info;
}

async function renderPage(file: File, pageNumber: number) {
  const { task, pdf } = await loadPdf(file);
  try {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.25, 900 / Math.max(base.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas không khả dụng.');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
  } finally {
    await task.destroy();
  }
}

async function compareVisual(left: File, right: File, leftPages: number, rightPages: number): Promise<VisualPage[]> {
  const count = Math.min(leftPages, rightPages);
  const pages: VisualPage[] = [];
  for (let page = 1; page <= count; page += 1) {
    const [a, b] = await Promise.all([renderPage(left, page), renderPage(right, page)]);
    if (a.width !== b.width || a.height !== b.height) {
      pages.push({ page, similarity: 0, differentPixels: Math.max(a.width * a.height, b.width * b.height), totalPixels: Math.max(a.width * a.height, b.width * b.height), sizeMismatch: true });
      continue;
    }
    let different = 0;
    const threshold = 24;
    for (let index = 0; index < a.pixels.length; index += 4) {
      const delta = Math.abs(a.pixels[index] - b.pixels[index]) + Math.abs(a.pixels[index + 1] - b.pixels[index + 1]) + Math.abs(a.pixels[index + 2] - b.pixels[index + 2]);
      if (delta > threshold) different += 1;
    }
    const total = a.width * a.height;
    pages.push({ page, similarity: total ? (1 - different / total) * 100 : 100, differentPixels: different, totalPixels: total, sizeMismatch: false });
  }
  return pages;
}

export default function ComparePage() {
  const [left, setLeft] = useState<File | null>(null);
  const [right, setRight] = useState<File | null>(null);
  const [leftInfo, setLeftInfo] = useState<PdfInfo | null>(null);
  const [rightInfo, setRightInfo] = useState<PdfInfo | null>(null);
  const [diff, setDiff] = useState<DiffLine[]>([]);
  const [visual, setVisual] = useState<VisualPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pick(side: 'left'|'right', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (side === 'left') setLeft(file); else setRight(file);
    setDiff([]); setVisual([]); setLeftInfo(null); setRightInfo(null); setError('');
  }

  async function compare() {
    if (!left || !right) return;
    setBusy(true); setError('');
    try {
      const [a, b] = await Promise.all([extractPdf(left), extractPdf(right)]);
      setLeftInfo(a); setRightInfo(b);
      setDiff(diffLines(a.text, b.text));
      setVisual(await compareVisual(left, right, a.pages, b.pages));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể so sánh PDF.');
    } finally { setBusy(false); }
  }

  const added = diff.filter((line) => line.type === 'added').length;
  const removed = diff.filter((line) => line.type === 'removed').length;
  const averageSimilarity = visual.length ? visual.reduce((sum, page) => sum + page.similarity, 0) / visual.length : 0;

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js</div></header>
    <section className="hero compact-hero"><p className="eyebrow">COMPARE · PHASE 5</p><h1>So sánh PDF</h1><p className="subtitle">So sánh cả nội dung văn bản và hình ảnh/layout theo pixel ngay trên thiết bị, không upload tài liệu.</p></section>
    <section className="workspace form-workspace">
      <div className="compare-pickers">
        <label className="field"><span>PDF A</span><input type="file" accept="application/pdf,.pdf" onChange={(e)=>pick('left',e)}/>{left && <small>{left.name}</small>}</label>
        <label className="field"><span>PDF B</span><input type="file" accept="application/pdf,.pdf" onChange={(e)=>pick('right',e)}/>{right && <small>{right.name}</small>}</label>
      </div>
      <p className="hint">Visual compare render từng trang bằng PDF.js, sau đó tính tỷ lệ pixel tương đồng với ngưỡng chống nhiễu nhỏ.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={compare} disabled={!left || !right || busy}>{busy ? 'Đang so sánh…' : 'So sánh PDF'}</button>
    </section>
    {visual.length > 0 && <section className="workspace">
      <div className="workspace-head"><div><h2>So sánh hình ảnh/layout</h2><p>Tương đồng trung bình: {averageSimilarity.toFixed(2)}%</p></div></div>
      <div className="visual-diff-grid">{visual.map((page)=><div className="visual-diff-card" key={page.page}><strong>Trang {page.page}</strong><span className={page.similarity >= 99.5 ? 'good' : page.similarity >= 95 ? 'warn' : 'bad'}>{page.similarity.toFixed(2)}%</span><small>{page.sizeMismatch ? 'Khác kích thước trang' : `${page.differentPixels.toLocaleString()} pixel khác`}</small></div>)}</div>
      {leftInfo && rightInfo && leftInfo.pages !== rightInfo.pages && <div className="error">Số trang khác nhau: {leftInfo.pages} ↔ {rightInfo.pages}. Chỉ so sánh visual các trang cùng vị trí tồn tại ở cả hai file.</div>}
    </section>}
    {diff.length > 0 && <section className="workspace">
      <div className="workspace-head"><div><h2>So sánh văn bản</h2><p>{leftInfo?.pages ?? 0} trang ↔ {rightInfo?.pages ?? 0} trang · +{added} / −{removed}</p></div></div>
      <div className="diff-box">{diff.map((line,index)=><div key={index} className={`diff-line ${line.type}`}><span>{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span><code>{line.text || ' '}</code></div>)}</div>
    </section>}
  </main>;
}
