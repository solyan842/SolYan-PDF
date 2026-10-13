import { degrees, PDFDocument, PDFPage } from 'pdf-lib';
import { embedVisiblePage, fitSourcePageToBox, normalizePageRotation } from './n-up';
import { parsePages } from './pdf-client';

export type SectionSplitMode = 'all' | 'custom' | 'except-first' | 'except-last' | 'except-first-last';

export type SectionSplitOptions = {
  columns: number;
  rows: number;
  mode: SectionSplitMode;
  customPages?: string;
};

export type SectionPiecePlan = {
  sourceIndex: number;
  split: boolean;
  sectionNumber: number;
  row: number;
  column: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
};

export type SectionPart = SectionPiecePlan & {
  filename: string;
  bytes: Uint8Array;
};

export const MAX_SECTION_SOURCE_PAGES = 300;
export const MAX_SECTION_OUTPUT_PAGES = 1000;
export const MAX_SECTION_GRID_SIDE = 8;

function validateGrid(columns: number, rows: number) {
  if (!Number.isInteger(columns) || columns < 1 || columns > MAX_SECTION_GRID_SIDE) {
    throw new Error(`Số cột phải từ 1 đến ${MAX_SECTION_GRID_SIDE}.`);
  }
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_SECTION_GRID_SIDE) {
    throw new Error(`Số hàng phải từ 1 đến ${MAX_SECTION_GRID_SIDE}.`);
  }
}

export function resolveSectionPages(pageCount: number, mode: SectionSplitMode, customPages = ''): Set<number> {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('PDF không có trang hợp lệ.');
  if (pageCount > MAX_SECTION_SOURCE_PAGES) {
    throw new Error(`Tách section giới hạn ${MAX_SECTION_SOURCE_PAGES} trang nguồn.`);
  }

  const indexes = new Set<number>();
  if (mode === 'custom') {
    if (!customPages.trim()) throw new Error('Hãy nhập trang cần chia section.');
    parsePages(customPages, pageCount).forEach((index) => indexes.add(index));
    return indexes;
  }

  const start = mode === 'except-first' || mode === 'except-first-last' ? 1 : 0;
  const endExclusive = mode === 'except-last' || mode === 'except-first-last' ? Math.max(start, pageCount - 1) : pageCount;
  for (let index = start; index < endExclusive; index += 1) indexes.add(index);
  return indexes;
}

export function planSectionPieces(
  sourcePages: Array<{ width: number; height: number }>,
  options: SectionSplitOptions,
): SectionPiecePlan[] {
  validateGrid(options.columns, options.rows);
  const pagesToSplit = resolveSectionPages(sourcePages.length, options.mode, options.customPages ?? '');
  const outputCount = sourcePages.reduce(
    (total, _page, index) => total + (pagesToSplit.has(index) ? options.columns * options.rows : 1),
    0,
  );
  if (outputCount > MAX_SECTION_OUTPUT_PAGES) {
    throw new Error(`Cấu hình tạo ${outputCount} phần, vượt giới hạn ${MAX_SECTION_OUTPUT_PAGES}.`);
  }

  const plans: SectionPiecePlan[] = [];
  sourcePages.forEach((page, sourceIndex) => {
    if (!(page.width > 0 && page.height > 0)) throw new Error(`Trang ${sourceIndex + 1} có kích thước không hợp lệ.`);
    if (!pagesToSplit.has(sourceIndex)) {
      plans.push({
        sourceIndex,
        split: false,
        sectionNumber: 1,
        row: 0,
        column: 0,
        cropX: 0,
        cropY: 0,
        cropWidth: page.width,
        cropHeight: page.height,
      });
      return;
    }

    const cropWidth = page.width / options.columns;
    const cropHeight = page.height / options.rows;
    for (let column = 0; column < options.columns; column += 1) {
      for (let row = 0; row < options.rows; row += 1) {
        plans.push({
          sourceIndex,
          split: true,
          sectionNumber: column * options.rows + row + 1,
          row,
          column,
          cropX: column * cropWidth,
          cropY: (options.rows - 1 - row) * cropHeight,
          cropWidth,
          cropHeight,
        });
      }
    }
  });
  return plans;
}

async function normalizeVisiblePages(sourceBytes: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes);
  if (source.getPageCount() > MAX_SECTION_SOURCE_PAGES) {
    throw new Error(`Tách section giới hạn ${MAX_SECTION_SOURCE_PAGES} trang nguồn.`);
  }
  const normalized = await PDFDocument.create();

  for (let index = 0; index < source.getPageCount(); index += 1) {
    const sourcePage = source.getPage(index);
    const crop = sourcePage.getCropBox();
    const rotation = normalizePageRotation(sourcePage.getRotation().angle);
    const rotated = rotation === 90 || rotation === 270;
    const pageWidth = rotated ? crop.height : crop.width;
    const pageHeight = rotated ? crop.width : crop.height;
    if (!(pageWidth > 0 && pageHeight > 0)) throw new Error(`Trang ${index + 1} có CropBox không hợp lệ.`);

    const embedded = await embedVisiblePage(normalized, sourcePage);
    const fit = fitSourcePageToBox(
      { width: crop.width, height: crop.height, rotation },
      { x: 0, y: 0, width: pageWidth, height: pageHeight },
      0,
      index + 1,
    );
    const page = normalized.addPage([pageWidth, pageHeight]);
    page.drawPage(embedded, {
      x: fit.drawX,
      y: fit.drawY,
      xScale: fit.scale,
      yScale: fit.scale,
      rotate: degrees(fit.rotation),
    });
  }
  return normalized.save({ useObjectStreams: true });
}

async function addPiece(output: PDFDocument, sourcePage: PDFPage, plan: SectionPiecePlan) {
  if (!plan.split) {
    const normalizedSource = sourcePage.doc;
    const [copied] = await output.copyPages(normalizedSource, [normalizedSource.getPages().indexOf(sourcePage)]);
    output.addPage(copied);
    return;
  }

  const embedded = await output.embedPage(sourcePage, {
    left: plan.cropX,
    bottom: plan.cropY,
    right: plan.cropX + plan.cropWidth,
    top: plan.cropY + plan.cropHeight,
  });
  const page = output.addPage([plan.cropWidth, plan.cropHeight]);
  page.drawPage(embedded, { x: 0, y: 0, xScale: 1, yScale: 1 });
}

export async function createMergedSectionPdf(
  sourceBytes: ArrayBuffer | Uint8Array,
  options: SectionSplitOptions,
): Promise<Uint8Array> {
  const normalizedBytes = await normalizeVisiblePages(sourceBytes);
  const normalized = await PDFDocument.load(normalizedBytes);
  const pages = normalized.getPages();
  const plans = planSectionPieces(pages.map((page) => page.getSize()), options);
  const output = await PDFDocument.create();
  for (const plan of plans) await addPiece(output, pages[plan.sourceIndex], plan);
  return output.save({ useObjectStreams: true });
}

export function sectionPartFilename(plan: SectionPiecePlan): string {
  const page = String(plan.sourceIndex + 1).padStart(3, '0');
  if (!plan.split) return `page-${page}.pdf`;
  return `page-${page}-section-${String(plan.sectionNumber).padStart(2, '0')}.pdf`;
}

export async function createSectionParts(
  sourceBytes: ArrayBuffer | Uint8Array,
  options: SectionSplitOptions,
): Promise<SectionPart[]> {
  const normalizedBytes = await normalizeVisiblePages(sourceBytes);
  const normalized = await PDFDocument.load(normalizedBytes);
  const pages = normalized.getPages();
  const plans = planSectionPieces(pages.map((page) => page.getSize()), options);
  const parts: SectionPart[] = [];
  for (const plan of plans) {
    const output = await PDFDocument.create();
    await addPiece(output, pages[plan.sourceIndex], plan);
    parts.push({ ...plan, filename: sectionPartFilename(plan), bytes: await output.save({ useObjectStreams: true }) });
  }
  return parts;
}
