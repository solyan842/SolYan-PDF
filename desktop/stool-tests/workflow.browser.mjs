import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const assets = new Map();
for (const path of ['workflow.html', 'workflow.js', 'tool.css', 'output-name.js', 'vendor/pdf-lib.min.js']) {
  assets.set('/' + path, await readFile(new URL('../ui/' + path, import.meta.url)));
}
const server = createServer((req, res) => {
  const body = assets.get(req.url);
  const type = req.url.endsWith('.html') ? 'text/html' : req.url.endsWith('.css') ? 'text/css' : 'text/javascript';
  res.writeHead(body ? 200 : 404, {
    'Content-Type': type,
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"
  });
  res.end(body || 'not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: process.env.STOOL_BROWSER_CHANNEL || undefined });
try {
  const page = await browser.newPage();
  await page.addInitScript({ path: fileURLToPath(new URL('../ui/output-save.js', import.meta.url)) });
  await page.addInitScript(() => {
    window.saveCalls = [];
    window.__TAURI__ = { core: { invoke: async (command, args) => {
      if (command !== 'stool_save_output') throw new Error('Unexpected native command');
      window.saveCalls.push(args);
      return 'C:\\QA\\contract-2026-workflow.pdf';
    } } };
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/workflow.html');
  const source = Buffer.from(await page.evaluate(async () => {
    const pdf = await PDFLib.PDFDocument.create();
    pdf.addPage([300, 400]).drawText('WORKFLOW SOURCE');
    pdf.addPage([200, 300]).drawText('SECOND PAGE');
    return Array.from(await pdf.save());
  }));
  const sourceHash = createHash('sha256').update(source).digest('hex');
  await page.locator('#fileInput').setInputFiles({ name: 'contract-2026.pdf', mimeType: 'application/pdf', buffer: source });
  await expect(page.locator('#runBtn')).toBeEnabled();
  await page.locator('#rotateStep').check();
  await page.locator('#rotation').selectOption('90');
  await page.locator('#metadataStep').check();
  await page.locator('#titleText').fill('Workflow QA');
  await page.locator('#runBtn').click();
  await expect(page.locator('#output-results .output-result > strong')).toHaveText('contract-2026-workflow.pdf');
  await expect(page.locator('.output-save')).toBeVisible();
  await page.locator('.output-save').click();
  await expect(page.locator('.output-result [role=status]')).toContainText('Đã lưu: C:\\QA\\contract-2026-workflow.pdf');

  const calls = await page.evaluate(() => window.saveCalls);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].sourceHashes, [sourceHash]);
  const output = await page.evaluate(async bytes => {
    const pdf = await PDFLib.PDFDocument.load(new Uint8Array(bytes));
    return { pages: pdf.getPageCount(), rotation: pdf.getPage(0).getRotation().angle, title: pdf.getTitle() };
  }, calls[0].bytes);
  assert.deepEqual(output, { pages: 2, rotation: 90, title: 'Workflow QA' });
  assert.notDeepEqual(Buffer.from(calls[0].bytes), source);
  assert.equal(createHash('sha256').update(source).digest('hex'), sourceHash, 'source PDF bytes remain unchanged');
  console.log('Workflow: local rotate + watermark + page numbers + metadata, source-derived name and Save shelf PASS');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

