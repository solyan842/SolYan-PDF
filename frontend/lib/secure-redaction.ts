import { PDFDocument } from 'pdf-lib';

export type RedactionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RasterizedPageReplacement = {
  pageIndex: number;
  pngBytes: Uint8Array | ArrayBuffer;
  pageWidth: number;
  pageHeight: number;
};

export function normalizeRedactionBox(box: RedactionBox, pageWidth: number, pageHeight: number): RedactionBox {
  if (![box.x, box.y, box.width, box.height, pageWidth, pageHeight].every(Number.isFinite)) {
    throw new Error('Redaction coordinates must be finite numbers.');
  }
  if (pageWidth <= 0 || pageHeight <= 0) throw new Error('Invalid PDF page geometry.');
  if (box.width <= 0 || box.height <= 0) throw new Error('Redaction width and height must be greater than zero.');

  const x = Math.max(0, Math.min(pageWidth, box.x));
  const y = Math.max(0, Math.min(pageHeight, box.y));
  const right = Math.max(x, Math.min(pageWidth, box.x + box.width));
  const top = Math.max(y, Math.min(pageHeight, box.y + box.height));
  const width = right - x;
  const height = top - y;

  if (width <= 0 || height <= 0) throw new Error('Redaction area is outside the selected page.');
  return { x, y, width, height };
}

/**
 * Rebuild a PDF while replacing selected pages with trusted raster images.
 *
 * This deliberately creates a new page tree so original content streams from
 * redacted pages are not carried into the output as hidden/recoverable text.
 * Non-redacted pages are copied from the source PDF. Document-level structures
 * such as outlines, attachments and AcroForm catalogs are not promised to be
 * preserved by this security-first rebuild path.
 */
export async function rebuildPdfWithRasterizedPages(
  sourceBytes: Uint8Array | ArrayBuffer,
  replacements: RasterizedPageReplacement[],
): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourceBytes);
  const pageCount = source.getPageCount();
  const byPage = new Map<number, RasterizedPageReplacement>();

  for (const replacement of replacements) {
    const { pageIndex, pageWidth, pageHeight } = replacement;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(`Redaction page index must be between 0 and ${Math.max(0, pageCount - 1)}.`);
    }
    if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
      throw new Error('Invalid raster page geometry.');
    }
    if (byPage.has(pageIndex)) throw new Error(`Duplicate raster replacement for page index ${pageIndex}.`);
    byPage.set(pageIndex, replacement);
  }

  const output = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const replacement = byPage.get(index);
    if (replacement) {
      const raster = await output.embedPng(replacement.pngBytes);
      const page = output.addPage([replacement.pageWidth, replacement.pageHeight]);
      page.drawImage(raster, { x: 0, y: 0, width: replacement.pageWidth, height: replacement.pageHeight });
      continue;
    }

    const [copied] = await output.copyPages(source, [index]);
    output.addPage(copied);
  }

  return output.save({ useObjectStreams: true });
}

/**
 * Backwards-compatible single-page wrapper used by the manual Editor redact
 * tool. Keep this API stable while Auto Redact uses the multi-page primitive.
 */
export async function rebuildPdfWithRasterizedPage(
  sourceBytes: Uint8Array | ArrayBuffer,
  pageIndex: number,
  pngBytes: Uint8Array | ArrayBuffer,
  pageWidth: number,
  pageHeight: number,
): Promise<Uint8Array> {
  return rebuildPdfWithRasterizedPages(sourceBytes, [{
    pageIndex,
    pngBytes,
    pageWidth,
    pageHeight,
  }]);
}
