'use client';

import { ChangeEvent, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadPdf } from '../../lib/pdf-client';
import {
  applyScannerPixelEffects,
  deterministicScannerRotation,
  SCANNER_QUALITY_PRESETS,
  scannerPageSeed,
} from '../../lib/scanner-effect';
import type { ScannerColorspace, ScannerQuality, ScannerRotation } from '../../lib/scanner-effect';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PAGE_COUNT = 100;
const MAX_SINGLE_PAGE_PIXELS = 25_000_000;
const MAX_EFFECT_CANVAS_PIXELS = 32_000_000;
const MAX_TOTAL_PIXELS = 150_000_000;
const MAX_BORDER = 80;

const QUALITY_LABELS: Record<ScannerQuality, string> = {
  high: 'High · 150 DPI · nhẹ',
  medium: 'Medium · 100 DPI · rõ chất scan',
  low: 'Low · 75 DPI · mềm/nhiễu hơn',
};

const ROTATION_LABELS: Record<ScannerRotation, string> = {
  none: 'Không lệch',
  slight: 'Nhẹ · ±2°',
  moderate: 'Vừa · ±5°',
  severe: 'Mạnh · ±8°',
};

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Không thể tạo ảnh scan PNG từ trang.')),
    'image/png',
  ));
}

function paperGradient(context: CanvasRenderingContext2D, width: number, height: number, yellowish: boolean, vertical: boolean) {
  const gradient = vertical
    ? context.createLinearGradient(0, 0, 0, height)
    : context.createLinearGradient(0, 0, width, 0);
  if (yellowish) {
    gradient.addColorStop(0, '#ded5b6');
    gradient.addColorStop(1, '#f4edcf');
  } else {
    gradient.addColorStop(0, '#d9d9d9');
    gradient.addColorStop(1, '#eeeeee');
  }
  return gradient;
}

function rotatedCanvas(source: HTMLCanvasElement, angleDegrees: number, yellowish: boolean, vertical: boolean): HTMLCanvasElement {
  if (Math.abs(angleDegrees) < 0.0001) return source;
  const radians = angleDegrees * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = Math.ceil(source.width * cos + source.height * sin);
  const height = Math.ceil(source.height * cos + source.width * sin);
  if (width * height > MAX_EFFECT_CANVAS_PIXELS) throw new Error('Canvas sau khi xoay vượt giới hạn 32 triệu pixel; hãy dùng chất lượng thấp hơn hoặc tách PDF.');

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas 2D không khả dụng.');
  context.fillStyle = paperGradient(context, width, height, yellowish, vertical);
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return output;
}

export default function ScannerEffectPage() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<ScannerQuality>('high');
  const [rotation, setRotation] = useState<ScannerRotation>('slight');
  const [colorspace, setColorspace] = useState<ScannerColorspace>('grayscale');
  const [border, setBorder] = useState(20);
  const [yellowish, setYellowish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB cho Scanner Effect local.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setProgress('');
    setError('');
  }

  async function createScannerEffect() {
    if (!file) return;
    if (!Number.isInteger(border) || border < 0 || border > MAX_BORDER) {
      setError(`Viền scan phải từ 0 đến ${MAX_BORDER} pixel.`);
      return;
    }

    setBusy(true);
    setProgress('');
    setError('');
    try {
      const preset = SCANNER_QUALITY_PRESETS[quality];
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const source = await task.promise;
      try {
        if (source.numPages > MAX_PAGE_COUNT) throw new Error(`PDF vượt giới hạn ${MAX_PAGE_COUNT} trang cho Scanner Effect raster.`);
        const output = await PDFDocument.create();
        const scale = preset.dpi / 72;
        let totalPixels = 0;

        for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
          setProgress(`Đang mô phỏng scan trang ${pageNumber}/${source.numPages} · ${QUALITY_LABELS[quality]}…`);
          const page = await source.getPage(pageNumber);
          const physicalViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale });
          const width = Math.ceil(viewport.width);
          const height = Math.ceil(viewport.height);
          const pixels = width * height;
          if (pixels > MAX_SINGLE_PAGE_PIXELS) throw new Error(`Trang ${pageNumber} vượt giới hạn 25 triệu pixel ở ${preset.dpi} DPI.`);
          totalPixels += pixels;
          if (totalPixels > MAX_TOTAL_PIXELS) throw new Error('Tổng raster vượt giới hạn 150 triệu pixel; hãy giảm chất lượng hoặc tách PDF trước.');

          const baseCanvas = document.createElement('canvas');
          baseCanvas.width = width;
          baseCanvas.height = height;
          const baseContext = baseCanvas.getContext('2d', { willReadFrequently: true });
          if (!baseContext) throw new Error('Canvas 2D không khả dụng.');
          await page.render({ canvas: baseCanvas, canvasContext: baseContext, viewport, background: '#ffffff' }).promise;

          const imageData = baseContext.getImageData(0, 0, width, height);
          imageData.data.set(applyScannerPixelEffects(imageData.data, width, height, {
            colorspace,
            brightness: preset.brightness,
            contrast: preset.contrast,
            noise: preset.noise,
            yellowish,
            seed: scannerPageSeed(pageNumber - 1),
          }));
          baseContext.putImageData(imageData, 0, 0);

          const softenedCanvas = document.createElement('canvas');
          softenedCanvas.width = width;
          softenedCanvas.height = height;
          const softenedContext = softenedCanvas.getContext('2d');
          if (!softenedContext) throw new Error('Canvas 2D không khả dụng.');
          const blurPixels = preset.blur * Math.min(width, height) / 1000;
          softenedContext.filter = blurPixels > 0 ? `blur(${blurPixels.toFixed(3)}px)` : 'none';
          softenedContext.drawImage(baseCanvas, 0, 0);
          softenedContext.filter = 'none';

          const framedWidth = width + border * 2;
          const framedHeight = height + border * 2;
          if (framedWidth * framedHeight > MAX_EFFECT_CANVAS_PIXELS) throw new Error('Canvas có viền vượt giới hạn 32 triệu pixel; hãy giảm viền/chất lượng hoặc tách PDF.');
          const framedCanvas = document.createElement('canvas');
          framedCanvas.width = framedWidth;
          framedCanvas.height = framedHeight;
          const framedContext = framedCanvas.getContext('2d');
          if (!framedContext) throw new Error('Canvas 2D không khả dụng.');
          const verticalGradient = pageNumber % 2 === 1;
          framedContext.fillStyle = paperGradient(framedContext, framedWidth, framedHeight, yellowish, verticalGradient);
          framedContext.fillRect(0, 0, framedWidth, framedHeight);
          framedContext.drawImage(softenedCanvas, border, border);

          const angle = deterministicScannerRotation(pageNumber - 1, rotation);
          const finalCanvas = rotatedCanvas(framedCanvas, angle, yellowish, !verticalGradient);
          const pngBlob = await blobFromCanvas(finalCanvas);
          const png = await output.embedPng(await pngBlob.arrayBuffer());
          const outputPage = output.addPage([physicalViewport.width, physicalViewport.height]);
          const fit = Math.min(physicalViewport.width / finalCanvas.width, physicalViewport.height / finalCanvas.height);
          const drawWidth = finalCanvas.width * fit;
          const drawHeight = finalCanvas.height * fit;
          outputPage.drawImage(png, {
            x: (physicalViewport.width - drawWidth) / 2,
            y: (physicalViewport.height - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight,
          });

          baseCanvas.width = 1;
          baseCanvas.height = 1;
          softenedCanvas.width = 1;
          softenedCanvas.height = 1;
          framedCanvas.width = 1;
          framedCanvas.height = 1;
          if (finalCanvas !== framedCanvas) {
            finalCanvas.width = 1;
            finalCanvas.height = 1;
          }
        }

        setProgress('Đang đóng gói PDF scan-effect…');
        downloadPdf(await output.save({ useObjectStreams: true }), 'solyan-scanner-effect.pdf');
        setProgress(`Hoàn tất ${source.numPages} trang · ${QUALITY_LABELS[quality]} · ${colorspace === 'grayscale' ? 'grayscale' : 'color'} · deterministic.`);
      } finally {
        await task.destroy();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo Scanner Effect.');
    } finally {
      setBusy(false);
    }
  }

  const preset = SCANNER_QUALITY_PRESETS[quality];

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Local · PDF.js + Canvas + pdf-lib</div></header>
    <section className="hero compact-hero"><p className="eyebrow">V1.4 · RASTER EFFECT</p><h1>Scanner Effect</h1><p className="subtitle">Mô phỏng tài liệu đã scan bằng raster, contrast/brightness, nhiễu nhẹ, blur, viền giấy và lệch góc tái lập được.</p><label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label></section>
    <section className="workspace form-workspace">
      <div className="error"><strong>Cảnh báo rasterized:</strong> đầu ra không giữ text/vector/form/annotation tương tác. Scanner Effect chỉ mô phỏng hình ảnh scan; không phải OCR, không tăng tính xác thực tài liệu và không nên dùng để giả mạo nguồn gốc tài liệu.</div>
      <label className="field"><span>Chất lượng scan</span><select value={quality} onChange={(event)=>setQuality(event.target.value as ScannerQuality)}>{(Object.keys(QUALITY_LABELS) as ScannerQuality[]).map((value)=><option value={value} key={value}>{QUALITY_LABELS[value]}</option>)}</select></label>
      <label className="field"><span>Màu đầu ra</span><select value={colorspace} onChange={(event)=>setColorspace(event.target.value as ScannerColorspace)}><option value="grayscale">Grayscale · kiểu scan tài liệu</option><option value="color">Color · giữ màu</option></select></label>
      <label className="field"><span>Độ lệch trang</span><select value={rotation} onChange={(event)=>setRotation(event.target.value as ScannerRotation)}>{(Object.keys(ROTATION_LABELS) as ScannerRotation[]).map((value)=><option value={value} key={value}>{ROTATION_LABELS[value]}</option>)}</select></label>
      <label className="field"><span>Viền scan: {border}px</span><input type="range" min="0" max={MAX_BORDER} step="1" value={border} onChange={(event)=>setBorder(Number(event.target.value))}/></label>
      <label className="field"><span><input type="checkbox" checked={yellowish} onChange={(event)=>setYellowish(event.target.checked)}/> Giấy hơi ngả vàng</span></label>
      <div className="result-box">Preset hiện tại: {preset.dpi} DPI · brightness {preset.brightness.toFixed(2)} · contrast {preset.contrast.toFixed(2)} · blur {preset.blur.toFixed(2)} · noise {preset.noise.toFixed(1)}.</div>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn: 100 MB · 100 trang · 25 triệu pixel/trang · 32 triệu pixel/canvas hiệu ứng · 150 triệu pixel tổng. Mỗi trang xử lý tuần tự. Noise và góc lệch dùng seed theo số trang nên cùng input/preset cho kết quả tái lập.</p>
      {progress && <div className="result-box">{progress}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" disabled={!file || busy} onClick={createScannerEffect}>{busy ? 'Đang xử lý…' : 'Tạo PDF Scanner Effect'}</button>
    </section>
  </main>;
}
