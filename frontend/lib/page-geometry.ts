import { degrees, PDFDocument, PDFEmbeddedPage, PDFPage } from 'pdf-lib';
import {
  embedVisiblePage,
  fitSourcePageToBox,
  MAX_LAYOUT_SOURCE_PAGES,
  NUpSourcePage,
} from './n-up';

export const STANDARD_PAGE_SIZES = {
  A0: { width: 2383.94, height: 3370.39 },
  A1: { width: 1683.78, height: 2383.94 },
  A2: { width: 1190.55, height: 1683.78 },
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  A6: { width: 297.64, height: 419.53 },
  LETTER: { width: 612, height: 792 },
  LEGAL: { width: 612, height: 1008 },
} as const;

export type StandardPageSize = keyof typeof STANDARD_PAGE_SIZES;
export type ResizePageSize = StandardPageSize | 'CUSTOM';
export type PageOrientation = 'portrait' | 'landscape';

export type CropMargins = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type PdfBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResizeOptions = {
  pageSize: ResizePageSize;
  orientation: PageOrientation;
  scaleFactor: number;
  customWidth?: number;
  customHeight?: number;
};

const MAX_GEOMETRY_PT = 14400;
const MIN_GEOMETRY_PT = 36;
const MIN_CROPPED_SIDE_PT = 1;

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_GEOMETRY_PT) {
    throw new Error(`${label} phải từ 0 đến ${MAX_GEOMETRY_PT} pt.`);
  }
}

export function planCropBox(box: PdfBox, margins: CropMargins): PdfBox {
  finiteNonNegative(margins.left, 'Lề trái');
  finiteNonNegative(margins.right, 'Lề phải');
  finiteNonNegative(margins.top, 'Lề trên');
  finiteNonNegative(margins.bottom, 'Lề dưới');
  if (!(box.width > 0 && box.height > 0)) throw new Error('Trang có kích thước không hợp lệ.');

  const width = box.width - margins.left - margins.right;
  const height = box.height - margins.top - margins.bottom;
  if (width < MIN_CROPPED_SIDE_PT || height < MIN_CROPPED_SIDE_PT) {
    throw new Error('Lề crop làm vùng trang còn lại quá nhỏ hoặc âm.');
  }
  return {
    x: box.x + margins.left,
    y: box.y + margins.bottom,
    width,
    height,
  };
}

function selectedPageSet(pageCount: number, pageIndexes?: number[]) {
  if (!pageIndexes) return new Set(Array.from({ length: pageCount }, (_, index) => index));
  const selected = new Set<number>();
  for (const index of pageIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new Error(`Trang ${index + 1} nằm ngoài phạm vi 1-${pageCount}.`);
    }
    selected.add(index);
  }
  if (!selected.size) throw new Error('Chưa chọn trang để crop.');
  return selected;
}

function setAllPageBoxes(page: PDFPage, box: PdfBox) {
  page.setMediaBox(box.x, box.y, box.width, box.height);
  page.setCropBox(box.x, box.y, box.width, box.height);
  page.setBleedBox(box.x, box.y, box.width, box.height);
  page.setTrimBox(box.x, box.y, box.width, box.height);
  page.setArtBox(box.x, box.y, box.width, box.height);
}

export async function cropPdf(
  sourceBytes: ArrayBuffer | Uint8Array,
  margins: CropMargins,
  pageIndexes?: number[],
): Promise<Uint8Array> {
  const document = await PDFDocument.load(sourceBytes);
  const pages = document.getPages();
  if (!pages.length) throw new Error('PDF không có trang.');
  if (pages.length > MAX_LAYOUT_SOURCE_PAGES) throw new Error(`Crop giới hạn ${MAX_LAYOUT_SOURCE_PAGES} trang nguồn.`);
  const selected = selectedPageSet(pages.length, pageIndexes);

  pages.forEach((page, index) => {
    if (!selected.has(index)) return;
    const crop = page.getCropBox();
    const next = planCropBox(crop, margins);
    setAllPageBoxes(page, next);
  });

  return document.save({ useObjectStreams: true });
}

function customDimension(value: number | undefined, label: string) {
  if (!Number.isFinite(value) || value === undefined || value < MIN_GEOMETRY_PT || value > MAX_GEOMETRY_PT) {
    throw new Error(`${label} phải từ ${MIN_GEOMETRY_PT} đến ${MAX_GEOMETRY_PT} pt.`);
  }
  return value;
}

export function resolveTargetPageSize(options: ResizeOptions) {
  let base: { width: number; height: number };
  if (options.pageSize === 'CUSTOM') {
    base = {
      width: customDimension(options.customWidth, 'Chiều rộng'),
      height: customDimension(options.customHeight, 'Chiều cao'),
    };
  } else {
    base = STANDARD_PAGE_SIZES[options.pageSize];
  }

  const portrait = base.height >= base.width
    ? base
    : { width: base.height, height: base.width };
  return options.orientation === 'landscape'
    ? { width: portrait.height, height: portrait.width }
    : { width: portrait.width, height: portrait.height };
}

function validateResizeOptions(options: ResizeOptions) {
  if (!Number.isFinite(options.scaleFactor) || options.scaleFactor < 0.1 || options.scaleFactor > 2) {
    throw new Error('Tỷ lệ nội dung phải từ 10% đến 200%.');
  }
  resolveTargetPageSize(options);
}

function pageDescriptor(page: PDFPage): NUpSourcePage {
  const crop = page.getCropBox();
  return { width: crop.width, height: crop.height, rotation: page.getRotation().angle };
}

export async function resizePdf(
  sourceBytes: ArrayBuffer | Uint8Array,
  options: ResizeOptions,
): Promise<Uint8Array> {
  validateResizeOptions(options);
  const source = await PDFDocument.load(sourceBytes);
  const sourcePages = source.getPages();
  if (!sourcePages.length) throw new Error('PDF không có trang.');
  if (sourcePages.length > MAX_LAYOUT_SOURCE_PAGES) throw new Error(`Resize giới hạn ${MAX_LAYOUT_SOURCE_PAGES} trang nguồn.`);

  const target = resolveTargetPageSize(options);
  const output = await PDFDocument.create();
  const descriptors = sourcePages.map(pageDescriptor);
  const embedded: PDFEmbeddedPage[] = [];
  for (const page of sourcePages) embedded.push(await embedVisiblePage(output, page));

  for (let index = 0; index < sourcePages.length; index += 1) {
    const page = output.addPage([target.width, target.height]);
    const fit = fitSourcePageToBox(
      descriptors[index],
      { x: 0, y: 0, width: target.width, height: target.height },
      0,
      index + 1,
      options.scaleFactor,
    );
    page.drawPage(embedded[index], {
      x: fit.drawX,
      y: fit.drawY,
      xScale: fit.scale,
      yScale: fit.scale,
      rotate: degrees(fit.rotation),
    });
  }

  return output.save({ useObjectStreams: true });
}
