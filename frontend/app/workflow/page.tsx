'use client';

import { ChangeEvent, useState } from 'react';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';

type Step = 'rotate' | 'watermark' | 'numbers' | 'metadata';

export default function WorkflowPage() {
  const [file, setFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<Step[]>(['watermark', 'numbers']);
  const [rotation, setRotation] = useState(90);
  const [watermark, setWatermark] = useState('SolYan PDF');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggle(step: Step) {
    setSteps((current) => current.includes(step) ? current.filter((x) => x !== step) : [...current, step]);
  }

  async function run() {
    if (!file || !steps.length) return;
    setBusy(true); setError('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      let font: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;
      if (steps.includes('watermark') || steps.includes('numbers')) font = await pdf.embedFont(StandardFonts.Helvetica);

      for (const step of steps) {
        if (step === 'rotate') {
          pdf.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + rotation) % 360)));
        } else if (step === 'watermark' && font) {
          pdf.getPages().forEach((page) => {
            const { width, height } = page.getSize();
            const size = Math.max(20, Math.min(width, height) / 12);
            const w = font!.widthOfTextAtSize(watermark, size);
            page.drawText(watermark, { x: (width - w) / 2, y: height / 2, size, font: font!, color: rgb(.35,.4,.48), opacity: .16, rotate: degrees(35) });
          });
        } else if (step === 'numbers' && font) {
          pdf.getPages().forEach((page, index) => {
            const label = String(index + 1); const size = 10; const w = font!.widthOfTextAtSize(label, size);
            page.drawText(label, { x: (page.getWidth() - w) / 2, y: 18, size, font: font!, color: rgb(.32,.35,.4) });
          });
        } else if (step === 'metadata') {
          pdf.setTitle(title || file.name.replace(/\.pdf$/i, ''));
          pdf.setCreator('SolYan PDF');
          pdf.setProducer('SolYan PDF workflow');
        }
      }

      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-workflow.pdf');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Workflow thất bại.'); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local workflow</div></header>
    <section className="hero compact-hero"><p className="eyebrow">WORKFLOW · PHASE 5</p><h1>Workflow PDF</h1><p className="subtitle">Ghép nhiều thao tác local thành một lần xử lý, giữ file trên thiết bị.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={(e:ChangeEvent<HTMLInputElement>)=>setFile(e.target.files?.[0] ?? null)}/><span>+ Chọn PDF</span></label></section>
    <section className="workspace form-workspace">
      <div className="workflow-options">
        {(['rotate','watermark','numbers','metadata'] as Step[]).map((step)=><label className="check-row" key={step}><input type="checkbox" checked={steps.includes(step)} onChange={()=>toggle(step)}/><span>{step === 'rotate' ? 'Xoay tất cả trang' : step === 'watermark' ? 'Watermark' : step === 'numbers' ? 'Đánh số trang' : 'Metadata'}</span></label>)}
      </div>
      {steps.includes('rotate') && <label className="field"><span>Góc xoay</span><select value={rotation} onChange={(e)=>setRotation(Number(e.target.value))}><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>}
      {steps.includes('watermark') && <label className="field"><span>Watermark</span><input value={watermark} onChange={(e)=>setWatermark(e.target.value)}/></label>}
      {steps.includes('metadata') && <label className="field"><span>Title</span><input value={title} onChange={(e)=>setTitle(e.target.value)}/></label>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || !steps.length || busy}>{busy ? 'Đang chạy workflow…' : 'Chạy workflow'}</button>
    </section>
  </main>;
}
