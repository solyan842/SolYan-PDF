import { degrees, PDFDocument } from 'pdf-lib';
import { embedVisiblePage, fitSourcePageToBox, normalizePageRotation } from './n-up';

export type PosterPageSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid';

export type PosterOptions = {
  xFactor: number;
  yFactor: number;
  pageSize: PosterPageSize;
  rightToLeft: boolean;
};

export type PosterTilePlan = {
  sourceIndex: number;
  row: number;
  column: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  drawX: number;
  drawY: number;
};

export const MAX_POSTER_SOURCE_PAGES = 100;
export const MAX_POSTER_OUTPUT_PAGES = 1000;
export const MAX_POSTER_GRID_SIDE = 8;

export const POSTER_PAGE_SIZES: Record<PosterPageSize, { width: number; height: number }> = {
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  Tabloid: { width: 792, height: 1224 },
};

function validateOptions(options: PosterOptions, sourcePageCount?: number) {
  if (!Number.isInteger(options.xFactor) || options.xFactor < 1 || options.xFactor > MAX_POSTER_GRID_SIDE) {
    throw new Error(`Số cột phải từ 1 đến ${MAX_POSTER_GRID_SIDE}.`);
  }
  if (!Number.isInteger(options.yFactor) || options.yFactor < 1 || options.yFactor > MAX_POSTER_GRID_SIDE) {
    throw new Error(`Số hàng phải từ 1 đến ${MAX_POSTER_GRID_SIDE}.`);
  }
  if (!POSTER_PAGE_SIZES[options.pageSize]) throw new Error('Khổ giấy poster không hợp lệ.');
  if (sourcePageCount !== undefined) {
    if (sourcePageCount < 1) throw new Error('PDF không có trang.');
    if (sourcePageCount > MAX_POSTER_SOURCE_PAGES) {
      throw new Error(`Poster PDF giới hạn ${MAX_POSTER_SOURCE_PAGES} trang nguồn.`);
    }
    const outputCount = sourcePageCount * options.xFactor * options.yFactor;
    if (outputCount > MAX_POSTER_OUTPUT_PAGES) {
      throw new Error(`Cấu hình tạo ${outputCount} tờ, vượt giới hạn ${MAX_POSTER_OUTPUT_PAGES} tờ poster.`);
    }
  }
}

export function planPosterTiles(
  sourcePages: Array<{ width: number; height: number }>,
  options: PosterOptions,
): PosterTilePlan[] {
  validateOptions(options, sourcePages.length);
  const target = POSTER_PAGE_SIZES[options.pageSize];
  const tiles: PosterTilePlan[] = [];

  sourcePages.forEach((source, sourceIndex) => {
    if (!(source.width > 0 && source.height > 0)) throw new Error(`Trang ${sourceIndex + 1} có kích thước không hợp lệ.`);
    const cropWidth = source.width / options.xFactor;
    const cropHeight = source.height / options.yFactor;
    const scale = Math.min(target.width / cropWidth, target.height / cropHeight);
    const drawWidth = cropWidth * scale;
    const drawHeight = cropHeight * scale;
    const drawX = (target.width - drawWidth) / 2;
    const drawY = (target.height - drawHeight) / 2;

    for (let row = 0; row < options.yFactor; row += 1) {
      for (let column = 0; column < options.xFactor; column += 1) {
        const actualColumn = options.rightToLeft ? options.xFactor - 1 - column : column;
        tiles.push({
          sourceIndex,
          row,
          column: actualColumn,
          cropX: actualColumn * cropWidth,
          cropY: (options.yFactor - 1 - row) * cropHeight,
          cropWidth,
          cropHeight,
          pageWidth: target.width,
          pageHeight: target.height,
          scale,
          drawX,
          drawY,
        });
      }
    }
  });
  return tiles;
}

async function normalizeVisiblePages(sourceBytes: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes);
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

export async function createPosterPdf(
  sourceBytes: ArrayBuffer | Uint8Array,
  options: PosterOptions,
): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes);
  validateOptions(options, source.getPageCount());

  const normalizedBytes = await normalizeVisiblePages(sourceBytes);
  const normalized = await PDFDocument.load(normalizedBytes);
  const descriptors = normalized.getPages().map((page) => page.getSize());
  const tiles = planPosterTiles(descriptors, options);
  const output = await PDFDocument.create();

  for (const tile of tiles) {
    const sourcePage = normalized.getPage(tile.sourceIndex);
    const embedded = await output.embedPage(sourcePage, {
      left: tile.cropX,
      bottom: tile.cropY,
      right: tile.cropX + tile.cropWidth,
      top: tile.cropY + tile.cropHeight,
    });
    const page = output.addPage([tile.pageWidth, tile.pageHeight]);
    page.drawPage(embedded, {
      x: tile.drawX,
      y: tile.drawY,
      xScale: tile.scale,
      yScale: tile.scale,
    });
  }

  return output.save({ useObjectStreams: true });
}
