import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFObject,
  PDFRef,
  PDFString,
} from 'pdf-lib';

export type BookmarkNode = {
  title: string;
  pageNumber: number;
  children: BookmarkNode[];
};

export const MAX_BOOKMARK_NODES = 1000;
export const MAX_BOOKMARK_DEPTH = 16;
export const MAX_BOOKMARK_TITLE_LENGTH = 512;

const FIRST = PDFName.of('First');
const LAST = PDFName.of('Last');
const NEXT = PDFName.of('Next');
const PREV = PDFName.of('Prev');
const PARENT = PDFName.of('Parent');
const TITLE = PDFName.of('Title');
const DEST = PDFName.of('Dest');
const ACTION = PDFName.of('A');
const ACTION_TYPE = PDFName.of('S');
const ACTION_DEST = PDFName.of('D');
const COUNT = PDFName.of('Count');
const OUTLINES = PDFName.of('Outlines');

function clampPage(pageNumber: number, pageCount: number): number {
  if (!Number.isFinite(pageNumber)) return 1;
  return Math.min(pageCount, Math.max(1, Math.trunc(pageNumber)));
}

function normalizeNodes(nodes: BookmarkNode[], pageCount: number, depth = 1, counter = { value: 0 }): BookmarkNode[] {
  if (depth > MAX_BOOKMARK_DEPTH) throw new Error(`Bookmark vượt quá ${MAX_BOOKMARK_DEPTH} cấp lồng nhau.`);
  return nodes.map((node) => {
    counter.value += 1;
    if (counter.value > MAX_BOOKMARK_NODES) throw new Error(`Bookmark vượt quá giới hạn ${MAX_BOOKMARK_NODES} mục.`);
    const title = String(node.title ?? '').trim();
    if (!title) throw new Error('Tiêu đề bookmark không được để trống.');
    if (title.length > MAX_BOOKMARK_TITLE_LENGTH) {
      throw new Error(`Tiêu đề bookmark vượt quá ${MAX_BOOKMARK_TITLE_LENGTH} ký tự.`);
    }
    const children = Array.isArray(node.children) ? node.children : [];
    return {
      title,
      pageNumber: clampPage(Number(node.pageNumber), pageCount),
      children: normalizeNodes(children, pageCount, depth + 1, counter),
    };
  });
}

function lookupObject(document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined {
  if (!object) return undefined;
  if (object instanceof PDFRef) return document.context.lookup(object);
  return object;
}

function lookupDict(document: PDFDocument, object: PDFObject | undefined): PDFDict | undefined {
  const resolved = lookupObject(document, object);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function lookupArray(document: PDFDocument, object: PDFObject | undefined): PDFArray | undefined {
  const resolved = lookupObject(document, object);
  return resolved instanceof PDFArray ? resolved : undefined;
}

function decodeTitle(document: PDFDocument, dict: PDFDict): string {
  const value = lookupObject(document, dict.get(TITLE));
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText();
  return '';
}

function pageNumberFromDestination(document: PDFDocument, destination: PDFObject | undefined, pageRefs: Map<string, number>): number | undefined {
  const array = lookupArray(document, destination);
  if (!array || array.size() < 1) return undefined;
  const pageObject = array.get(0);
  if (pageObject instanceof PDFRef) return pageRefs.get(pageObject.toString());
  return undefined;
}

function pageNumberFromItem(document: PDFDocument, dict: PDFDict, pageRefs: Map<string, number>): number | undefined {
  const direct = pageNumberFromDestination(document, dict.get(DEST), pageRefs);
  if (direct) return direct;
  const action = lookupDict(document, dict.get(ACTION));
  if (!action) return undefined;
  const actionType = lookupObject(document, action.get(ACTION_TYPE));
  if (!(actionType instanceof PDFName) || actionType.asString() !== '/GoTo') return undefined;
  return pageNumberFromDestination(document, action.get(ACTION_DEST), pageRefs);
}

function objectIdentity(object: PDFObject | undefined): string {
  if (object instanceof PDFRef) return object.toString();
  return object ? String(object) : '';
}

export async function extractPdfBookmarks(bytes: ArrayBuffer | Uint8Array): Promise<BookmarkNode[]> {
  const document = await PDFDocument.load(bytes);
  const pages = document.getPages();
  const pageRefs = new Map(pages.map((page, index) => [page.ref.toString(), index + 1]));
  const outlines = lookupDict(document, document.catalog.get(OUTLINES));
  if (!outlines) return [];

  const visited = new Set<string>();
  let seen = 0;

  const walkLevel = (firstObject: PDFObject | undefined, depth: number): BookmarkNode[] => {
    if (depth > MAX_BOOKMARK_DEPTH) throw new Error(`Outline hiện có vượt quá ${MAX_BOOKMARK_DEPTH} cấp.`);
    const result: BookmarkNode[] = [];
    let currentObject = firstObject;
    while (currentObject) {
      const identity = objectIdentity(currentObject);
      if (!identity || visited.has(identity)) break;
      visited.add(identity);
      seen += 1;
      if (seen > MAX_BOOKMARK_NODES) throw new Error(`Outline hiện có vượt quá ${MAX_BOOKMARK_NODES} mục.`);

      const dict = lookupDict(document, currentObject);
      if (!dict) break;
      const title = decodeTitle(document, dict).trim() || 'Bookmark';
      const pageNumber = pageNumberFromItem(document, dict, pageRefs) ?? 1;
      const children = walkLevel(dict.get(FIRST), depth + 1);
      result.push({ title, pageNumber, children });
      currentObject = dict.get(NEXT);
    }
    return result;
  };

  return walkLevel(outlines.get(FIRST), 1);
}

type LevelResult = {
  first?: PDFRef;
  last?: PDFRef;
  descendantCount: number;
};

function buildLevel(document: PDFDocument, nodes: BookmarkNode[], parentRef: PDFRef): LevelResult {
  if (!nodes.length) return { descendantCount: 0 };
  const pages = document.getPages();
  const entries = nodes.map((node) => {
    const page = pages[node.pageNumber - 1];
    const dict = document.context.obj({
      Title: PDFHexString.fromText(node.title),
      Parent: parentRef,
      Dest: [page.ref, 'Fit'],
    }) as PDFDict;
    return { node, dict, ref: document.context.register(dict) };
  });

  entries.forEach((entry, index) => {
    if (index > 0) entry.dict.set(PREV, entries[index - 1].ref);
    if (index + 1 < entries.length) entry.dict.set(NEXT, entries[index + 1].ref);
  });

  let descendantCount = entries.length;
  for (const entry of entries) {
    const childLevel = buildLevel(document, entry.node.children, entry.ref);
    if (childLevel.first && childLevel.last) {
      entry.dict.set(FIRST, childLevel.first);
      entry.dict.set(LAST, childLevel.last);
      entry.dict.set(COUNT, document.context.obj(childLevel.descendantCount));
      descendantCount += childLevel.descendantCount;
    }
  }

  return {
    first: entries[0].ref,
    last: entries[entries.length - 1].ref,
    descendantCount,
  };
}

export async function setPdfBookmarks(bytes: ArrayBuffer | Uint8Array, bookmarks: BookmarkNode[]): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes);
  const pageCount = document.getPageCount();
  if (!pageCount) throw new Error('PDF không có trang.');
  const normalized = normalizeNodes(Array.isArray(bookmarks) ? bookmarks : [], pageCount);

  if (!normalized.length) {
    document.catalog.delete(OUTLINES);
    return document.save({ useObjectStreams: true });
  }

  const outlineDict = document.context.obj({ Type: 'Outlines' }) as PDFDict;
  const outlineRef = document.context.register(outlineDict);
  const level = buildLevel(document, normalized, outlineRef);
  if (level.first && level.last) {
    outlineDict.set(FIRST, level.first);
    outlineDict.set(LAST, level.last);
    outlineDict.set(COUNT, document.context.obj(level.descendantCount));
  }
  document.catalog.set(OUTLINES, outlineRef);
  return document.save({ useObjectStreams: true });
}
