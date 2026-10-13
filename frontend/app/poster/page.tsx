'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { createPosterPdf, MAX_POSTER_OUTPUT_PAGES, MAX_POSTER_SOURCE_PAGES, PosterPageSize } from '../../lib/poster';
import { downloadPdf } from '../../lib/pdf-client';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const PAGE_SIZES: PosterPageSize[] = ['A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid'];

export default function PosterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [xFactor, setXFactor] = useState(2);
  const [yFactor, setYFactor] = useState(2);
  const [pageSize, setPageSize] = useState<PosterPageSize>('A4');
  const [rightToLeft, setRightToLeft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const outputPages = pageCount * xFactor * yFactor;
  const invalidGrid = !Number.isInteger(xFactor) || !Number.isInteger(yFactor) || xFactor < 1 || yFactor < 1 || xFactor > 8 || yFactor > 8;
  const tooManyOutputs = outputPages > MAX_POSTER_OUTPUT_PAGES;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(null);
    setPageCount(0);
    setError('');
    setResult('');
    if (!selected) return;
    if (selected.size > MAX_FILE_SIZE) {
      setError('PDF vượt giới hạn 100 MB cho xử lý local.');
      event.target.value = '';
      return;
    }
    try {
      const document = await PDFDocument.load(await selected.arrayBuffer());
      if (document.getPageCount() > MAX_POSTER_SOURCE_PAGES) {
        throw new Error(`Poster PDF giới hạn ${MAX_POSTER_SOURCE_PAGES} trang nguồn.`);
      }
      setFile(selected);
      setPageCount(document.getPageCount());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được PDF.');
    }
  }

  async function createPoster() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const bytes = await createPosterPdf(await file.arrayBuffer(), { xFactor, yFactor, pageSize, rightToLeft });
      const base = file.name.replace(/\.pdf$/i, '') || 'document';
      downloadPdf(bytes, `${base}-poster.pdf`);
      setResult(`Đã tạo ${outputPages} tờ ${pageSize} từ ${pageCount} trang nguồn.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo Poster PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Trên thiết bị · Không upload file</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">LAYOUT · V1.2</p>
      <h1>Poster PDF · Chia trang để in ghép</h1>
      <p className="subtitle">Chia mỗi trang lớn thành lưới nhiều tờ giấy tiêu chuẩn để in rồi ghép thành poster, vẫn giữ nội dung vector/text.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label className="field"><span>Số cột</span><input type="number" min="1" max="8" step="1" value={xFactor} onChange={(event)=>setXFactor(Number(event.target.value))}/></label>
        <label className="field"><span>Số hàng</span><input type="number" min="1" max="8" step="1" value={yFactor} onChange={(event)=>setYFactor(Number(event.target.value))}/></label>
        <label className="field"><span>Khổ giấy đầu ra</span><select value={pageSize} onChange={(event)=>setPageSize(event.target.value as PosterPageSize)}>{PAGE_SIZES.map((size)=><option key={size} value={size}>{size}</option>)}</select></label>
        <label className="field"><span>Thứ tự cột</span><select value={rightToLeft ? 'rtl' : 'ltr'} onChange={(event)=>setRightToLeft(event.target.value === 'rtl')}><option value="ltr">Trái → phải</option><option value="rtl">Phải → trái</option></select></label>
      </div>
      {file && <div className="result-box"><strong>Preview</strong><p>{pageCount} trang nguồn × {xFactor}×{yFactor} = <strong>{outputPages} tờ {pageSize}</strong>.</p><p>Mỗi trang được chuẩn hóa theo CropBox và rotation trước khi chia lưới; hàng được xuất từ trên xuống dưới.</p></div>}
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn: 100 MB, {MAX_POSTER_SOURCE_PAGES} trang nguồn và {MAX_POSTER_OUTPUT_PAGES} tờ đầu ra. Poster PDF tạo trang mới nên form/annotation tương tác không được giữ như điều khiển tương tác.</p>
      {tooManyOutputs && <div className="error">Cấu hình hiện tạo {outputPages} tờ, vượt giới hạn {MAX_POSTER_OUTPUT_PAGES}.</div>}
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={createPoster} disabled={!file || busy || invalidGrid || tooManyOutputs}>{busy ? 'Đang tạo poster…' : 'Tạo Poster PDF'}</button>
    </section>
  </main>;
}
