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

export type SafeAutoRedactPattern = {
  label: string;
  regex: RegExp;
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
const MAX_SAFE_REGEX_LENGTH = 200;
const MAX_SAFE_REGEX_COMPLEXITY = 4096;
const MAX_SAFE_REGEX_ALTERNATIVES = 16;
const MAX_REGEX_TEXT_RUN_LENGTH = 4096;
const UNICODE_WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

export const SAFE_AUTO_REDACT_PRESETS = {
  '<EMAIL>': '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,63}',
  '<CARD>': '\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}',
  '<SSN>': '\\d{3}-\\d{2}-\\d{4}',
  '<VN_PHONE>': '[+]84[ .-]?\\d{9,10}|0\\d{9,10}',
  '<IBAN>': '[A-Z]{2}\\d{2}[A-Z0-9]{11,30}',
} as const;

export function normalizeAutoRedactTerms(raw: string, caseSensitive = false): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const term = line.trim();
    if (!term) continue;
    const normalized = term.normalize('NFC');
    const key = caseSensitive ? normalized : normalized.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

function codePointAtIndex(text: string, index: number): string | null {
  if (index < 0 || index >= text.length) return null;
  const point = text.codePointAt(index);
  return point === undefined ? null : String.fromCodePoint(point);
}

function codePointBeforeIndex(text: string, index: number): string | null {
  if (index <= 0 || index > text.length) return null;
  let start = index - 1;
  const unit = text.charCodeAt(start);
  if (unit >= 0xdc00 && unit <= 0xdfff && start > 0) {
    const previous = text.charCodeAt(start - 1);
    if (previous >= 0xd800 && previous <= 0xdbff) start -= 1;
  }
  return text.slice(start, index);
}

function isUnicodeWordChar(value: string | null): boolean {
  return value !== null && UNICODE_WORD_CHAR.test(value);
}

function hasWholeWordOccurrence(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const firstNeedle = codePointAtIndex(needle, 0);
  const lastNeedle = codePointBeforeIndex(needle, needle.length);
  const requiresLeftBoundary = isUnicodeWordChar(firstNeedle);
  const requiresRightBoundary = isUnicodeWordChar(lastNeedle);
  let fromIndex = 0;

  while (fromIndex <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, fromIndex);
    if (index < 0) return false;
    const before = codePointBeforeIndex(haystack, index);
    const after = codePointAtIndex(haystack, index + needle.length);
    const leftOk = !requiresLeftBoundary || !isUnicodeWordChar(before);
    const rightOk = !requiresRightBoundary || !isUnicodeWordChar(after);
    if (leftOk && rightOk) return true;
    fromIndex = index + 1;
  }

  return false;
}

export function autoRedactLiteralMatches(
  haystack: string,
  needle: string,
  wholeWord = false,
): boolean {
  if (!needle) return false;
  const normalizedHaystack = haystack.normalize('NFC');
  const normalizedNeedle = needle.normalize('NFC');
  return wholeWord
    ? hasWholeWordOccurrence(normalizedHaystack, normalizedNeedle)
    : normalizedHaystack.includes(normalizedNeedle);
}

function validateCustomSafeRegex(source: string): void {
  if (!source) throw new Error('Safe Regex không được để trống.');
  if (source.length > MAX_SAFE_REGEX_LENGTH) {
    throw new Error(`Safe Regex tối đa ${MAX_SAFE_REGEX_LENGTH} ký tự.`);
  }

  let inClass = false;
  let escaped = false;
  let complexity = 1;
  let alternatives = 1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      if (!inClass && /[1-9]/.test(char)) {
        throw new Error('Safe Regex không hỗ trợ backreference (\\1…\\9).');
      }
      if (!inClass && (char === 'k' || char === 'g')) {
        throw new Error('Safe Regex không hỗ trợ named/subroutine backreference.');
      }
      if (!inClass && (char === 'b' || char === 'B')) {
        throw new Error('Safe Regex không hỗ trợ zero-width word boundary \\b/\\B.');
      }
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '[' && !inClass) {
      inClass = true;
      continue;
    }
    if (char === ']' && inClass) {
      inClass = false;
      continue;
    }
    if (inClass) continue;

    if (char === '(' || char === ')') {
      throw new Error('Safe Regex không hỗ trợ group/lookaround. Hãy dùng alternation | hoặc preset có sẵn.');
    }
    if (char === '*' || char === '+') {
      throw new Error('Safe Regex tùy chỉnh không cho phép * hoặc +. Hãy dùng {m,n} có giới hạn hoặc preset có sẵn.');
    }
    if (char === '|') {
      alternatives += 1;
      if (alternatives > MAX_SAFE_REGEX_ALTERNATIVES) {
        throw new Error(`Safe Regex tối đa ${MAX_SAFE_REGEX_ALTERNATIVES} nhánh alternation.`);
      }
      continue;
    }
    if (char === '?') {
      complexity *= 2;
      if (complexity > MAX_SAFE_REGEX_COMPLEXITY) {
        throw new Error('Safe Regex có quá nhiều nhánh tùy chọn. Hãy đơn giản hóa pattern.');
      }
      continue;
    }
    if (char !== '{') continue;

    const close = source.indexOf('}', index + 1);
    if (close < 0) throw new Error('Safe Regex có quantifier {…} chưa đóng.');
    const body = source.slice(index + 1, close);
    const match = /^(\d{1,3})(?:,(\d{1,3}))?$/.exec(body);
    if (!match) {
      throw new Error('Safe Regex chỉ cho phép quantifier hữu hạn {m} hoặc {m,n}; không cho phép {m,}.');
    }
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : Number(match[2]);
    if (min > max || max > 64) {
      throw new Error('Safe Regex yêu cầu 0 ≤ m ≤ n ≤ 64 trong quantifier {m,n}.');
    }
    complexity *= max - min + 1;
    if (complexity > MAX_SAFE_REGEX_COMPLEXITY) {
      throw new Error('Safe Regex có độ phân nhánh quá lớn. Hãy giảm các khoảng {m,n}.');
    }
    index = close;
  }

  if (escaped) throw new Error('Safe Regex kết thúc bằng dấu \\ chưa hoàn chỉnh.');
  if (inClass) throw new Error('Safe Regex có character class […] chưa đóng.');
}

export function compileSafeAutoRedactPatterns(
  patterns: string[],
  caseSensitive = false,
): SafeAutoRedactPattern[] {
  const flags = caseSensitive ? 'u' : 'iu';
  return patterns.map((pattern) => {
    const preset = SAFE_AUTO_REDACT_PRESETS[pattern as keyof typeof SAFE_AUTO_REDACT_PRESETS];
    const source = preset ?? pattern;
    if (!preset) validateCustomSafeRegex(source);
    try {
      const regex = new RegExp(source, flags);
      if (regex.test('')) {
        throw new Error('pattern có thể match chuỗi rỗng và có nguy cơ redact mọi text-run');
      }
      return { label: pattern, regex };
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'pattern không hợp lệ';
      throw new Error(`Safe Regex "${pattern}" không hợp lệ: ${detail}`);
    }
  });
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

function normalizedItems(textContent: PdfJsTextContentLike): PdfJsTextItemLike[] {
  const items = Array.isArray(textContent.items) ? textContent.items : [];
  return items.filter((item): item is PdfJsTextItemLike => Boolean(item) && typeof item === 'object');
}

export function findAutoRedactMatches(
  textContent: PdfJsTextContentLike,
  viewport: PdfJsViewportLike,
  terms: string[],
  caseSensitive = false,
  padding = DEFAULT_PADDING,
  wholeWord = false,
): AutoRedactMatch[] {
  if (!Number.isFinite(padding) || padding < 0 || padding > 20) throw new Error('Auto-redact padding must be between 0 and 20 points.');
  const normalizedTerms = terms.map((term) => term.trim()).filter(Boolean);
  if (normalizedTerms.length === 0) return [];
  const searchableTerms = normalizedTerms.map((term) => {
    const normalized = term.normalize('NFC');
    return caseSensitive ? normalized : normalized.toLocaleLowerCase('vi');
  });
  const matches: AutoRedactMatch[] = [];

  for (const item of normalizedItems(textContent)) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const text = item.str;
    const normalizedText = text.normalize('NFC');
    const haystack = caseSensitive ? normalizedText : normalizedText.toLocaleLowerCase('vi');
    const matchedTerms = normalizedTerms.filter((_, index) => autoRedactLiteralMatches(haystack, searchableTerms[index], wholeWord));
    if (matchedTerms.length === 0) continue;
    const rect = itemRect(item, viewport, padding);
    if (!rect) continue;
    matches.push({ text, terms: matchedTerms, rect });
  }

  return matches;
}

export function findSafeRegexAutoRedactMatches(
  textContent: PdfJsTextContentLike,
  viewport: PdfJsViewportLike,
  patterns: SafeAutoRedactPattern[],
  padding = DEFAULT_PADDING,
): AutoRedactMatch[] {
  if (!Number.isFinite(padding) || padding < 0 || padding > 20) throw new Error('Auto-redact padding must be between 0 and 20 points.');
  if (patterns.length === 0) return [];
  const matches: AutoRedactMatch[] = [];

  for (const item of normalizedItems(textContent)) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const text = item.str;
    if (text.length > MAX_REGEX_TEXT_RUN_LENGTH) {
      throw new Error(`Safe Regex gặp text-run dài hơn ${MAX_REGEX_TEXT_RUN_LENGTH} ký tự. Hãy dùng chế độ Literal hoặc chia tài liệu.`);
    }
    const matchedTerms = patterns.filter((pattern) => pattern.regex.test(text)).map((pattern) => pattern.label);
    if (matchedTerms.length === 0) continue;
    const rect = itemRect(item, viewport, padding);
    if (!rect) continue;
    matches.push({ text, terms: matchedTerms, rect });
  }

  return matches;
}
