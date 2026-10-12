'use client';

import { ChangeEvent, useState } from 'react';
import { diffLines, DiffLine } from '../../lib/text-diff';

type PdfInfo = { name: string; pages: number; text: string };

async function extractPdf(file: File): Promise<PdfInfo> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
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
  await task.destroy();
  return { name: file.name, pages: pdf.numPages, text: pageTexts.join('\n') };
}

export default function ComparePage() {
  const [left, setLeft] = useState<File | null>(null);
  const [right, setRight] = useState<File | null>(null);
  const [leftInfo, setLeftInfo] = useState<PdfInfo | null>(null);
  const [rightInfo, setRightInfo] = useState<PdfInfo | null>(null);
  const [diff, setDiff] = useState<DiffLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pick(side: 'left'|'right', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (side === 'left') setLeft(file); else setRight(file);
    setDiff([]); setLeftInfo(null); setRightInfo(null); setError('');
  }

  async function compare() {
    if (!left || !right) return;
    setBusy(true); setError('');
    try {
      const [a, b] = await Promise.all([extractPdf(left), extractPdf(right)]);
      setLeftInfo(a); setRightInfo(b);
      setDiff(diffLines(a.text, b.text));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể so sánh PDF.');
    } finally { setBusy(false); }
  }

  const added = diff.filter((line) => line.type === 'added').length;
  const removed = diff.filter((line) => line.type === 'removed').length;

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js</div></header>
    <section className="hero compact-hero"><p className="eyebrow">COMPARE · PHASE 5</p><h1>So sánh PDF</h1><p className="subtitle">Trích xuất nội dung từng trang bằng PDF.js rồi so sánh dòng văn bản. Không upload tài liệu.</p></section>
    <section className="workspace form-workspace">
      <div className="compare-pickers">
        <label className="field"><span>PDF A</span><input type="file" accept="application/pdf,.pdf" onChange={(e)=>pick('left',e)}/>{left && <small>{left.name}</small>}</label>
        <label className="field"><span>PDF B</span><input type="file" accept="application/pdf,.pdf" onChange={(e)=>pick('right',e)}/>{right && <small>{right.name}</small>}</label>
      </div>
      <p className="hint">Đây là so sánh nội dung văn bản. So sánh pixel/layout nâng cao sẽ là lớp bổ sung sau.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={compare} disabled={!left || !right || busy}>{busy ? 'Đang so sánh…' : 'So sánh PDF'}</button>
    </section>
    {diff.length > 0 && <section className="workspace">
      <div className="workspace-head"><div><h2>Kết quả</h2><p>{leftInfo?.pages ?? 0} trang ↔ {rightInfo?.pages ?? 0} trang · +{added} / −{removed}</p></div></div>
      <div className="diff-box">{diff.map((line,index)=><div key={index} className={`diff-line ${line.type}`}><span>{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span><code>{line.text || ' '}</code></div>)}</div>
    </section>}
  </main>;
}
