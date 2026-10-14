'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';

type Tool = 'text' | 'highlight' | 'mask' | 'rectangle' | 'image';

export default function EditorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [tool, setTool] = useState<Tool>('text');
  const [page, setPage] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(40);
  const [text, setText] = useState('SolYan PDF');
  const [fontSize, setFontSize] = useState(18);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] ?? null); setError(''); }

  async function exportEdited() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      if (page < 1 || page > pdf.getPageCount()) throw new Error(`Trang phải nằm trong 1-${pdf.getPageCount()}.`);
      const target = pdf.getPage(page - 1);

      if (tool === 'text') {
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        target.drawText(text, { x, y, size: fontSize, font, color: rgb(.08,.13,.2) });
      } else if (tool === 'highlight') {
        target.drawRectangle({ x, y, width, height, color: rgb(1,.9,.15), opacity: .35 });
      } else if (tool === 'mask') {
        target.drawRectangle({ x, y, width, height, color: rgb(0,0,0), opacity: 1 });
      } else if (tool === 'rectangle') {
        target.drawRectangle({ x, y, width, height, borderColor: rgb(.15,.42,1), borderWidth: 2, opacity: 0 });
      } else if (tool === 'image') {
        if (!image) throw new Error('Hãy chọn ảnh PNG hoặc JPG.');
        const bytes = await image.arrayBuffer();
        const embedded = image.type === 'image/png' || image.name.toLowerCase().endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        target.drawImage(embedded, { x, y, width, height });
      }

      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-edited.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chỉnh sửa PDF.');
    } finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local editor · pdf-lib</div></header>
    <section className="hero compact-hero"><p className="eyebrow">EDITOR · PHASE 2</p><h1>Chỉnh sửa PDF</h1><p className="subtitle">Thêm text/ảnh, highlight, che đen trực quan hoặc khung chú thích bằng toạ độ PDF. Che đen chỉ là lớp phủ hiển thị, không xóa dữ liệu gốc bên dưới.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Công cụ</span><select value={tool} onChange={(e)=>setTool(e.target.value as Tool)}><option value="text">Thêm text</option><option value="image">Thêm ảnh</option><option value="highlight">Highlight</option><option value="mask">Che đen trực quan</option><option value="rectangle">Vẽ khung</option></select></label>
      <div className="inline-controls"><label className="field"><span>Trang</span><input type="number" min="1" value={page} onChange={(e)=>setPage(Number(e.target.value))}/></label><label className="field"><span>X</span><input type="number" value={x} onChange={(e)=>setX(Number(e.target.value))}/></label><label className="field"><span>Y</span><input type="number" value={y} onChange={(e)=>setY(Number(e.target.value))}/></label></div>
      {(tool === 'highlight' || tool === 'mask' || tool === 'rectangle' || tool === 'image') && <div className="inline-controls"><label className="field"><span>Rộng</span><input type="number" value={width} onChange={(e)=>setWidth(Number(e.target.value))}/></label><label className="field"><span>Cao</span><input type="number" value={height} onChange={(e)=>setHeight(Number(e.target.value))}/></label></div>}
      {tool === 'text' && <><label className="field"><span>Nội dung</span><input value={text} onChange={(e)=>setText(e.target.value)}/></label><label className="field"><span>Cỡ chữ</span><input type="number" min="6" max="120" value={fontSize} onChange={(e)=>setFontSize(Number(e.target.value))}/></label></>}
      {tool === 'image' && <label className="field"><span>Ảnh PNG/JPG</span><input type="file" accept="image/png,image/jpeg" onChange={(e)=>setImage(e.target.files?.[0] ?? null)}/></label>}
      {tool === 'mask' && <div className="error"><strong>Không phải secure redaction:</strong> lớp che đen không xóa text/object bên dưới và không được dùng để xóa dữ liệu nhạy cảm.</div>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" disabled={!file || busy} onClick={exportEdited}>{busy ? 'Đang xử lý…' : 'Xuất PDF đã chỉnh sửa'}</button>
    </section>
  </main>;
}
