export type ImagesToPdfFitMode = 'image_size' | 'a4_fill' | 'a4_fit';

export type ImagePagePlacement = {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MAX_IMAGE_PAGE_SIDE = 14_400;

export function imagePagePlacement(
  imageWidth: number,
  imageHeight: number,
  mode: ImagesToPdfFitMode,
  autoRotate: boolean,
): ImagePagePlacement {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) {
    throw new Error('Kích thước ảnh không hợp lệ.');
  }

  if (mode === 'image_size') {
    const ratio = Math.min(1, MAX_IMAGE_PAGE_SIDE / Math.max(imageWidth, imageHeight));
    const width = imageWidth * ratio;
    const height = imageHeight * ratio;
    return { pageWidth: width, pageHeight: height, x: 0, y: 0, width, height };
  }

  const landscape = imageWidth > imageHeight;
  const pageWidth = autoRotate && landscape ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = autoRotate && landscape ? A4_WIDTH : A4_HEIGHT;

  if (mode === 'a4_fill') {
    return { pageWidth, pageHeight, x: 0, y: 0, width: pageWidth, height: pageHeight };
  }

  const ratio = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const width = imageWidth * ratio;
  const height = imageHeight * ratio;
  return {
    pageWidth,
    pageHeight,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}
