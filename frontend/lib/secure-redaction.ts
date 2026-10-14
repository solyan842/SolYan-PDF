import { PDFDocument } from 'pdf-lib';

export type RedactionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
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
 * Rebuild a PDF while replacing exactly one page with a trusted raster image.
 *
 * This deliberately creates a new page tree so the original content stream of
 * the redacted page is not carried into the output as hidden/recoverable text.
 * Non-redacted pages are copied from the source PDF. Document-level structures
 * such as outlines, attachments and AcroForm catalogs are not promised to be
 * preserved by this security-first rebuild path.
 */
export async function rebuildPdfWithRasterizedPage(
  sourceBytes: Uint8Array | ArrayBuffer,
  pageIndex: number,
  pngBytes: Uint8Array | ArrayBuffer,
  pageWidth: number,
  pageHeight: number,
): Promise<Uint8Array> {
  if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
    throw new Error('Invalid raster page geometry.');
  }

  const source = await PDFDocument.load(sourceBytes);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= source.getPageCount()) {
    throw new Error(`Redaction page index must be between 0 and ${Math.max(0, source.getPageCount() - 1)}.`);
  }

  const output = await PDFDocument.create();
  for (let index = 0; index < source.getPageCount(); index += 1) {
    if (index === pageIndex) {
      const raster = await output.embedPng(pngBytes);
      const replacement = output.addPage([pageWidth, pageHeight]);
      replacement.drawImage(raster, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      continue;
    }

    const [copied] = await output.copyPages(source, [index]);
    output.addPage(copied);
  }

  return output.save({ useObjectStreams: true });
}
