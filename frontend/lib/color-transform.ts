export type ColorTransformMode =
  | 'invert'
  | 'grayscale'
  | 'white-on-black'
  | 'black-on-white'
  | 'yellow-on-black'
  | 'green-on-black'
  | 'custom';

export type Rgb = { r: number; g: number; b: number };

export type ColorTransformOptions = {
  mode: ColorTransformMode;
  threshold?: number;
  textColor?: string;
  backgroundColor?: string;
};

export function parseRgbHex(value: string, fallback: Rgb): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return fallback;
  const raw = match[1];
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

export function luminance(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

export function highContrastPalette(mode: ColorTransformMode, options: ColorTransformOptions): { text: Rgb; background: Rgb } {
  switch (mode) {
    case 'white-on-black': return { text: { r: 255, g: 255, b: 255 }, background: { r: 0, g: 0, b: 0 } };
    case 'black-on-white': return { text: { r: 0, g: 0, b: 0 }, background: { r: 255, g: 255, b: 255 } };
    case 'yellow-on-black': return { text: { r: 255, g: 230, b: 0 }, background: { r: 0, g: 0, b: 0 } };
    case 'green-on-black': return { text: { r: 80, g: 255, b: 120 }, background: { r: 0, g: 0, b: 0 } };
    case 'custom': return {
      text: parseRgbHex(options.textColor ?? '', { r: 255, g: 255, b: 255 }),
      background: parseRgbHex(options.backgroundColor ?? '', { r: 0, g: 0, b: 0 }),
    };
    default: return { text: { r: 255, g: 255, b: 255 }, background: { r: 0, g: 0, b: 0 } };
  }
}

export function transformRgba(data: Uint8ClampedArray, options: ColorTransformOptions): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data);
  const threshold = Math.max(0, Math.min(255, Math.round(options.threshold ?? 160)));
  const palette = highContrastPalette(options.mode, options);

  for (let index = 0; index + 3 < output.length; index += 4) {
    const r = output[index];
    const g = output[index + 1];
    const b = output[index + 2];

    if (options.mode === 'invert') {
      output[index] = 255 - r;
      output[index + 1] = 255 - g;
      output[index + 2] = 255 - b;
      continue;
    }

    const gray = luminance(r, g, b);
    if (options.mode === 'grayscale') {
      output[index] = gray;
      output[index + 1] = gray;
      output[index + 2] = gray;
      continue;
    }

    // Treat darker pixels as foreground/text and lighter pixels as background.
    // This intentionally produces a two-color accessibility transform rather
    // than pretending to preserve original vector colors.
    const target = gray < threshold ? palette.text : palette.background;
    output[index] = target.r;
    output[index + 1] = target.g;
    output[index + 2] = target.b;
  }

  return output;
}
