export function parseRgbHex(value, fallback) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!match) return { ...fallback };
  const raw = match[1];
  return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
}

export function highContrastPalette(mode, options = {}) {
  switch (mode) {
    case 'white-on-black': return { text: { r: 255, g: 255, b: 255 }, background: { r: 0, g: 0, b: 0 } };
    case 'black-on-white': return { text: { r: 0, g: 0, b: 0 }, background: { r: 255, g: 255, b: 255 } };
    case 'yellow-on-black': return { text: { r: 255, g: 230, b: 0 }, background: { r: 0, g: 0, b: 0 } };
    case 'green-on-black': return { text: { r: 80, g: 255, b: 120 }, background: { r: 0, g: 0, b: 0 } };
    case 'custom': return {
      text: parseRgbHex(options.textColor, { r: 255, g: 255, b: 255 }),
      background: parseRgbHex(options.backgroundColor, { r: 0, g: 0, b: 0 }),
    };
    default: return { text: { r: 255, g: 255, b: 255 }, background: { r: 0, g: 0, b: 0 } };
  }
}

export function transformRgba(data, options) {
  const output = new Uint8ClampedArray(data);
  const threshold = Math.max(0, Math.min(255, Math.round(options.threshold ?? 160)));
  const palette = highContrastPalette(options.mode, options);
  for (let index = 0; index + 3 < output.length; index += 4) {
    const r = output[index], g = output[index + 1], b = output[index + 2];
    if (options.mode === 'invert') {
      output[index] = 255 - r; output[index + 1] = 255 - g; output[index + 2] = 255 - b;
    } else {
      const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      if (options.mode === 'grayscale') output[index] = output[index + 1] = output[index + 2] = gray;
      else {
        const target = gray < threshold ? palette.text : palette.background;
        output[index] = target.r; output[index + 1] = target.g; output[index + 2] = target.b;
      }
    }
  }
  return output;
}

export const SCANNER_QUALITY_PRESETS = Object.freeze({
  high: { dpi: 150, blur: 0.1, noise: 1.0, brightness: 1.03, contrast: 1.06 },
  medium: { dpi: 100, blur: 0.1, noise: 1.0, brightness: 1.06, contrast: 1.12 },
  low: { dpi: 75, blur: 0.9, noise: 2.5, brightness: 1.08, contrast: 1.15 },
});
const ROTATION_VARIANCE = Object.freeze({ none: 0, slight: 2, moderate: 5, severe: 8 });
const clampByte = value => Math.max(0, Math.min(255, Math.round(value)));

function xorshift32(seed) {
  let state = (seed | 0) || 0x6d2b79f5;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}
function gaussian(random) { let value = 0; for (let i = 0; i < 6; i++) value += random(); return value - 3; }

export function scannerPageSeed(pageIndex, salt = 0x534f4c59) {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) throw new Error('Số trang phải là số nguyên không âm.');
  return (Math.imul(pageIndex + 1, 0x9e3779b1) ^ salt) >>> 0;
}

export function deterministicScannerRotation(pageIndex, rotation, salt = 0x534f4c59) {
  const variance = ROTATION_VARIANCE[rotation];
  if (variance === undefined) throw new Error('Mức xoay scan không hợp lệ.');
  if (!variance) return 0;
  const random = xorshift32(scannerPageSeed(pageIndex, salt));
  return (random() * 2 - 1) * variance;
}

export function applyScannerPixelEffects(data, width, height, options) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.length !== width * height * 4) {
    throw new Error('Kích thước raster scan không hợp lệ.');
  }
  if (!Number.isFinite(options.brightness) || options.brightness < 0.25 || options.brightness > 3) throw new Error('Độ sáng nằm ngoài giới hạn.');
  if (!Number.isFinite(options.contrast) || options.contrast < 0.25 || options.contrast > 3) throw new Error('Độ tương phản nằm ngoài giới hạn.');
  if (!Number.isFinite(options.noise) || options.noise < 0 || options.noise > 25) throw new Error('Nhiễu nằm ngoài giới hạn.');
  const output = new Uint8ClampedArray(data), random = xorshift32(options.seed);
  const noiseStrength = options.noise * Math.min(width, height) / 1000;
  const contrastOffset = 128 - 128 * options.contrast;
  for (let i = 0; i + 3 < output.length; i += 4) {
    let r = (output[i] * options.contrast + contrastOffset) * options.brightness;
    let g = (output[i + 1] * options.contrast + contrastOffset) * options.brightness;
    let b = (output[i + 2] * options.contrast + contrastOffset) * options.brightness;
    if (options.yellowish) {
      const light = (Math.max(0, r) + Math.max(0, g) + Math.max(0, b)) / 765;
      r += (255 - r) * 0.18 * light; g += (255 - g) * 0.12 * light; b *= 1 - 0.25 * light;
    }
    if (noiseStrength > 0) { r += gaussian(random) * noiseStrength; g += gaussian(random) * noiseStrength; b += gaussian(random) * noiseStrength; }
    if (options.colorspace === 'grayscale') {
      const gray = clampByte((r + g + b) / 3); output[i] = output[i + 1] = output[i + 2] = gray;
    } else { output[i] = clampByte(r); output[i + 1] = clampByte(g); output[i + 2] = clampByte(b); }
  }
  return output;
}
