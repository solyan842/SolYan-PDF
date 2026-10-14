'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadPdf, parsePages } from '../../lib/pdf-client';
import { applyStamp, StampPosition } from '../../lib/stamp';

type StampKind = 'text' | 'image';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PAGE_COUNT = 500;

const POSITIONS: Array<{ value: StampPosition; label: string }> = [
  { value: 'top-left', label: 'Trên trái' },
  { value: 'top-center', label: 'Trên giữa' },
  { value: 'top-right', label: 'Trên phải' },
  { value: 'middle-left', label: 'Giữa trái' },
  { value: 'center', label: 'Chính giữa' },
  { value: 'middle-right', label: 'Giữa phải' },
  { value: 'bottom-left', label: 'Dưới trái' },
  { value: 'bottom-center', label: 'Dưới giữa' },
  { value: 'bottom-right', label: 'Dưới phải' },
  { value: 'custom', label: 'Tọa độ X/Y tùy chỉnh' },
];

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<StampKind>('text');
  const [text, setText] = useState('SolYan PDF');
  const [image, setImage] = useState<File | null>(null);
  const [pages, setPages] = useState('');
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<StampPosition>('center');
  const [customX, setCustomX] = useState(40);
  const [customY, setCustomY] = useState(40);
  const [fontSize, setFontSize] = useState(40);
  const [color, setColor] = useState('#596674');
  const [imageWidth, setImageWidth] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho Stamp local.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
  }

  async function apply() {
    if (!file || (kind === 'text' && !text.trim()) || (kind === 'image' && !image)) return;
    setBusy(true);
    setError('');
    try {
      const sourceBytes = await file.arrayBuffer();
      const source = await PDFDocument.load(sourceBytes);
      if (source.getPageCount() > MAX_PAGE_COUNT) throw new Error(`PDF vượt giới hạn ${MAX_PAGE_COUNT} trang cho Stamp local.`);
      const pageIndexes = parsePages(pages, source.getPageCount());

      const common = {
        pageIndexes,
        opacity,
        rotation,
        position,
        customX,
        customY,
        filename: file.name,
      };

      let output: Uint8Array;
      if (kind === 'text') {
        output = await applyStamp(sourceBytes, {
          ...common,
          kind: 'text',
          text,
          fontSize,
          color,
        });
      } else {
        if (!image) throw new Error('Hãy chọn ảnh PNG hoặc JPG.');
        const lower = image.name.toLowerCase();
        const imageType = image.type === 'image/png' || lower.endsWith('.png') ? 'png' : 'jpg';
        if (imageType === 'jpg' && !(image.type === 'image/jpeg' || /\.jpe?g$/.test(lower))) {
          throw new Error('Stamp ảnh chỉ hỗ trợ PNG hoặc JPG.');
        }
        output = await applyStamp(sourceBytes, {
          ...common,
          kind: 'image',
          imageBytes: new Uint8Array(await image.arrayBuffer()),
          imageType,
          widthPercent: imageWidth,
        });
      }

      downloadPdf(output, 'solyan-stamped.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể thêm stamp.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Xử lý cục bộ · pdf-lib</div></header>
    <section className="hero compact-hero"><p className="eyebrow">CORE PDF · V1.2</p><h1>Watermark / Stamp PDF</h1><p className="subtitle">Đóng dấu chữ hoặc PNG/JPG lên toàn bộ hay một số trang, với vị trí, xoay, opacity và kích thước tùy chỉnh ngay trong trình duyệt.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Loại stamp</span><select value={kind} onChange={(e)=>setKind(e.target.value as StampKind)}><option value="text">Chữ</option><option value="image">Ảnh PNG/JPG</option></select></label>
      {kind === 'text' ? <>
        <label className="field"><span>Nội dung</span><textarea value={text} onChange={(e)=>setText(e.target.value)} rows={3}/></label>
        <p className="hint">Biến hỗ trợ: <b>@page</b>, <b>@pages</b>, <b>@filename</b>, <b>@date</b>. Dùng <b>@@</b> để in ký tự @.</p>
        <div className="inline-controls"><label className="field"><span>Cỡ chữ</span><input type="number" min="6" max="180" value={fontSize} onChange={(e)=>setFontSize(Number(e.target.value))}/></label><label className="field"><span>Màu</span><input type="color" value={color} onChange={(e)=>setColor(e.target.value)}/></label></div>
      </> : <>
        <label className="field"><span>Ảnh stamp</span><input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(e)=>setImage(e.target.files?.[0] ?? null)}/></label>
        <label className="field"><span>Rộng ảnh: {imageWidth}% chiều rộng trang</span><input type="range" min="2" max="95" step="1" value={imageWidth} onChange={(e)=>setImageWidth(Number(e.target.value))}/></label>
      </>}
      <label className="field"><span>Trang áp dụng</span><input value={pages} onChange={(e)=>setPages(e.target.value)} placeholder="Để trống = tất cả; ví dụ 1,3,5-8" /></label>
      <label className="field"><span>Vị trí</span><select value={position} onChange={(e)=>setPosition(e.target.value as StampPosition)}>{POSITIONS.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      {position === 'custom' && <div className="inline-controls"><label className="field"><span>X (pt)</span><input type="number" value={customX} onChange={(e)=>setCustomX(Number(e.target.value))}/></label><label className="field"><span>Y (pt)</span><input type="number" value={customY} onChange={(e)=>setCustomY(Number(e.target.value))}/></label></div>}
      <div className="inline-controls"><label className="field"><span>Góc xoay</span><input type="number" min="-180" max="180" step="1" value={rotation} onChange={(e)=>setRotation(Number(e.target.value))}/></label><label className="field"><span>Opacity: {Math.round(opacity * 100)}%</span><input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(e)=>setOpacity(Number(e.target.value))}/></label></div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn 100 MB / 500 trang. Stamp được thêm vào content stream; thao tác này thay đổi PDF và có thể làm mất hiệu lực chữ ký số hiện có.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={apply} disabled={!file || busy || (kind === 'text' ? !text.trim() : !image)}>{busy ? 'Đang xử lý…' : 'Thêm Stamp'}</button>
    </section>
  </main>;
}
