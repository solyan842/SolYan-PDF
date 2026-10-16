export type PdfImageFormat = 'png' | 'jpeg' | 'webp';
export type PdfImageColorMode = 'color' | 'greyscale' | 'blackwhite';
export type PdfImageOutputMode = 'multiple' | 'single';

export const PDF_IMAGE_DPI_OPTIONS = [96, 150, 200, 300] as const;

export function imageMime(format: PdfImageFormat): string {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

export function imageExtension(format: PdfImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function dpiToScale(dpi: number): number {
  if (!PDF_IMAGE_DPI_OPTIONS.includes(dpi as (typeof PDF_IMAGE_DPI_OPTIONS)[number])) {
    throw new Error('DPI không được hỗ trợ.');
  }
  return dpi / 72;
}

export function applyCanvasColorMode(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: PdfImageColorMode,
): void {
  if (mode === 'color') return;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    const luminance = Math.round(
      0.2126 * data[offset]
      + 0.7152 * data[offset + 1]
      + 0.0722 * data[offset + 2],
    );
    const value = mode === 'blackwhite' ? (luminance >= 128 ? 255 : 0) : luminance;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

export async function canvasToImageBlob(
  canvas: HTMLCanvasElement,
  format: PdfImageFormat,
  quality = 0.92,
): Promise<Blob> {
  const mime = imageMime(format);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error(`Trình duyệt không thể mã hóa ${format.toUpperCase()} từ Canvas.`)),
      mime,
      format === 'png' ? undefined : quality,
    );
  });
  if (format === 'webp' && blob.type !== 'image/webp') {
    throw new Error('Trình duyệt này không hỗ trợ mã hóa WebP bằng Canvas. Hãy chọn PNG hoặc JPEG.');
  }
  return blob;
}
