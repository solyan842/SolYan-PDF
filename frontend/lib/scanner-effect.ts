export type ScannerQuality = 'high' | 'medium' | 'low';
export type ScannerRotation = 'none' | 'slight' | 'moderate' | 'severe';
export type ScannerColorspace = 'grayscale' | 'color';

export type ScannerPreset = {
  dpi: number;
  blur: number;
  noise: number;
  brightness: number;
  contrast: number;
};

export type ScannerPixelOptions = {
  colorspace: ScannerColorspace;
  brightness: number;
  contrast: number;
  noise: number;
  yellowish: boolean;
  seed: number;
};

export const SCANNER_QUALITY_PRESETS: Record<ScannerQuality, ScannerPreset> = {
  high: { dpi: 150, blur: 0.1, noise: 1.0, brightness: 1.03, contrast: 1.06 },
  medium: { dpi: 100, blur: 0.1, noise: 1.0, brightness: 1.06, contrast: 1.12 },
  low: { dpi: 75, blur: 0.9, noise: 2.5, brightness: 1.08, contrast: 1.15 },
};

export const SCANNER_ROTATION_VARIANCE: Record<ScannerRotation, number> = {
  none: 0,
  slight: 2,
  moderate: 5,
  severe: 8,
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function xorshift32(seed: number): () => number {
  let state = (seed | 0) || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function approximateGaussian(random: () => number): number {
  // Sum of six independent uniforms is a stable, bounded approximation of a
  // centered Gaussian. A deterministic PRNG keeps the browser output and CI
  // fixtures reproducible instead of making every invocation untestable.
  let value = 0;
  for (let index = 0; index < 6; index += 1) value += random();
  return value - 3;
}

export function scannerPageSeed(pageIndex: number, salt = 0x534f4c59): number {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) throw new Error('Scanner page index must be a non-negative integer.');
  return (Math.imul(pageIndex + 1, 0x9e3779b1) ^ salt) >>> 0;
}

export function deterministicScannerRotation(pageIndex: number, rotation: ScannerRotation, salt = 0x534f4c59): number {
  const variance = SCANNER_ROTATION_VARIANCE[rotation];
  if (variance === 0) return 0;
  const random = xorshift32(scannerPageSeed(pageIndex, salt));
  return (random() * 2 - 1) * variance;
}

export function applyScannerPixelEffects(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: ScannerPixelOptions,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Scanner raster dimensions must be positive integers.');
  }
  if (data.length !== width * height * 4) throw new Error('Scanner RGBA buffer size does not match its dimensions.');
  if (!Number.isFinite(options.brightness) || options.brightness < 0.25 || options.brightness > 3) {
    throw new Error('Scanner brightness must be between 0.25 and 3.');
  }
  if (!Number.isFinite(options.contrast) || options.contrast < 0.25 || options.contrast > 3) {
    throw new Error('Scanner contrast must be between 0.25 and 3.');
  }
  if (!Number.isFinite(options.noise) || options.noise < 0 || options.noise > 25) {
    throw new Error('Scanner noise must be between 0 and 25.');
  }

  const output = new Uint8ClampedArray(data);
  const random = xorshift32(options.seed);
  const noiseStrength = options.noise * Math.min(width, height) / 1000;
  const contrastOffset = 128 - 128 * options.contrast;

  for (let index = 0; index + 3 < output.length; index += 4) {
    let r = (output[index] * options.contrast + contrastOffset) * options.brightness;
    let g = (output[index + 1] * options.contrast + contrastOffset) * options.brightness;
    let b = (output[index + 2] * options.contrast + contrastOffset) * options.brightness;

    if (options.yellowish) {
      const normalizedBrightness = (Math.max(0, r) + Math.max(0, g) + Math.max(0, b)) / 765;
      r += (255 - r) * 0.18 * normalizedBrightness;
      g += (255 - g) * 0.12 * normalizedBrightness;
      b *= 1 - 0.25 * normalizedBrightness;
    }

    if (noiseStrength > 0) {
      r += approximateGaussian(random) * noiseStrength;
      g += approximateGaussian(random) * noiseStrength;
      b += approximateGaussian(random) * noiseStrength;
    }

    if (options.colorspace === 'grayscale') {
      const gray = clampByte((r + g + b) / 3);
      output[index] = gray;
      output[index + 1] = gray;
      output[index + 2] = gray;
    } else {
      output[index] = clampByte(r);
      output[index + 1] = clampByte(g);
      output[index + 2] = clampByte(b);
    }
  }

  return output;
}
