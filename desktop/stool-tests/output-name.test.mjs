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
