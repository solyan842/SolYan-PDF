'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

export default function ViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected); setError(''); setPageNumber(1); setPageCount(0);
    if (!selected) { setData(null); return; }
    setData(new Uint8Array(await selected.arrayBuffer()));
  }

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy?: () => Promise<void> } | undefined;

    async function render() {
      if (!data || !canvasRef.current) return;
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        loadingTask = pdfjs.getDocument({ data: data.slice() });
        const pdf = await (loadingTask as unknown as { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<any> }> }).promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);
        const safePage = Math.min(Math.max(1, pageNumber), pdf.numPages);
        const page = await pdf.getPage(safePage);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D không khả dụng.');
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể hiển thị PDF.');
      }
    }

    render();
    return () => { cancelled = true; void loadingTask?.destroy?.(); };
  }, [data, pageNumber, scale]);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">PDF.js · Local viewer</div></header>
    <section className="hero compact-hero"><p className="eyebrow">VIEWER · PHASE 2</p><h1>PDF Viewer</h1><p className="subtitle">Xem PDF trực tiếp trong trình duyệt bằng PDF.js.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="viewer-shell">
      <aside className="thumbnail-rail" aria-label="Danh sách trang">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((number)=><button className={number === pageNumber ? 'thumb active' : 'thumb'} key={number} onClick={()=>setPageNumber(number)}>Trang {number}</button>)}
      </aside>
      <div className="viewer-main">
        <div className="viewer-toolbar">
          <span>{file?.name ?? 'Chưa chọn file'}</span>
          <div><button onClick={()=>setScale((s)=>Math.max(.5,s-.25))}>−</button><span>{Math.round(scale*100)}%</span><button onClick={()=>setScale((s)=>Math.min(3,s+.25))}>+</button></div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="canvas-stage">{data ? <canvas ref={canvasRef}/> : <div className="empty">Chọn một file PDF để xem.</div>}</div>
      </div>
    </section>
  </main>;
}
