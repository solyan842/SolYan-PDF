import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from 'pdf-lib';

export type CustomPdfMetadata = {
  key: string;
  value: string;
};

const MAX_CUSTOM_METADATA_FIELDS = 50;
const STANDARD_INFO_KEYS = new Set([
  'title',
  'author',
  'subject',
  'keywords',
  'creator',
  'producer',
  'creationdate',
  'moddate',
  'trapped',
]);

export const CUSTOM_METADATA_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function infoDict(pdf: PDFDocument, create: boolean): PDFDict | undefined {
  const infoRef = pdf.context.trailerInfo.Info;
  if (infoRef) {
    const existing = pdf.context.lookup(infoRef);
    if (existing instanceof PDFDict) return existing;
  }
  if (!create) return undefined;
  const created = pdf.context.obj({});
  const ref = pdf.context.register(created);
  pdf.context.trailerInfo.Info = ref;
  return created;
}

function decodeInfoValue(pdf: PDFDocument, key: PDFName): string {
  const dict = infoDict(pdf, false);
  if (!dict) return '';
  const raw = dict.get(key);
  if (!raw) return '';
  const value = pdf.context.lookup(raw);
  if (value instanceof PDFHexString || value instanceof PDFString || value instanceof PDFName) {
    return value.decodeText();
  }
  return value?.toString() ?? '';
}

export function readCustomPdfMetadata(pdf: PDFDocument): CustomPdfMetadata[] {
  const dict = infoDict(pdf, false);
  if (!dict) return [];
  const rows: CustomPdfMetadata[] = [];
  for (const key of dict.keys()) {
    const name = key.decodeText();
    if (STANDARD_INFO_KEYS.has(name.toLowerCase())) continue;
    rows.push({ key: name, value: decodeInfoValue(pdf, key) });
    if (rows.length > MAX_CUSTOM_METADATA_FIELDS) {
      throw new Error(`PDF có hơn ${MAX_CUSTOM_METADATA_FIELDS} custom metadata fields; hãy dùng PDF Inspector để kiểm tra trước.`);
    }
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

export function readTrappedMetadata(pdf: PDFDocument): '' | 'True' | 'False' | 'Unknown' {
  const dict = infoDict(pdf, false);
  if (!dict) return '';
  const raw = dict.get(PDFName.of('Trapped'));
  if (!raw) return '';
  const value = pdf.context.lookup(raw);
  if (!(value instanceof PDFName)) return '';
  const decoded = value.decodeText();
  return decoded === 'True' || decoded === 'False' || decoded === 'Unknown' ? decoded : '';
}

export function clearAllPdfMetadata(pdf: PDFDocument): void {
  const dict = infoDict(pdf, false);
  if (dict) {
    for (const key of [...dict.keys()]) dict.delete(key);
  }
  pdf.catalog.delete(PDFName.of('Metadata'));
  pdf.catalog.delete(PDFName.of('PieceInfo'));
}

export function removeInfoKey(pdf: PDFDocument, key: string): void {
  infoDict(pdf, false)?.delete(PDFName.of(key));
}

export function replaceCustomPdfMetadata(pdf: PDFDocument, rows: CustomPdfMetadata[]): void {
  if (rows.length > MAX_CUSTOM_METADATA_FIELDS) {
    throw new Error(`Tối đa ${MAX_CUSTOM_METADATA_FIELDS} custom metadata fields.`);
  }
  const dict = infoDict(pdf, true)!;
  for (const key of [...dict.keys()]) {
    if (!STANDARD_INFO_KEYS.has(key.decodeText().toLowerCase())) dict.delete(key);
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key && !row.value.trim()) continue;
    if (!CUSTOM_METADATA_KEY_PATTERN.test(key)) {
      throw new Error(`Custom metadata key “${key || '(trống)'}” chỉ được dùng A-Z, a-z, 0-9, dấu chấm, gạch dưới, hai chấm và gạch ngang; tối đa 64 ký tự.`);
    }
    if (STANDARD_INFO_KEYS.has(key.toLowerCase())) {
      throw new Error(`Custom metadata key “${key}” trùng với trường PDF chuẩn.`);
    }
    const normalized = key.toLowerCase();
    if (seen.has(normalized)) throw new Error(`Custom metadata key bị trùng: ${key}`);
    seen.add(normalized);
    if (row.value.length > 4096) throw new Error(`Giá trị custom metadata “${key}” vượt 4096 ký tự.`);
    dict.set(PDFName.of(key), PDFHexString.fromText(row.value));
  }
}

export function writeTrappedMetadata(pdf: PDFDocument, value: '' | 'True' | 'False' | 'Unknown'): void {
  const dict = infoDict(pdf, true)!;
  const key = PDFName.of('Trapped');
  if (!value) dict.delete(key);
  else dict.set(key, PDFName.of(value));
}

export function dateToLocalInput(value?: Date): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function localInputToDate(value: string, label: string): Date | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} không hợp lệ.`);
  return date;
}
