'use client';

import { ChangeEvent, useState } from 'react';
import {
  AutoRedactMatch,
  SAFE_AUTO_REDACT_PRESETS,
  compileSafeAutoRedactPatterns,
  findAutoRedactMatches,
  findSafeRegexAutoRedactMatches,
  normalizeAutoRedactTerms,
} from '../../lib/auto-redact';
import { downloadPdf } from '../../lib/pdf-client';
import { RasterizedPageReplacement, rebuildPdfWithRasterizedPages } from '../../lib/secure-redaction';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PAGE_COUNT = 500;
const MAX_TERMS = 20;
const MAX_TERM_LENGTH = 200;
const MAX_TEXT_ITEMS = 100_000;
const MAX_MATCHES = 500;
const MAX_REDACTED_PAGES = 40;
const SECURE_REDACTION_DPI = 150;
const MAX_REDACTION_PIXELS_PER_PAGE = 25_000_000;
const MAX_TOTAL_REDACTION_PIXELS = 80_000_000;

type MatchMode = 'literal' | 'safe_regex';

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Không thể tạo raster PNG cho Auto Redact.')),
    'image/png',
  ));
}

export default function AutoRedactPage() {
  const [file, setFile] = useState<File | null>(null);
  const [termsText, setTermsText] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('literal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho Auto Redact local.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setProgress('');
    setError('');
  }

  function appendPreset(token: keyof typeof SAFE_AUTO_REDACT_PRESETS) {
    setTermsText((current) => {
      const lines = current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!lines.includes(token)) lines.push(token);
      return lines.join('\n');
    });
    setError('');
  }

  async function runAutoRedact() {
    if (!file) return;
    const terms = normalizeAutoRedactTerms(termsText, caseSensitive);
    if (terms.length === 0) {
      setError(matchMode === 'safe_regex' ? 'Hãy nhập ít nhất một Safe Regex hoặc preset cần che.' : 'Hãy nhập ít nhất một từ hoặc cụm từ cần che.');
      return;
    }
    if (terms.length > MAX_TERMS) {
      setError(`Tối đa ${MAX_TERMS} mục trong một lần xử lý.`);
      return;
    }
    if (terms.some((term) => term.length > MAX_TERM_LENGTH)) {
      setError(`Mỗi mục tối đa ${MAX_TERM_LENGTH} ký tự.`);
      return;
    }

    let safePatterns: ReturnType<typeof compileSafeAutoRedactPatterns> = [];
    if (matchMode === 'safe_regex') {
      try {
        safePatterns = compileSafeAutoRedactPatterns(terms, caseSensitive);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Safe Regex không hợp lệ.');
        return;
      }
    }

    setBusy(true);
    setError('');
    setProgress('Đang đọc text layer bằng PDF.js…');
    let destroyTask: (() => Promise<void>) | null = null;
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = pdfjs.getDocument({ data: sourceBytes.slice() });
      destroyTask = () => task.destroy();
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PAGE_COUNT) throw new Error(`PDF vượt giới hạn ${MAX_PAGE_COUNT} trang cho Auto Redact local.`);

      const matchesByPage = new Map<number, AutoRedactMatch[]>();
      let totalMatches = 0;
      let textItems = 0;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setProgress(`Đang ${matchMode === 'safe_regex' ? 'khớp Safe Regex' : 'tìm nội dung'} cần che · trang ${pageNumber}/${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageTextItems = Array.isArray(textContent.items)
          ? textContent.items.filter((item: any) => typeof item?.str === 'string' && item.str.trim()).length
          : 0;
        textItems += pageTextItems;
        if (textItems > MAX_TEXT_ITEMS) {
          throw new Error(`PDF vượt giới hạn ${MAX_TEXT_ITEMS.toLocaleString('vi-VN')} text-run cho Auto Redact local. Hãy chia tài liệu thành phần nhỏ hơn.`);
        }
        const viewport = page.getViewport({ scale: 1 });
        const matches = matchMode === 'safe_regex'
          ? findSafeRegexAutoRedactMatches(textContent, viewport, safePatterns)
          : findAutoRedactMatches(textContent, viewport, terms, caseSensitive);
        if (matches.length === 0) continue;
        totalMatches += matches.length;
        if (totalMatches > MAX_MATCHES) throw new Error(`Vượt giới hạn ${MAX_MATCHES} text-run cần redact. Hãy chia tài liệu hoặc giảm số mục.`);
        matchesByPage.set(pageNumber, matches);
        if (matchesByPage.size > MAX_REDACTED_PAGES) throw new Error(`Vượt giới hạn ${MAX_REDACTED_PAGES} trang redact trong một lần xử lý.`);
      }

      if (totalMatches === 0) {
        if (textItems === 0) throw new Error('PDF không có text layer để Auto Redact. Với tài liệu scan, hãy OCR trước rồi chạy lại.');
        throw new Error(matchMode === 'safe_regex'
          ? 'Không tìm thấy Safe Regex/preset đã nhập trong các text-run của PDF. Pattern không khớp xuyên qua nhiều PDF text-run.'
          : 'Không tìm thấy cụm từ đã nhập trong các text-run của PDF. Cụm từ bị tách qua nhiều text-run có thể cần nhập thành các phần ngắn hơn.');
      }

      const replacements: RasterizedPageReplacement[] = [];
      let totalPixels = 0;
      let completed = 0;
      const renderScale = SECURE_REDACTION_DPI / 72;

      for (const [pageNumber, matches] of matchesByPage) {
        completed += 1;
        setProgress(`Đang rasterize an toàn trang ${pageNumber} · ${completed}/${matchesByPage.size}…`);
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: renderScale });
        const canvasWidth = Math.ceil(viewport.width);
        const canvasHeight = Math.ceil(viewport.height);
        const pixels = canvasWidth * canvasHeight;
        if (pixels > MAX_REDACTION_PIXELS_PER_PAGE) {
          throw new Error(`Trang ${pageNumber} vượt giới hạn 25 triệu pixel ở ${SECURE_REDACTION_DPI} DPI.`);
        }
        totalPixels += pixels;
        if (totalPixels > MAX_TOTAL_REDACTION_PIXELS) {
          throw new Error('Tổng vùng raster vượt giới hạn 80 triệu pixel. Hãy chia PDF thành phần nhỏ hơn.');
        }

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D không khả dụng.');
        await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;

        const scaleX = viewport.width / baseViewport.width;
        const scaleY = viewport.height / baseViewport.height;
        context.save();
        context.fillStyle = '#000000';
        for (const match of matches) {
          const left = Math.max(0, match.rect.x * scaleX);
          const top = Math.max(0, match.rect.y * scaleY);
          const width = Math.min(canvasWidth - left, match.rect.width * scaleX);
          const height = Math.min(canvasHeight - top, match.rect.height * scaleY);
          if (width > 0 && height > 0) context.fillRect(left, top, width, height);
        }
        context.restore();

        const png = await blobFromCanvas(canvas);
        replacements.push({
          pageIndex: pageNumber - 1,
          pngBytes: new Uint8Array(await png.arrayBuffer()),
          pageWidth: baseViewport.width,
          pageHeight: baseViewport.height,
        });
        canvas.width = 1;
        canvas.height = 1;
      }

      setProgress('Đang dựng lại PDF không mang theo content stream gốc của các trang đã redact…');
      const output = await rebuildPdfWithRasterizedPages(sourceBytes, replacements);
      downloadPdf(output, 'solyan-auto-redacted.pdf');
      setProgress(`Hoàn tất: ${totalMatches} text-run trên ${matchesByPage.size} trang đã được che và rasterize an toàn ở ${SECURE_REDACTION_DPI} DPI.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể Auto Redact PDF.');
    } finally {
      if (destroyTask) await destroyTask().catch(() => undefined);
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js · Secure raster redaction</div></header>
    <section className="hero compact-hero"><p className="eyebrow">V1.5 · SECURITY</p><h1>Tự động redact theo nội dung</h1><p className="subtitle">Tìm literal hoặc Safe Regex trong text layer, che toàn bộ text-run chứa nội dung khớp rồi rasterize chỉ các trang bị ảnh hưởng để không copy content stream gốc.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <label className="field"><span>Kiểu tìm kiếm</span><select value={matchMode} onChange={(event)=>{ setMatchMode(event.target.value as MatchMode); setError(''); setProgress(''); }}><option value="literal">Literal · từ/cụm từ chính xác</option><option value="safe_regex">Safe Regex · pattern giới hạn chống ReDoS</option></select></label>
      <label className="field"><span>{matchMode === 'safe_regex' ? 'Safe Regex / preset cần che · mỗi dòng một mục' : 'Từ / cụm từ cần che · mỗi dòng một mục'}</span><textarea rows={7} value={termsText} onChange={(event)=>setTermsText(event.target.value)} placeholder={matchMode === 'safe_regex' ? '<EMAIL>\n\\d{3}-\\d{2}-\\d{4}\n[A-Z]{2}\\d{6}' : 'Số căn cước\nMã khách hàng\nSECRET-842'}/></label>
      {matchMode === 'safe_regex' && <div className="result-box"><strong>Preset an toàn</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{(Object.keys(SAFE_AUTO_REDACT_PRESETS) as Array<keyof typeof SAFE_AUTO_REDACT_PRESETS>).map((token)=><button className="secondary-button" type="button" key={token} onClick={()=>appendPreset(token)}>{token}</button>)}</div><p style={{ marginBottom: 0, marginTop: 10 }}><code>&lt;EMAIL&gt;</code> · <code>&lt;CARD&gt;</code> · <code>&lt;SSN&gt;</code> · <code>&lt;VN_PHONE&gt;</code> · <code>&lt;IBAN&gt;</code></p></div>}
      <label className="field"><span><input type="checkbox" checked={caseSensitive} onChange={(event)=>setCaseSensitive(event.target.checked)}/> Phân biệt chữ hoa / chữ thường</span></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <div className="error"><strong>Secure Auto Redact:</strong> công cụ che toàn bộ text-run chứa nội dung khớp, vì vậy có thể che rộng hơn chính xác chuỗi/pattern. Trang có match sẽ rasterize 150 DPI và được dựng lại mà không mang theo content stream gốc; text/vector/form/annotation tương tác trên trang đó sẽ mất. PDF scan không có text layer cần OCR trước.</div>
      {matchMode === 'safe_regex' && <p className="hint"><strong>Safe Regex subset:</strong> pattern tùy chỉnh tối đa 200 ký tự; không hỗ trợ group/lookaround, backreference, <code>*</code>, <code>+</code> hay <code>{'{m,}'}</code>. Dùng <code>?</code> và quantifier hữu hạn <code>{'{m}'}</code>/<code>{'{m,n}'}</code> với n ≤ 64. Các preset trên là pattern nội bộ đã được kiểm soát. Regex chỉ chạy trên từng text-run, không nối toàn tài liệu.</p>}
      <p className="hint">Giới hạn: 100 MB · 500 trang · 100.000 text-run · 20 mục · 500 text-run match · 40 trang redact · 25 triệu pixel/trang · 80 triệu pixel tổng. Match không vượt qua ranh giới giữa các PDF text-run.</p>
      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" disabled={!file || busy || !termsText.trim()} onClick={runAutoRedact}>{busy ? 'Đang xử lý…' : 'Tự động redact an toàn và tải PDF'}</button>
    </section>
  </main>;
}
