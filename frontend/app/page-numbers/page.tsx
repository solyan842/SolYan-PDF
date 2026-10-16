'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { downloadPdf, parsePages } from '../../lib/pdf-client';
import {
  type PageNumberMargin,
  type PageNumberPosition,
  formatPageNumber,
  pageNumberPlacement,
  pageNumberTemplate,
  parseHexColor,
} from '../../lib/page-numbers';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const POSITION_OPTIONS: Array<{ value: PageNumberPosition; label: string }> = [
  { value: 1, label: 'Trên · trái' },
  { value: 2, label: 'Trên · giữa' },
  { value: 3, label: 'Trên · phải' },
  { value: 4, label: 'Giữa · trái' },
  { value: 5, label: 'Giữa · giữa' },
  { value: 6, label: 'Giữa · phải' },
  { value: 7, label: 'Dưới · trái' },
  { value: 8, label: 'Dưới · giữa' },
  { value: 9, label: 'Dưới · phải' },
];

const TWO_COLUMN_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 } as const;

type FontChoice = 'helvetica' | 'times' | 'courier';

export default function PageNumbersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sourcePageCount, setSourcePageCount] = useState(0);
  const [pages, setPages] = useState('');
  const [start, setStart] = useState(1);
  const [position, setPosition] = useState<PageNumberPosition>(8);
  const [margin, setMargin] = useState<PageNumberMargin>('medium');
  const [fontSize, setFontSize] = useState(12);
  const [fontChoice, setFontChoice] = useState<FontChoice>('helvetica');
  const [fontColor, setFontColor] = useState('#000000');
  const [template, setTemplate] = useState('{n}');
  const [zeroPad, setZeroPad] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setSourcePageCount(0);
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
    if (!selected) return;
    try {
      const pdf = await PDFDocument.load(await selected.arrayBuffer());
      setSourcePageCount(pdf.getPageCount());
    } catch (cause) {
      setFile(null);
      setError(cause instanceof Error ? cause.message : 'Không đọc được PDF.');
      event.target.value = '';
    }
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (!Number.isInteger(start) || Math.abs(start) > 999999999) throw new Error('Số bắt đầu phải là số nguyên hợp lệ.');
      if (!Number.isFinite(fontSize) || fontSize < 6 || fontSize > 72) throw new Error('Cỡ chữ phải từ 6 đến 72 pt.');
      if (!Number.isInteger(zeroPad) || zeroPad < 0 || zeroPad > 12) throw new Error('Zero padding phải từ 0 đến 12 chữ số.');
      if (template.length > 200) throw new Error('Mẫu số trang tối đa 200 ký tự.');
      formatPageNumber(start, zeroPad);
      const color = parseHexColor(fontColor);

      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const standardFont = fontChoice === 'times'
        ? StandardFonts.TimesRoman
        : fontChoice === 'courier'
          ? StandardFonts.Courier
          : StandardFonts.Helvetica;
      const font = await pdf.embedFont(standardFont);
      const indexes = parsePages(pages, pdf.getPageCount());

      indexes.forEach((index, order) => {
        const page = pdf.getPage(index);
        const label = pageNumberTemplate(template, start + order, pdf.getPageCount(), file.name, zeroPad);
        const textWidth = font.widthOfTextAtSize(label, fontSize);
        const crop = page.getCropBox();
        const origin = pageNumberPlacement(crop, textWidth, fontSize, position, margin);
        if (origin.x < crop.x - 0.01 || origin.x + textWidth > crop.x + crop.width + 0.01) {
          throw new Error(`Nội dung số trang quá rộng ở trang ${index + 1}. Hãy giảm cỡ chữ hoặc rút ngắn mẫu.`);
        }
        page.drawText(label, {
          x: origin.x,
          y: origin.y,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      });

      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-numbered.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đánh số trang.');
    } finally {
      setBusy(false);
    }
  }

  const previewStart = Number.isInteger(start) ? start : 1;
  const previewPad = Number.isInteger(zeroPad) && zeroPad >= 0 && zeroPad <= 12 ? zeroPad : 0;
  const previewTotal = sourcePageCount > 0 ? sourcePageCount : 12;
  const preview = pageNumberTemplate(template, previewStart, previewTotal, file?.name ?? 'document.pdf', previewPad);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · pdf-lib · Bates</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">V1.5 · PAGE NUMBERS</p>
      <h1>Đánh số trang / Bates</h1>
      <p className="subtitle">Đánh số theo vùng trang, 9 vị trí, font/màu/lề tùy chọn, mẫu động và zero-padding cho Bates stamping.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Trang áp dụng</span><input value={pages} onChange={(e)=>setPages(e.target.value)} placeholder="Để trống = tất cả; ví dụ 1,3-8" /></label>

      <div style={TWO_COLUMN_STYLE}>
        <label className="field"><span>Bắt đầu từ số</span><input type="number" value={start} onChange={(e)=>setStart(Number(e.target.value))}/></label>
        <label className="field"><span>Zero padding / Bates</span><input type="number" min="0" max="12" value={zeroPad} onChange={(e)=>setZeroPad(Number(e.target.value))}/><small>0 = tắt; 6 → 000001.</small></label>
      </div>

      <label className="field"><span>Mẫu hiển thị</span><input value={template} maxLength={200} onChange={(e)=>setTemplate(e.target.value)} placeholder="Page {n} of {total}"/><small>Biến: <code>{'{n}'}</code> · <code>{'{total}'}</code> · <code>{'{filename}'}</code></small></label>

      <div style={TWO_COLUMN_STYLE}>
        <label className="field"><span>Vị trí</span><select value={position} onChange={(e)=>setPosition(Number(e.target.value) as PageNumberPosition)}>{POSITION_OPTIONS.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="field"><span>Lề</span><select value={margin} onChange={(e)=>setMargin(e.target.value as PageNumberMargin)}><option value="small">Nhỏ · 2%</option><option value="medium">Vừa · 3.5%</option><option value="large">Lớn · 5%</option><option value="x-large">Rất lớn · 7.5%</option></select></label>
      </div>

      <div style={TWO_COLUMN_STYLE}>
        <label className="field"><span>Font</span><select value={fontChoice} onChange={(e)=>setFontChoice(e.target.value as FontChoice)}><option value="helvetica">Helvetica</option><option value="times">Times Roman</option><option value="courier">Courier</option></select></label>
        <label className="field"><span>Cỡ chữ</span><input type="number" min="6" max="72" step="1" value={fontSize} onChange={(e)=>setFontSize(Number(e.target.value))}/></label>
      </div>

      <label className="field"><span>Màu chữ</span><input type="color" value={fontColor} onChange={(e)=>setFontColor(e.target.value)}/><small>{fontColor}</small></label>

      <div className="result-box"><strong>Xem trước mẫu:</strong> {preview}</div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong> · {sourcePageCount} trang</p>}
      <p className="hint">Mặc định vẫn là dưới · giữa như bản cũ. Số tăng theo thứ tự trang đã chọn. <code>{'{total}'}</code> là tổng số trang vật lý của PDF, không phải số trang được chọn.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={apply} disabled={!file || busy}>{busy ? 'Đang xử lý…' : 'Đánh số trang / Bates'}</button>
    </section>
  </main>;
}
