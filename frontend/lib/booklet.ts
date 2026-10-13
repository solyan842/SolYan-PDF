import { degrees, grayscale, PDFDocument, PDFEmbeddedPage } from 'pdf-lib';
import {
  embedVisiblePage,
  fitSourcePageToBox,
  MAX_LAYOUT_SOURCE_PAGES,
  normalizePageRotation,
  NUpSourcePage,
} from './n-up';

export type BookletSpine = 'left' | 'right';
export type BookletDuplexPass = 'both' | 'fronts' | 'backs';

export type BookletOptions = {
  spine: BookletSpine;
  gutter: number;
  outerMargin: number;
  border: boolean;
  duplexPass: BookletDuplexPass;
  flipOnShortEdge: boolean;
};

export type BookletSide = {
  left: number | null;
  right: number | null;
  isBack: boolean;
  sheetIndex: number;
};

const MAX_GUTTER = 144;
const MAX_OUTER_MARGIN = 72;

export function padBookletPageCount(pageCount: number): number {
  return Math.ceil(pageCount / 4) * 4;
}

function pageOrBlank(index: number, originalPageCount: number): number | null {
  return index >= 0 && index < originalPageCount ? index : null;
}

function validateBookletOptions(pageCount: number, options: BookletOptions) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('PDF không có trang.');
  if (pageCount > MAX_LAYOUT_SOURCE_PAGES) throw new Error(`Booklet giới hạn ${MAX_LAYOUT_SOURCE_PAGES} trang nguồn.`);
  if (!Number.isFinite(options.gutter) || options.gutter < 0 || options.gutter > MAX_GUTTER) {
    throw new Error(`Gutter phải từ 0 đến ${MAX_GUTTER} pt.`);
  }
  if (!Number.isFinite(options.outerMargin) || options.outerMargin < 0 || options.outerMargin > MAX_OUTER_MARGIN) {
    throw new Error(`Lề ngoài phải từ 0 đến ${MAX_OUTER_MARGIN} pt.`);
  }
}

export function planBookletSides(pageCount: number, options: BookletOptions): BookletSide[] {
  validateBookletOptions(pageCount, options);
  const padded = padBookletPageCount(pageCount);
  const sheetCount = padded / 4;
  const sides: BookletSide[] = [];

  for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
    const outerLeft = pageOrBlank(padded - 1 - sheetIndex * 2, pageCount);
    const outerRight = pageOrBlank(sheetIndex * 2, pageCount);
    const innerLeft = pageOrBlank(sheetIndex * 2 + 1, pageCount);
    const innerRight = pageOrBlank(padded - 2 - sheetIndex * 2, pageCount);

    if (options.duplexPass === 'both' || options.duplexPass === 'fronts') {
      sides.push({ left: outerLeft, right: outerRight, isBack: false, sheetIndex });
    }
    if (options.duplexPass === 'both' || options.duplexPass === 'backs') {
      const swapBack = options.duplexPass === 'both' && options.flipOnShortEdge;
      sides.push({
        left: swapBack ? innerRight : innerLeft,
        right: swapBack ? innerLeft : innerRight,
        isBack: true,
        sheetIndex,
      });
    }
  }
  return sides;
}

export function visualBookletSide(side: BookletSide, spine: BookletSpine) {
  return spine === 'right'
    ? { left: side.right, right: side.left }
    : { left: side.left, right: side.right };
}

function sourceDescriptor(page: { getCropBox(): { width: number; height: number }; getRotation(): { angle: number } }): NUpSourcePage {
  const crop = page.getCropBox();
  return { width: crop.width, height: crop.height, rotation: page.getRotation().angle };
}

function displayedDimensions(source: NUpSourcePage) {
  const rotation = normalizePageRotation(source.rotation);
  return rotation === 90 || rotation === 270
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

export async function createBookletPdf(sourceBytes: ArrayBuffer | Uint8Array, options: BookletOptions): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes);
  const sourcePages = source.getPages();
  validateBookletOptions(sourcePages.length, options);

  const descriptors = sourcePages.map(sourceDescriptor);
  const firstDisplayed = displayedDimensions(descriptors[0]);
  const pageWidth = Math.max(firstDisplayed.width, firstDisplayed.height);
  const pageHeight = Math.min(firstDisplayed.width, firstDisplayed.height);
  const usableWidth = pageWidth - 2 * options.outerMargin;
  const usableHeight = pageHeight - 2 * options.outerMargin;
  if (!(usableWidth > options.gutter && usableHeight > 0)) throw new Error('Lề/gutter quá lớn so với khổ giấy booklet.');

  const halfWidth = usableWidth / 2;
  const leftBox = {
    x: options.outerMargin,
    y: options.outerMargin,
    width: halfWidth - options.gutter / 2,
    height: usableHeight,
  };
  const rightBox = {
    x: options.outerMargin + halfWidth + options.gutter / 2,
    y: options.outerMargin,
    width: halfWidth - options.gutter / 2,
    height: usableHeight,
  };
  if (!(leftBox.width > 0 && rightBox.width > 0)) throw new Error('Gutter quá lớn so với chiều rộng booklet.');

  const sides = planBookletSides(sourcePages.length, options);
  const output = await PDFDocument.create();
  const embedded: PDFEmbeddedPage[] = [];
  for (const page of sourcePages) embedded.push(await embedVisiblePage(output, page));

  for (const side of sides) {
    const outputPage = output.addPage([pageWidth, pageHeight]);
    const visual = visualBookletSide(side, options.spine);

    const drawCell = (sourceIndex: number | null, box: typeof leftBox) => {
      if (sourceIndex !== null) {
        const fit = fitSourcePageToBox(descriptors[sourceIndex], box, 0, sourceIndex + 1);
        outputPage.drawPage(embedded[sourceIndex], {
          x: fit.drawX,
          y: fit.drawY,
          xScale: fit.scale,
          yScale: fit.scale,
          rotate: degrees(fit.rotation),
        });
      }
      if (options.border) {
        outputPage.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          borderWidth: 0.6,
          borderColor: grayscale(0.25),
        });
      }
    };

    drawCell(visual.left, leftBox);
    drawCell(visual.right, rightBox);
  }

  return output.save({ useObjectStreams: true });
}
