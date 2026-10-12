'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
type Target = 'docx'|'xlsx'|'pptx';

export default function PdfToOfficePage() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<Target>('docx');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setError(''); }

  async function convert() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('file', file); body.append('target', target);
      const response = await fetch(`${API_BASE}/experimental/pdf-to-office`, { method: 'POST', body });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try { detail = (await response.json()).detail ?? detail; } catch {}
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `solyan-converted.${target}`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể chuyển PDF sang Office.'); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Experimental · Bloom adapter</div></header>
    <section className="hero compact-hero"><p className="eyebrow">PDF → OFFICE · R&amp;D</p><h1>PDF → Office</h1><p className="subtitle">Adapter tới Bloom Document Intelligence Engine, pin theo commit đã rà. Fidelity DOCX/XLSX/PPTX vẫn cần benchmark theo từng loại tài liệu.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Định dạng đầu ra</span><select value={target} onChange={(e)=>setTarget(e.target.value as Target)}><option value="docx">Word (.docx)</option><option value="xlsx">Excel (.xlsx)</option><option value="pptx">PowerPoint (.pptx)</option></select></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <div className="result-box"><strong>Experimental:</strong> kết quả phụ thuộc cấu trúc PDF. PDF scan nên OCR/Structure trước; không cam kết layout 1:1 như phần mềm thương mại.</div>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={convert} disabled={!file || busy}>{busy ? 'Đang chuyển đổi…' : `Chuyển sang ${target.toUpperCase()}`}</button>
    </section>
  </main>;
}
