import { degrees, grayscale, PDFDocument, PDFPage, PDFEmbeddedPage } from 'pdf-lib';

export const A4_PORTRAIT = { width: 595.28, height: 841.89 } as const;

export type NUpOrientation = 'portrait' | 'landscape';
export type NUpArrangement = 'rows' | 'columns';
export type NUpDirection = 'ltr' | 'rtl';

export type NUpOptions = {
  rows: number;
  columns: number;
  orientation: NUpOrientation;
  arrangement: NUpArrangement;
  direction: NUpDirection;
  outerMargin: number;
  innerMargin: number;
  border: boolean;
};

export type NUpSourcePage = {
  width: number;
  height: number;
  rotation: number;
};

export type NUpPlacement = {
  sourceIndex: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: 0 | 90 | 180 | 270;
  drawX: number;
  drawY: number;
};

export type NUpSheetPlan = {
  pageWidth: number;
  pageHeight: number;
  placements: NUpPlacement[];
};

const MAX_SOURCE_PAGES = 500;
const MAX_GRID_SIDE = 8;
const MAX_MARGIN = 144;

function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

function validateOptions(options: NUpOptions) {
  if (!Number.isInteger(options.rows) || options.rows < 1 || options.rows > MAX_GRID_SIDE) {
    throw new Error(`Số hàng phải từ 1 đến ${MAX_GRID_SIDE}.`);
  }
  if (!Number.isInteger(options.columns) || options.columns < 1 || options.columns > MAX_GRID_SIDE) {
    throw new Error(`Số cột phải từ 1 đến ${MAX_GRID_SIDE}.`);
  }
  if (!Number.isFinite(options.outerMargin) || options.outerMargin < 0 || options.outerMargin > MAX_MARGIN) {
    throw new Error(`Lề ngoài phải từ 0 đến ${MAX_MARGIN} pt.`);
  }
  if (!Number.isFinite(options.innerMargin) || options.innerMargin < 0 || options.innerMargin > MAX_MARGIN / 2) {
    throw new Error(`Lề trong phải từ 0 đến ${MAX_MARGIN / 2} pt.`);
  }
}

function outputSize(orientation: NUpOrientation) {
  return orientation === 'landscape'
    ? { width: A4_PORTRAIT.height, height: A4_PORTRAIT.width }
    : { ...A4_PORTRAIT };
}

function slotPosition(slot: number, options: NUpOptions) {
  let row: number;
  let column: number;
  if (options.arrangement === 'columns') {
    row = slot % options.rows;
    column = Math.floor(slot / options.rows);
  } else {
    row = Math.floor(slot / options.columns);
    column = slot % options.columns;
  }
  if (options.direction === 'rtl') column = options.columns - 1 - column;
  return { row, column };
}

function drawOrigin(
  x: number,
  y: number,
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  rotation: 0 | 90 | 180 | 270,
) {
  if (rotation === 90) return { x: x + sourceHeight * scale, y };
  if (rotation === 180) return { x: x + sourceWidth * scale, y: y + sourceHeight * scale };
  if (rotation === 270) return { x, y: y + sourceWidth * scale };
  return { x, y };
}

export function planNUpSheets(sourcePages: NUpSourcePage[], options: NUpOptions): NUpSheetPlan[] {
  validateOptions(options);
  if (!sourcePages.length) throw new Error('PDF không có trang.');
  if (sourcePages.length > MAX_SOURCE_PAGES) throw new Error(`N-up giới hạn ${MAX_SOURCE_PAGES} trang nguồn.`);

  const { width: pageWidth, height: pageHeight } = outputSize(options.orientation);
  const contentWidth = pageWidth - 2 * options.outerMargin;
  const contentHeight = pageHeight - 2 * options.outerMargin;
  const cellWidth = contentWidth / options.columns;
  const cellHeight = contentHeight / options.rows;
  const usableWidth = cellWidth - 2 * options.innerMargin;
  const usableHeight = cellHeight - 2 * options.innerMargin;
  if (usableWidth <= 0 || usableHeight <= 0) throw new Error('Lề quá lớn so với kích thước lưới N-up.');

  const perSheet = options.rows * options.columns;
  const sheets: NUpSheetPlan[] = [];

  for (let sheetStart = 0; sheetStart < sourcePages.length; sheetStart += perSheet) {
    const placements: NUpPlacement[] = [];
    const count = Math.min(perSheet, sourcePages.length - sheetStart);
    for (let slot = 0; slot < count; slot += 1) {
      const sourceIndex = sheetStart + slot;
      const source = sourcePages[sourceIndex];
      const rotation = normalizeRotation(source.rotation);
      const rotated = rotation === 90 || rotation === 270;
      const displayWidth = rotated ? source.height : source.width;
      const displayHeight = rotated ? source.width : source.height;
      if (!(displayWidth > 0 && displayHeight > 0)) throw new Error(`Trang ${sourceIndex + 1} có kích thước không hợp lệ.`);

      const scale = Math.min(usableWidth / displayWidth, usableHeight / displayHeight);
      const width = displayWidth * scale;
      const height = displayHeight * scale;
      const { row, column } = slotPosition(slot, options);
      const cellX = options.outerMargin + column * cellWidth;
      const cellY = pageHeight - options.outerMargin - (row + 1) * cellHeight;
      const x = cellX + options.innerMargin + (usableWidth - width) / 2;
      const y = cellY + options.innerMargin + (usableHeight - height) / 2;
      const origin = drawOrigin(x, y, source.width, source.height, scale, rotation);

      placements.push({ sourceIndex, row, column, x, y, width, height, scale, rotation, drawX: origin.x, drawY: origin.y });
    }
    sheets.push({ pageWidth, pageHeight, placements });
  }
  return sheets;
}

async function embedVisiblePage(output: PDFDocument, sourcePage: PDFPage): Promise<PDFEmbeddedPage> {
  const crop = sourcePage.getCropBox();
  return output.embedPage(sourcePage, {
    left: crop.x,
    bottom: crop.y,
    right: crop.x + crop.width,
    top: crop.y + crop.height,
  });
}

export async function createNUpPdf(sourceBytes: ArrayBuffer | Uint8Array, options: NUpOptions): Promise<Uint8Array> {
  validateOptions(options);
  const source = await PDFDocument.load(sourceBytes);
  if (source.getPageCount() > MAX_SOURCE_PAGES) throw new Error(`N-up giới hạn ${MAX_SOURCE_PAGES} trang nguồn.`);

  const sourcePages = source.getPages();
  const descriptors = sourcePages.map((page) => {
    const crop = page.getCropBox();
    return { width: crop.width, height: crop.height, rotation: page.getRotation().angle };
  });
  const plan = planNUpSheets(descriptors, options);
  const output = await PDFDocument.create();
  const embedded: PDFEmbeddedPage[] = [];
  for (const page of sourcePages) embedded.push(await embedVisiblePage(output, page));

  for (const sheet of plan) {
    const outputPage = output.addPage([sheet.pageWidth, sheet.pageHeight]);
    for (const placement of sheet.placements) {
      outputPage.drawPage(embedded[placement.sourceIndex], {
        x: placement.drawX,
        y: placement.drawY,
        xScale: placement.scale,
        yScale: placement.scale,
        rotate: degrees(placement.rotation),
      });
      if (options.border) {
        outputPage.drawRectangle({
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
          borderWidth: 0.6,
          borderColor: grayscale(0.25),
        });
      }
    }
  }

  return output.save({ useObjectStreams: true });
}
