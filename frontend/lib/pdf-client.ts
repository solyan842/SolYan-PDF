import { PDFDocument, degrees } from 'pdf-lib';

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function parsePages(input: string, pageCount: number): number[] {
  const value = input.trim();
  if (!value) return Array.from({ length: pageCount }, (_, index) => index);

  const result: number[] = [];
  const seen = new Set<number>();

  for (const token of value.split(',')) {
    const part = token.trim();
    if (!part) continue;

    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const step = start <= end ? 1 : -1;
      for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
        if (page < 1 || page > pageCount) throw new Error(`Trang ${page} nằm ngoài phạm vi 1-${pageCount}.`);
        const index = page - 1;
        if (!seen.has(index)) {
          result.push(index);
          seen.add(index);
        }
      }
      continue;
    }

    if (!/^\d+$/.test(part)) throw new Error(`Cú pháp trang không hợp lệ: ${part}`);
    const page = Number(part);
    if (page < 1 || page > pageCount) throw new Error(`Trang ${page} nằm ngoài phạm vi 1-${pageCount}.`);
    const index = page - 1;
    if (!seen.has(index)) {
      result.push(index);
      seen.add(index);
    }
  }

  if (!result.length) throw new Error('Chưa có trang hợp lệ.');
  return result;
}

export async function copySelectedPages(source: PDFDocument, indexes: number[]) {
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indexes);
  pages.forEach((page) => output.addPage(page));
  return output;
}

export function normalizeRotation(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) throw new Error('Góc xoay phải là 0, 90, 180 hoặc 270 độ.');
  return normalized;
}

export function addRotation(current: number, delta: number) {
  return degrees((current + delta) % 360);
}
