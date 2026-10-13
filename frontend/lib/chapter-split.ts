import { PDFDocument } from 'pdf-lib';
import { BookmarkNode, extractPdfBookmarks } from './bookmarks';
import { copySelectedPages } from './pdf-client';

export const MAX_CHAPTER_SPLIT_PAGES = 500;
export const MAX_CHAPTERS = 500;

export type ChapterRange = {
  title: string;
  startPage: number;
  endPage: number;
  depth: number;
};

export type ChapterPart = ChapterRange & {
  filename: string;
  bytes: Uint8Array;
};

type ChapterPoint = {
  title: string;
  pageNumber: number;
  depth: number;
  order: number;
};

function clampPage(page: number, pageCount: number): number {
  return Math.min(pageCount, Math.max(1, Math.trunc(Number.isFinite(page) ? page : 1)));
}

function collectBookmarkPoints(
  nodes: BookmarkNode[],
  pageCount: number,
  maxDepth: number,
  depth = 0,
  state = { order: 0 },
): ChapterPoint[] {
  const points: ChapterPoint[] = [];
  for (const node of nodes) {
    points.push({
      title: node.title.trim() || 'Chapter',
      pageNumber: clampPage(node.pageNumber, pageCount),
      depth,
      order: state.order++,
    });
    if (depth < maxDepth && node.children.length) {
      points.push(...collectBookmarkPoints(node.children, pageCount, maxDepth, depth + 1, state));
    }
  }
  return points;
}

function mergeDuplicateStarts(points: ChapterPoint[]): ChapterPoint[] {
  const merged: ChapterPoint[] = [];
  for (const point of points) {
    const previous = merged[merged.length - 1];
    if (previous && previous.pageNumber === point.pageNumber) {
      previous.title = `${previous.title} · ${point.title}`.slice(0, 240);
      previous.depth = Math.min(previous.depth, point.depth);
    } else {
      merged.push({ ...point });
    }
  }
  return merged;
}

export function planBookmarkChapters(
  bookmarks: BookmarkNode[],
  pageCount: number,
  maxDepth = 0,
  allowDuplicates = false,
): ChapterRange[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('PDF không có trang hợp lệ.');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 15) {
    throw new Error('Độ sâu bookmark phải là số nguyên từ 0 đến 15.');
  }
  const points = collectBookmarkPoints(bookmarks, pageCount, maxDepth);
  if (!points.length) throw new Error('PDF không có bookmark/outline phù hợp để tách.');
  points.sort((a, b) => a.pageNumber - b.pageNumber || a.order - b.order);
  const selected = allowDuplicates ? points : mergeDuplicateStarts(points);
  if (selected.length > MAX_CHAPTERS) throw new Error(`Số chapter vượt quá giới hạn ${MAX_CHAPTERS}.`);

  return selected.map((point, index) => {
    const nextStart = selected[index + 1]?.pageNumber;
    const endPage = nextStart === undefined ? pageCount : Math.max(point.pageNumber, nextStart - 1);
    return {
      title: point.title,
      startPage: point.pageNumber,
      endPage,
      depth: point.depth,
    };
  });
}

export function chapterFilename(index: number, title: string, total: number): string {
  const width = Math.max(2, String(total).length);
  const safeTitle = title
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120) || `chapter-${index + 1}`;
  return `${String(index + 1).padStart(width, '0')} ${safeTitle}.pdf`;
}

export async function splitPdfByBookmarks(
  sourceBytes: ArrayBuffer | Uint8Array,
  maxDepth = 0,
  allowDuplicates = false,
): Promise<ChapterPart[]> {
  const source = await PDFDocument.load(sourceBytes);
  const pageCount = source.getPageCount();
  if (!pageCount) throw new Error('PDF không có trang.');
  if (pageCount > MAX_CHAPTER_SPLIT_PAGES) {
    throw new Error(`Tách theo bookmark giới hạn ${MAX_CHAPTER_SPLIT_PAGES} trang để tránh quá tải trình duyệt.`);
  }

  const bookmarks = await extractPdfBookmarks(sourceBytes);
  const ranges = planBookmarkChapters(bookmarks, pageCount, maxDepth, allowDuplicates);
  const parts: ChapterPart[] = [];
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const indexes = Array.from(
      { length: range.endPage - range.startPage + 1 },
      (_, offset) => range.startPage - 1 + offset,
    );
    const output = await copySelectedPages(source, indexes);
    parts.push({
      ...range,
      filename: chapterFilename(index, range.title, ranges.length),
      bytes: await output.save({ useObjectStreams: true }),
    });
  }
  return parts;
}
