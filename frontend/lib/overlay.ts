import { degrees, PDFDocument, PDFEmbeddedPage } from 'pdf-lib';
import { embedVisiblePage, fitSourcePageToBox, MAX_LAYOUT_SOURCE_PAGES, NUpSourcePage } from './n-up';

export type OverlayMode = 'repeat-first' | 'match-pages';

export type OverlayOptions = {
  mode: OverlayMode;
  opacity: number;
  margin: number;
};

const MAX_MARGIN = 144;

function validateOptions(options: OverlayOptions) {
  if (!Number.isFinite(options.opacity) || options.opacity <= 0 || options.opacity > 1) {
    throw new Error('Độ mờ overlay phải lớn hơn 0 và không vượt quá 1.');
  }
  if (!Number.isFinite(options.margin) || options.margin < 0 || options.margin > MAX_MARGIN) {
    throw new Error(`Lề overlay phải từ 0 đến ${MAX_MARGIN} pt.`);
  }
}

function descriptor(page: { getCropBox(): { width: number; height: number }; getRotation(): { angle: number } }): NUpSourcePage {
  const crop = page.getCropBox();
  return { width: crop.width, height: crop.height, rotation: page.getRotation().angle };
}

function overlayIndex(baseIndex: number, overlayCount: number, mode: OverlayMode): number | null {
  if (overlayCount < 1) return null;
  if (mode === 'repeat-first') return 0;
  return baseIndex < overlayCount ? baseIndex : null;
}

export async function createOverlayPdf(
  baseBytes: ArrayBuffer | Uint8Array,
  overlayBytes: ArrayBuffer | Uint8Array,
  options: OverlayOptions,
): Promise<Uint8Array> {
  validateOptions(options);
  const base = await PDFDocument.load(baseBytes);
  const overlay = await PDFDocument.load(overlayBytes);
  if (!base.getPageCount()) throw new Error('PDF nền không có trang.');
  if (!overlay.getPageCount()) throw new Error('PDF overlay không có trang.');
  if (base.getPageCount() > MAX_LAYOUT_SOURCE_PAGES || overlay.getPageCount() > MAX_LAYOUT_SOURCE_PAGES) {
    throw new Error(`Overlay giới hạn ${MAX_LAYOUT_SOURCE_PAGES} trang cho mỗi PDF.`);
  }

  const output = await PDFDocument.create();
  const basePages = await output.copyPages(base, base.getPageIndices());
  basePages.forEach((page) => output.addPage(page));

  const overlayPages = overlay.getPages();
  const embedded: PDFEmbeddedPage[] = [];
  for (const page of overlayPages) embedded.push(await embedVisiblePage(output, page));
  const overlayDescriptors = overlayPages.map(descriptor);

  for (let baseIndex = 0; baseIndex < output.getPageCount(); baseIndex += 1) {
    const sourceIndex = overlayIndex(baseIndex, overlayPages.length, options.mode);
    if (sourceIndex === null) continue;

    const page = output.getPage(baseIndex);
    const crop = page.getCropBox();
    const fit = fitSourcePageToBox(
      overlayDescriptors[sourceIndex],
      { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
      options.margin,
      sourceIndex + 1,
    );
    page.drawPage(embedded[sourceIndex], {
      x: fit.drawX,
      y: fit.drawY,
      xScale: fit.scale,
      yScale: fit.scale,
      rotate: degrees(fit.rotation),
      opacity: options.opacity,
    });
  }

  return output.save({ useObjectStreams: true });
}
