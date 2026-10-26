import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const helper = await readFile(new URL('../ui/output-name.js', import.meta.url), 'utf8');
const context = { window: {} };
runInNewContext(helper, context);
const outputName = context.window.SOLYAN_OUTPUT_NAME;

test('uses the selected PDF basename and operation suffix', () => {
  assert.equal(outputName('934540077.pdf', 'compressed'), '934540077-compressed.pdf');
  assert.equal(outputName('Hồ sơ 2026.PDF', 'image-compressed'), 'Hồ sơ 2026-image-compressed.pdf');
});

test('supports non-PDF exports without adding a SolYan prefix', () => {
  assert.equal(outputName('Bao cao.pdf', '', '.txt'), 'Bao cao.txt');
  assert.equal(outputName('Scan.pdf', 'svg', '.zip'), 'Scan-svg.zip');
});

test('sanitizes unsafe basename and suffix while preserving Vietnamese text', () => {
  assert.equal(outputName('báo:cáo?.pdf', 'bad/suffix'), 'báo-cáo--bad-suffix.pdf');
});

test('uses a safe fallback for an empty source name and normalizes the extension', () => {
  assert.equal(outputName('', 'compressed', 'pdf'), 'document-compressed.pdf');
});

test('uses the source basename when the converter omits a filename', () => {
  assert.equal(context.window.SOLYAN_OUTPUT_NAME_FROM_DISPOSITION('', 'Báo cáo quý 3.docx', '', '.pdf'), 'Báo cáo quý 3.pdf');
});

test('replaces generic SolYan server filenames with the selected source basename', () => {
  assert.equal(context.window.SOLYAN_OUTPUT_NAME_FROM_DISPOSITION('attachment; filename="solyan-converted.docx"', 'Hợp đồng.pdf', '', '.docx'), 'Hợp đồng.docx');
});

test('keeps meaningful server filenames and decodes UTF-8 Content-Disposition', () => {
  assert.equal(context.window.SOLYAN_OUTPUT_NAME_FROM_DISPOSITION("attachment; filename*=UTF-8''H%E1%BB%93%20s%C6%A1%202026.pdf", 'source.docx', '', '.pdf'), 'Hồ sơ 2026.pdf');
});

test('uses the selected source name for generic SolYan engine output names', () => {
  assert.equal(context.window.SOLYAN_OUTPUT_NAME_FROM_DISPOSITION('attachment; filename="solyan-auto-split.zip"', 'Batch Scan.pdf', 'qr-split', '.zip'), 'Batch Scan-qr-split.zip');
  assert.equal(context.window.SOLYAN_OUTPUT_NAME_FROM_DISPOSITION('attachment; filename="solyan-ocr.xlsx"', 'Bảng dữ liệu.pdf', 'excel', '.xlsx'), 'Bảng dữ liệu-excel.xlsx');
});
