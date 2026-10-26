import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const uiRoot = fileURLToPath(new URL('../ui/', import.meta.url));
const mime = file => file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.bcmap') ? 'application/octet-stream' : 'text/javascript';
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    const file = path.resolve(uiRoot, relative);
    if (file !== uiRoot && !file.startsWith(uiRoot)) throw new Error('Invalid test asset path');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime(file), 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'" });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: process.env.STOOL_BROWSER_CHANNEL || undefined });
try {
  for (const item of [
    { mode: 'color', suffix: 'color', expectedTool: 'Đổi màu PDF' },
    { mode: 'scanner-effect', suffix: 'scanner', expectedTool: 'Hiệu ứng máy scan' },
  ]) {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.saveCalls = [];
      window.__TAURI__ = { core: { invoke: async (command, args) => {
        if (command !== 'stool_save_output') throw Error('Unexpected native command');
        window.saveCalls.push(args); return 'C:\\QA\\visual.pdf';
      } } };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/visual-tools.html?tool=${item.mode}`);
    await expect(page.locator('#toolName')).toHaveText(item.expectedTool);
    const source = Buffer.from(await page.evaluate(async () => {
      const pdf = await PDFLib.PDFDocument.create();
      pdf.addPage([120, 160]).drawText('SOLYAN VISUAL TEST 12345', { x: 12, y: 80, size: 12 });
      return Array.from(await pdf.save());
    }));
    const sourceHash = createHash('sha256').update(source).digest('hex');
    await page.locator('#fileInput').setInputFiles({ name: 'contract-visual.pdf', mimeType: 'application/pdf', buffer: source });
    if (item.mode === 'color') await page.locator('#dpi').fill('75');
    else await page.locator('#quality').selectOption('low');
    await page.locator('#runBtn').click();
    await expect(page.locator('#status')).toContainText('vẫn nguyên vẹn', { timeout: 60_000 });
    await expect(page.locator('#output-results .output-result > strong')).toHaveText(`contract-visual-${item.suffix}.pdf`);
    await expect(page.locator('.output-save')).toBeVisible();
    await page.locator('.output-save').click();
    await expect(page.locator('.output-result [role=status]')).toContainText('Đã lưu: C:\\QA\\visual.pdf');
    const calls = await page.evaluate(() => window.saveCalls);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].sourceHashes, [sourceHash]);
    const output = Buffer.from(calls[0].bytes);
    assert.notDeepEqual(output, source);
    assert.equal(createHash('sha256').update(source).digest('hex'), sourceHash, 'source PDF remains unchanged');
    assert.equal(await page.evaluate(async bytes => (await PDFLib.PDFDocument.load(new Uint8Array(bytes))).getPageCount(), calls[0].bytes), 1);
    await page.close();
    console.log(`${item.mode}: real PDF.js rasterization, output shelf Save, source-derived filename and unchanged source PASS`);
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
