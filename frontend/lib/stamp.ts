import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type StampPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom';

export type StampCommon = {
  pageIndexes: number[];
  opacity: number;
  rotation: number;
  position: StampPosition;
  customX?: number;
  customY?: number;
  filename?: string;
};

export type TextStampOptions = StampCommon & {
  kind: 'text';
  text: string;
  fontSize: number;
  color: string;
};

export type ImageStampOptions = StampCommon & {
  kind: 'image';
  imageBytes: Uint8Array;
  imageType: 'png' | 'jpg';
  widthPercent: number;
};

export type StampOptions = TextStampOptions | ImageStampOptions;

export function expandStampText(
  template: string,
  pageNumber: number,
  totalPages: number,
  filename = '',
  now = new Date(),
): string {
  const marker = '\uE000SOLYAN_AT\uE000';
  const baseFilename = filename.replace(/\.pdf$/i, '');
  return template
    .replace(/@@/g, marker)
    .replace(/@page_count|@total_pages|@pages/g, String(totalPages))
    .replace(/@page_number|@page/g, String(pageNumber))
    .replace(/@filename/g, baseFilename)
    .replace(/@date/g, now.toISOString().slice(0, 10))
    .replace(new RegExp(marker, 'g'), '@');
}

export function parseHexColor(value: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return { r: 0.35, g: 0.4, b: 0.48 };
  const raw = match[1];
  return {
    r: parseInt(raw.slice(0, 2), 16) / 255,
    g: parseInt(raw.slice(2, 4), 16) / 255,
    b: parseInt(raw.slice(4, 6), 16) / 255,
  };
}

export function stampPosition(
  pageWidth: number,
  pageHeight: number,
  stampWidth: number,
  stampHeight: number,
  position: StampPosition,
  customX?: number,
  customY?: number,
): { x: number; y: number } {
  if (position === 'custom') {
    return {
      x: Number.isFinite(customX) ? Number(customX) : 0,
      y: Number.isFinite(customY) ? Number(customY) : 0,
    };
  }

  const margin = Math.max(12, Math.min(pageWidth, pageHeight) * 0.04);
  const left = margin;
  const centerX = (pageWidth - stampWidth) / 2;
  const right = pageWidth - stampWidth - margin;
  const bottom = margin;
  const middleY = (pageHeight - stampHeight) / 2;
  const top = pageHeight - stampHeight - margin;

  const [vertical, horizontal] = position === 'center' ? ['middle', 'center'] : position.split('-');
  const x = horizontal === 'left' ? left : horizontal === 'right' ? right : centerX;
  const y = vertical === 'top' ? top : vertical === 'bottom' ? bottom : middleY;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

export async function applyStamp(sourceBytes: ArrayBuffer | Uint8Array, options: StampOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(sourceBytes);
  const totalPages = pdf.getPageCount();
  const indexes = [...new Set(options.pageIndexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < totalPages)
    .sort((a, b) => a - b);
  if (!indexes.length) throw new Error('Không có trang hợp lệ để đóng stamp.');

  const opacity = Math.max(0.05, Math.min(1, options.opacity));
  const rotation = Math.max(-180, Math.min(180, options.rotation));

  if (options.kind === 'text') {
    if (!options.text.trim()) throw new Error('Nội dung stamp không được để trống.');
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontSize = Math.max(6, Math.min(180, options.fontSize));
    const color = parseHexColor(options.color);

    for (const index of indexes) {
      const page = pdf.getPage(index);
      const { width, height } = page.getSize();
      const text = expandStampText(options.text, index + 1, totalPages, options.filename ?? '');
      const lines = text.split(/\r?\n/).slice(0, 20);
      const lineHeight = fontSize * 1.2;
      const textWidth = Math.max(...lines.map((line) => font.widthOfTextAtSize(line || ' ', fontSize)));
      const textHeight = Math.max(lineHeight, lines.length * lineHeight);
      const origin = stampPosition(width, height, textWidth, textHeight, options.position, options.customX, options.customY);
      lines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: origin.x,
          y: origin.y + (lines.length - lineIndex - 1) * lineHeight,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
          opacity,
          rotate: degrees(rotation),
        });
      });
    }
  } else {
    const image = options.imageType === 'png'
      ? await pdf.embedPng(options.imageBytes)
      : await pdf.embedJpg(options.imageBytes);
    const widthPercent = Math.max(2, Math.min(95, options.widthPercent));

    for (const index of indexes) {
      const page = pdf.getPage(index);
      const { width, height } = page.getSize();
      const stampWidth = width * (widthPercent / 100);
      const stampHeight = stampWidth * (image.height / image.width);
      const origin = stampPosition(width, height, stampWidth, stampHeight, options.position, options.customX, options.customY);
      page.drawImage(image, {
        x: origin.x,
        y: origin.y,
        width: stampWidth,
        height: stampHeight,
        opacity,
        rotate: degrees(rotation),
      });
    }
  }

  return pdf.save({ useObjectStreams: true });
}
