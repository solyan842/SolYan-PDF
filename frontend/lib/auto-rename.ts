export type AutoRenameLine = {
  text: string;
  fontSize: number;
  page: number;
  order: number;
};

export type AutoRenameSuggestion = {
  filename: string;
  title: string | null;
  fontSize: number | null;
  page: number | null;
  fallback: boolean;
};

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function originalPdfFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'document.pdf';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

export function sanitizePdfBaseName(value: string): string {
  let clean = value
    .normalize('NFKC')
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!clean || WINDOWS_RESERVED.test(clean)) return '';

  // Keep the final filename comfortably below the common 255-byte/name ceiling.
  // Slice by Unicode code points rather than UTF-16 code units.
  clean = Array.from(clean).slice(0, 180).join('').trim().replace(/[. ]+$/g, '');
  return WINDOWS_RESERVED.test(clean) ? '' : clean;
}

export function chooseAutoRenameSuggestion(
  lines: AutoRenameLine[],
  originalName: string,
): AutoRenameSuggestion {
  const candidates = lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => b.fontSize - a.fontSize || a.order - b.order);

  for (const candidate of candidates) {
    const base = sanitizePdfBaseName(candidate.text);
    if (!base) continue;
    return {
      filename: `${base}.pdf`,
      title: candidate.text,
      fontSize: candidate.fontSize,
      page: candidate.page,
      fallback: false,
    };
  }

  return {
    filename: originalPdfFilename(originalName),
    title: null,
    fontSize: null,
    page: null,
    fallback: true,
  };
}

export async function extractAutoRenameLines(
  pdf: { numPages: number; getPage: (pageNumber: number) => Promise<any> },
  maxLines = 200,
): Promise<AutoRenameLine[]> {
  const lines: AutoRenameLine[] = [];
  let order = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages && lines.length < maxLines; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const fragments = content.items
      .filter((item: any) => 'str' in item && typeof item.str === 'string' && item.str.trim())
      .map((item: any) => {
        const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
        const fontSize = Math.max(
          Number(item.height) || 0,
          Math.abs(Number(transform[0]) || 0),
          Math.abs(Number(transform[3]) || 0),
        );
        return {
          text: item.str as string,
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
          fontSize: fontSize || 1,
        };
      })
      .sort((a: any, b: any) => b.y - a.y || a.x - b.x);

    const pageLines: Array<{ y: number; fontSize: number; parts: Array<{ x: number; text: string }> }> = [];
    for (const fragment of fragments) {
      const tolerance = Math.max(2, fragment.fontSize * 0.35);
      let line = pageLines.find((candidate) => Math.abs(candidate.y - fragment.y) <= tolerance);
      if (!line) {
        line = { y: fragment.y, fontSize: fragment.fontSize, parts: [] };
        pageLines.push(line);
      }
      line.parts.push({ x: fragment.x, text: fragment.text });
      line.fontSize = Math.max(line.fontSize, fragment.fontSize);
    }

    pageLines.sort((a, b) => b.y - a.y);
    for (const line of pageLines) {
      if (lines.length >= maxLines) break;
      const text = line.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      lines.push({ text, fontSize: line.fontSize, page: pageNumber, order });
      order += 1;
    }
  }

  return lines;
}
