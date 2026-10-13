import { PDFDocument } from 'pdf-lib';
import { copySelectedPages } from './pdf-client';

export type SplitPart = {
  indexes: number[];
  bytes: Uint8Array;
  estimatedBytes?: number;
};

export const MAX_SPLIT_PAGES = 500;
export const MAX_SIZE_MODE_PAGES = 200;

function requirePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} phải là số nguyên lớn hơn 0.`);
}

async function saveIndexes(source: PDFDocument, indexes: number[]): Promise<Uint8Array> {
  const output = await copySelectedPages(source, indexes);
  return output.save({ useObjectStreams: true });
}

export async function splitByPageCount(
  sourceBytes: ArrayBuffer | Uint8Array,
  pagesPerPart: number,
): Promise<SplitPart[]> {
  requirePositiveInteger(pagesPerPart, 'Số trang mỗi phần');
  const source = await PDFDocument.load(sourceBytes);
  const pageCount = source.getPageCount();
  if (!pageCount) throw new Error('PDF không có trang.');
  if (pageCount > MAX_SPLIT_PAGES) throw new Error(`Chế độ tách theo số trang giới hạn ${MAX_SPLIT_PAGES} trang.`);

  const parts: SplitPart[] = [];
  for (let start = 0; start < pageCount; start += pagesPerPart) {
    const indexes = Array.from(
      { length: Math.min(pagesPerPart, pageCount - start) },
      (_, offset) => start + offset,
    );
    parts.push({ indexes, bytes: await saveIndexes(source, indexes) });
  }
  return parts;
}

export async function splitByApproxSize(
  sourceBytes: ArrayBuffer | Uint8Array,
  targetBytes: number,
): Promise<SplitPart[]> {
  requirePositiveInteger(targetBytes, 'Dung lượng mục tiêu');
  const source = await PDFDocument.load(sourceBytes);
  const pageCount = source.getPageCount();
  if (!pageCount) throw new Error('PDF không có trang.');
  if (pageCount > MAX_SIZE_MODE_PAGES) {
    throw new Error(`Chế độ tách theo dung lượng giới hạn ${MAX_SIZE_MODE_PAGES} trang để tránh tải CPU/RAM quá lớn trong trình duyệt.`);
  }

  // Estimate each page independently. This deliberately stays best-effort because
  // shared resources can make a multi-page chunk smaller than the sum of one-page PDFs.
  const pageEstimates: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    pageEstimates.push((await saveIndexes(source, [index])).byteLength);
  }

  const groups: Array<{ indexes: number[]; estimatedBytes: number }> = [];
  let currentIndexes: number[] = [];
  let currentEstimate = 0;

  for (let index = 0; index < pageCount; index += 1) {
    const estimate = pageEstimates[index];
    if (currentIndexes.length && currentEstimate + estimate > targetBytes) {
      groups.push({ indexes: currentIndexes, estimatedBytes: currentEstimate });
      currentIndexes = [];
      currentEstimate = 0;
    }
    currentIndexes.push(index);
    currentEstimate += estimate;
  }
  if (currentIndexes.length) groups.push({ indexes: currentIndexes, estimatedBytes: currentEstimate });

  const parts: SplitPart[] = [];
  for (const group of groups) {
    parts.push({
      indexes: group.indexes,
      estimatedBytes: group.estimatedBytes,
      bytes: await saveIndexes(source, group.indexes),
    });
  }
  return parts;
}
