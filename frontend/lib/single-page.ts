import { degrees, PDFDocument, PDFEmbeddedPage } from 'pdf-lib';
import { embedVisiblePage, fitSourcePageToBox, MAX_LAYOUT_SOURCE_PAGES, normalizePageRotation, NUpSourcePage } from './n-up';

export type SinglePageOptions = {
  gap: number;
  margin: number;
};

export type SinglePagePlan = {
  width: number;
  height: number;
  scale: number;
  placements: Array<{
    sourceIndex: number;
    box: { x: number; y: number; width: number; height: number };
  }>;
};

const MAX_PDF_DIMENSION = 14400;
const MAX_GAP = 144;
const MAX_MARGIN = 144;

function displayedSize(source: NUpSourcePage) {
  const rotation = normalizePageRotation(source.rotation);
  return rotation === 90 || rotation === 270
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

function validateOptions(options: SinglePageOptions) {
  if (!Number.isFinite(options.gap) || options.gap < 0 || options.gap > MAX_GAP) {
    throw new Error(`Khoảng cách phải từ 0 đến ${MAX_GAP} pt.`);
  }
  if (!Number.isFinite(options.margin) || options.margin < 0 || options.margin > MAX_MARGIN) {
    throw new Error(`Lề phải từ 0 đến ${MAX_MARGIN} pt.`);
  }
}

export function planSinglePage(sourcePages: NUpSourcePage[], options: SinglePageOptions): SinglePagePlan {
  validateOptions(options);
  if (!sourcePages.length) throw new Error('PDF không có trang.');
  if (sourcePages.length > MAX_LAYOUT_SOURCE_PAGES) throw new Error(`Một trang dài giới hạn ${MAX_LAYOUT_SOURCE_PAGES} trang nguồn.`);

  const displayed = sourcePages.map((page, index) => {
    const size = displayedSize(page);
    if (!(size.width > 0 && size.height > 0)) throw new Error(`Trang ${index + 1} có kích thước không hợp lệ.`);
    return size;
  });
  const naturalWidth = Math.max(...displayed.map((size) => size.width));
  const naturalHeight = displayed.reduce((sum, size) => sum + size.height, 0) + options.gap * Math.max(0, displayed.length - 1);
  const maxContentWidth = MAX_PDF_DIMENSION - 2 * options.margin;
  const maxContentHeight = MAX_PDF_DIMENSION - 2 * options.margin;
  if (!(maxContentWidth > 0 && maxContentHeight > 0)) throw new Error('Lề quá lớn so với giới hạn kích thước PDF.');

  const scale = Math.min(1, maxContentWidth / naturalWidth, maxContentHeight / naturalHeight);
  const contentWidth = naturalWidth * scale;
  const contentHeight = naturalHeight * scale;
  const width = contentWidth + 2 * options.margin;
  const height = contentHeight + 2 * options.margin;

  let top = height - options.margin;
  const placements = displayed.map((size, sourceIndex) => {
    const pageHeight = size.height * scale;
    top -= pageHeight;
    const box = { x: options.margin, y: top, width: contentWidth, height: pageHeight };
    top -= options.gap * scale;
    return { sourceIndex, box };
  });

  return { width, height, scale, placements };
}

export async function createSinglePagePdf(
  sourceBytes: ArrayBuffer | Uint8Array,
  options: SinglePageOptions,
): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes);
  const pages = source.getPages();
  if (pages.length > MAX_LAYOUT_SOURCE_PAGES) throw new Error(`Một trang dài giới hạn ${MAX_LAYOUT_SOURCE_PAGES} trang nguồn.`);

  const descriptors = pages.map((page) => {
    const crop = page.getCropBox();
    return { width: crop.width, height: crop.height, rotation: page.getRotation().angle };
  });
  const plan = planSinglePage(descriptors, options);
  const output = await PDFDocument.create();
  const embedded: PDFEmbeddedPage[] = [];
  for (const page of pages) embedded.push(await embedVisiblePage(output, page));

  const outputPage = output.addPage([plan.width, plan.height]);
  for (const placement of plan.placements) {
    const fit = fitSourcePageToBox(
      descriptors[placement.sourceIndex],
      placement.box,
      0,
      placement.sourceIndex + 1,
    );
    outputPage.drawPage(embedded[placement.sourceIndex], {
      x: fit.drawX,
      y: fit.drawY,
      xScale: fit.scale,
      yScale: fit.scale,
      rotate: degrees(fit.rotation),
    });
  }

  return output.save({ useObjectStreams: true });
}
