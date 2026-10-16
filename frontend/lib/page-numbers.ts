export type PageNumberPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type PageNumberMargin = 'small' | 'medium' | 'large' | 'x-large';

export type PageNumberBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PageNumberPlacement = {
  x: number;
  y: number;
};

const MARGIN_FACTORS: Record<PageNumberMargin, number> = {
  small: 0.02,
  medium: 0.035,
  large: 0.05,
  'x-large': 0.075,
};

export function formatPageNumber(value: number, zeroPad: number): string {
  if (!Number.isInteger(value)) throw new Error('Số trang phải là số nguyên.');
  if (!Number.isInteger(zeroPad) || zeroPad < 0 || zeroPad > 12) {
    throw new Error('Zero padding phải nằm trong khoảng 0-12.');
  }
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(value));
  return `${sign}${zeroPad > 0 ? digits.padStart(zeroPad, '0') : digits}`;
}

export function pageNumberTemplate(
  template: string,
  pageNumber: number,
  totalPages: number,
  filename: string,
  zeroPad = 0,
): string {
  const normalized = template.trim() || '{n}';
  const baseName = filename.replace(/\.[^.]+$/, '');
  return normalized
    .replaceAll('{n}', formatPageNumber(pageNumber, zeroPad))
    .replaceAll('{total}', String(totalPages))
    .replaceAll('{filename}', baseName);
}

export function parseHexColor(value: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) throw new Error('Màu chữ phải có dạng #RRGGBB.');
  const numeric = Number.parseInt(match[1], 16);
  return {
    r: ((numeric >> 16) & 0xff) / 255,
    g: ((numeric >> 8) & 0xff) / 255,
    b: (numeric & 0xff) / 255,
  };
}

export function pageNumberPlacement(
  box: PageNumberBox,
  textWidth: number,
  fontSize: number,
  position: PageNumberPosition,
  margin: PageNumberMargin,
): PageNumberPlacement {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(position)) throw new Error('Vị trí số trang không hợp lệ.');
  if (!(fontSize > 0) || !Number.isFinite(fontSize)) throw new Error('Cỡ chữ không hợp lệ.');
  if (!(box.width > 0) || !(box.height > 0)) throw new Error('Kích thước trang không hợp lệ.');

  const factor = MARGIN_FACTORS[margin] ?? MARGIN_FACTORS.medium;
  const horizontalMargin = box.width * factor;
  const verticalMargin = box.height * factor;
  const col = ((position - 1) % 3) + 1;
  const row = Math.floor((position - 1) / 3) + 1;

  const x = col === 1
    ? box.x + horizontalMargin
    : col === 2
      ? box.x + (box.width - textWidth) / 2
      : box.x + box.width - horizontalMargin - textWidth;

  const y = row === 1
    ? box.y + box.height - verticalMargin - fontSize
    : row === 2
      ? box.y + (box.height - fontSize) / 2
      : box.y + verticalMargin;

  return { x, y };
}
