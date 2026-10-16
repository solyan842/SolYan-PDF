'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument, PDFImage } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';
import { type PdfImageColorMode, applyCanvasColorMode, canvasToImageBlob } from '../../lib/pdf-image-export';
import { type ImagesToPdfFitMode, imagePagePlacement } from '../../lib/images-to-pdf';

type ImageItem = { id: string; file: File };

const MAX_IMAGES = 200;
const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_INPUT_SIZE = 100 * 1024 * 1024;
const MAX_TRANSFORM_PIXELS_PER_IMAGE = 25_000_000;
const MAX_TOTAL_TRANSFORM_PIXELS = 80_000_000;
const TWO_COLUMN_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 } as const;

function isSupportedImage(file: File): boolean {
  return /image\/(png|jpeg)/i.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
}

function isPng(file: File): boolean {
  return file.type.toLowerCase() === 'image/png' || file.name.toLowerCase().endsWith('.png');
}

async function embedOriginalImage(pdf: PDFDocument, file: File): Promise<PDFImage> {
  const bytes = await file.arrayBuffer();
  return isPng(file) ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

async function embedTransformedImage(
  pdf: PDFDocument,
  file: File,
  colorMode: Exclude<PdfImageColorMode, 'color'>,
): Promise<{ image: PDFImage; pixels: number }> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Trình duyệt này không hỗ trợ createImageBitmap để chuyển Greyscale/B&W. Hãy dùng Color hoặc trình duyệt mới hơn.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const pixels = bitmap.width * bitmap.height;
    if (pixels > MAX_TRANSFORM_PIXELS_PER_IMAGE) {
      throw new Error(`Ảnh ${file.name} vượt giới hạn 25 triệu pixel cho chuyển Greyscale/B&W.`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D không khả dụng.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    applyCanvasColorMode(context, canvas.width, canvas.height, colorMode);
    const blob = await canvasToImageBlob(canvas, 'png');
    canvas.width = 1;
    canvas.height = 1;
    return { image: await pdf.embedPng(await blob.arrayBuffer()), pixels };
  } finally {
    bitmap.close();
  }
}

export default function ImagesToPdfPage() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [fitMode, setFitMode] = useState<ImagesToPdfFitMode>('image_size');
  const [autoRotate, setAutoRotate] = useState(true);
  const [colorMode, setColorMode] = useState<PdfImageColorMode>('color');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    setError('');
    setProgress('');
    if (!selected.length) return;

    const unsupported = selected.find((file) => !isSupportedImage(file));
    if (unsupported) {
      setError(`Không hỗ trợ ${unsupported.name}. Chỉ nhận PNG/JPG/JPEG.`);
      return;
    }
    const oversized = selected.find((file) => file.size > MAX_SINGLE_FILE_SIZE);
    if (oversized) {
      setError(`${oversized.name} vượt giới hạn 50 MB/ảnh.`);
      return;
    }

    setItems((current) => {
      const next = [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), file }))];
      if (next.length > MAX_IMAGES) {
        setError(`Tối đa ${MAX_IMAGES} ảnh trong một PDF.`);
        return current;
      }
      const totalSize = next.reduce((sum, item) => sum + item.file.size, 0);
      if (totalSize > MAX_TOTAL_INPUT_SIZE) {
        setError('Tổng dung lượng ảnh vượt giới hạn 100 MB.');
        return current;
      }
      return next;
    });
  }

  function move(index: number, delta: -1 | 1) {
    setItems((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  async function createPdf() {
    if (!items.length) return;
    setBusy(true);
    setError('');
    setProgress('');
    try {
      const pdf = await PDFDocument.create();
      let transformedPixels = 0;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setProgress(`Đang xử lý ảnh ${index + 1}/${items.length}: ${item.file.name}`);
        let image: PDFImage;
        if (colorMode === 'color') {
          image = await embedOriginalImage(pdf, item.file);
        } else {
          const transformed = await embedTransformedImage(pdf, item.file, colorMode);
          transformedPixels += transformed.pixels;
          if (transformedPixels > MAX_TOTAL_TRANSFORM_PIXELS) {
            throw new Error('Tổng ảnh cần chuyển Greyscale/B&W vượt 80 triệu pixel. Hãy chia thành nhiều PDF hoặc dùng Color.');
          }
          image = transformed.image;
        }

        const placement = imagePagePlacement(image.width, image.height, fitMode, autoRotate);
        const page = pdf.addPage([placement.pageWidth, placement.pageHeight]);
        page.drawImage(image, {
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        });
      }

      setProgress('Đang ghi PDF…');
      downloadPdf(await pdf.save({ useObjectStreams: true }), 'solyan-images.pdf');
      setProgress(`Hoàn tất: ${items.length} ảnh · ${fitMode === 'image_size' ? 'kích thước ảnh' : fitMode === 'a4_fill' ? 'A4 Fill' : 'A4 Fit'} · ${colorMode}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo PDF từ ảnh.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · pdf-lib · Canvas</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">V1.5 · IMAGES → PDF</p>
      <h1>Ảnh → PDF</h1>
      <p className="subtitle">Ghép PNG/JPG theo thứ tự, chọn kích thước trang hoặc A4, tự xoay theo chiều ảnh và chuyển Color/Greyscale/B&W ngay trên thiết bị.</p>
      <label className="picker"><input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple onChange={onFiles}/><span>+ Chọn ảnh</span></label>
    </section>

    <section className="workspace">
      <div style={TWO_COLUMN_STYLE}>
        <label className="field"><span>Kiểu đặt ảnh</span><select value={fitMode} onChange={(event)=>setFitMode(event.target.value as ImagesToPdfFitMode)} disabled={busy}>
          <option value="image_size">Kích thước ảnh · giữ hành vi cũ</option>
          <option value="a4_fit">A4 Fit · giữ tỷ lệ, căn giữa</option>
          <option value="a4_fill">A4 Fill · kéo đầy trang</option>
        </select></label>
        <label className="field"><span>Màu</span><select value={colorMode} onChange={(event)=>setColorMode(event.target.value as PdfImageColorMode)} disabled={busy}>
          <option value="color">Color · giữ dữ liệu ảnh gốc</option>
          <option value="greyscale">Greyscale</option>
          <option value="blackwhite">Black &amp; White</option>
        </select></label>
      </div>

      <label className="field"><span><input type="checkbox" checked={autoRotate} onChange={(event)=>setAutoRotate(event.target.checked)} disabled={busy || fitMode === 'image_size'}/> Tự xoay trang A4 ngang khi ảnh landscape</span><small>Chỉ áp dụng cho A4 Fit/Fill. Chế độ Kích thước ảnh luôn dùng đúng chiều ảnh.</small></label>

      <div className="workspace-head"><div><h2>Thứ tự ảnh</h2><p>{items.length} ảnh · {(items.reduce((sum, item)=>sum + item.file.size, 0)/1024/1024).toFixed(1)} MB</p></div>{items.length > 0 && <button className="ghost" type="button" onClick={()=>{ setItems([]); setProgress(''); setError(''); }} disabled={busy}>Xóa tất cả</button>}</div>
      {items.length === 0 ? <div className="empty">Chưa có ảnh.</div> : <ol className="file-list">{items.map((item,index)=><li className="file-row" key={item.id}><div className="file-index">{index+1}</div><div className="file-meta"><strong>{item.file.name}</strong><span>{(item.file.size/1024).toFixed(0)} KB</span></div><div className="row-actions"><button onClick={()=>move(index,-1)} disabled={index===0||busy}>↑</button><button onClick={()=>move(index,1)} disabled={index===items.length-1||busy}>↓</button><button onClick={()=>setItems((current)=>current.filter((x)=>x.id!==item.id))} disabled={busy}>×</button></div></li>)}</ol>}

      {fitMode === 'a4_fill' && <div className="error"><strong>A4 Fill:</strong> ảnh sẽ bị kéo đúng kích thước trang A4 nên có thể thay đổi tỷ lệ. Dùng A4 Fit nếu muốn giữ nguyên tỷ lệ ảnh.</div>}
      <p className="hint">Giới hạn: PNG/JPG/JPEG · 200 ảnh · 50 MB/ảnh · 100 MB tổng. Greyscale/B&W cần decode Canvas và bị giới hạn 25 triệu pixel/ảnh, 80 triệu pixel tổng. Color giữ nguyên stream PNG/JPEG khi embed, tránh re-encode không cần thiết.</p>
      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={createPdf} disabled={!items.length || busy}>{busy ? 'Đang tạo PDF…' : 'Tạo PDF'}</button>
    </section>
  </main>;
}
