export type AutoRedactRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AutoRedactMatch = {
  text: string;
  terms: string[];
  rect: AutoRedactRect;
};

type PdfJsTextItemLike = {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
};

type PdfJsTextContentLike = {
  items?: unknown;
};

type PdfJsViewportLike = {
  transform?: unknown;
  scale?: unknown;
  width?: unknown;
  height?: unknown;
};

const DEFAULT_PADDING = 1.5;

export function normalizeAutoRedactTerms(raw: string, caseSensitive = false): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const term = line.trim();
    if (!term) continue;
    const key = caseSensitive ? term : term.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

function multiplyTransform(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function finiteSix(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 6) return null;
  const result = value.slice(0, 6).map(Number);
  return result.every(Number.isFinite) ? result : null;
}

function itemRect(item: PdfJsTextItemLike, viewport: PdfJsViewportLike, padding: number): AutoRedactRect | null {
  const itemTransform = finiteSix(item.transform);
  const viewportTransform = finiteSix(viewport.transform);
  if (!itemTransform || !viewportTransform) return null;

  const tx = multiplyTransform(viewportTransform, itemTransform);
  const viewportScale = Number.isFinite(Number(viewport.scale)) ? Math.abs(Number(viewport.scale)) : 1;
  const fontHeight = Math.max(
    Math.hypot(tx[2], tx[3]),
    Math.abs(Number(item.height) || 0) * viewportScale,
  );
  const advance = Math.abs(Number(item.width) || 0) * viewportScale;
  if (!(fontHeight > 0) || !(advance > 0)) return null;

  const angle = Math.atan2(tx[1], tx[0]);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = Math.sin(angle);
  const vy = -Math.cos(angle);
  const x0 = tx[4];
  const y0 = tx[5];
  const points = [
    [x0, y0],
    [x0 + ux * advance, y0 + uy * advance],
    [x0 + vx * fontHeight, y0 + vy * fontHeight],
    [x0 + ux * advance + vx * fontHeight, y0 + uy * advance + vy * fontHeight],
  ];
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const viewportWidth = Number(viewport.width);
  const viewportHeight = Number(viewport.height);
  let left = Math.min(...xs) - padding;
  let top = Math.min(...ys) - padding;
  let right = Math.max(...xs) + padding;
  let bottom = Math.max(...ys) + padding;

  if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
    left = Math.max(0, Math.min(viewportWidth, left));
    right = Math.max(0, Math.min(viewportWidth, right));
  }
  if (Number.isFinite(viewportHeight) && viewportHeight > 0) {
    top = Math.max(0, Math.min(viewportHeight, top));
    bottom = Math.max(0, Math.min(viewportHeight, bottom));
  }
  if (!(right > left) || !(bottom > top)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function findAutoRedactMatches(
  textContent: PdfJsTextContentLike,
  viewport: PdfJsViewportLike,
  terms: string[],
  caseSensitive = false,
  padding = DEFAULT_PADDING,
): AutoRedactMatch[] {
  if (!Number.isFinite(padding) || padding < 0 || padding > 20) throw new Error('Auto-redact padding must be between 0 and 20 points.');
  const normalizedTerms = terms.map((term) => term.trim()).filter(Boolean);
  if (normalizedTerms.length === 0) return [];
  const searchableTerms = normalizedTerms.map((term) => caseSensitive ? term : term.toLocaleLowerCase('vi'));
  const items = Array.isArray(textContent.items) ? textContent.items : [];
  const matches: AutoRedactMatch[] = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as PdfJsTextItemLike;
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const haystack = caseSensitive ? item.str : item.str.toLocaleLowerCase('vi');
    const matchedTerms = normalizedTerms.filter((_, index) => haystack.includes(searchableTerms[index]));
    if (matchedTerms.length === 0) continue;
    const rect = itemRect(item, viewport, padding);
    if (!rect) continue;
    matches.push({ text: item.str, terms: matchedTerms, rect });
  }

  return matches;
}
