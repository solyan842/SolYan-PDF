import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const assets = new Map();
for (const file of ['compare.html', 'compare.css', 'compare.js', 'tool.css', 'icons.js', 'icons/phosphor-duotone/arrows-left-right-duotone.svg']) {
  assets.set('/' + file, await readFile(new URL('../ui/' + file, import.meta.url)));
}
const server = createServer(async (req, res) => {
  if (req.url === '/pdf/compare' && req.method === 'POST') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('latin1');
    assert.equal(req.headers['x-solyan-desktop-token'], 'compare-test-token');
    assert.ok(body.includes('left-contract.pdf') && body.includes('right-contract.pdf'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      left: { name: 'left-contract.pdf', pages: 2, textBytes: 34 },
      right: { name: 'right-contract.pdf', pages: 2, textBytes: 39 },
      text: { added: 1, removed: 0, changes: [{ type: 'added', text: 'Inserted line' }], truncated: false },
      visual: { averageSimilarity: 98.5, pages: [{ page: 1, similarity: 98.5, differentPixels: 20, totalPixels: 1000, sizeMismatch: false }] }
    }));
    return;
  }
  const body = assets.get(req.url);
  const type = req.url.endsWith('.html') ? 'text/html' : req.url.endsWith('.css') ? 'text/css' : req.url.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
  res.writeHead(body ? 200 : 404, { 'Content-Type': type, 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'" });
  res.end(body || 'not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: process.env.STOOL_BROWSER_CHANNEL || undefined });
try {
  const page = await browser.newPage();
  await page.addInitScript(port => { window.__COMPARE_PORT__ = port; window.__TAURI__ = { core: { invoke: async command => {
    if (command !== 'desktop_core_session') throw new Error(`Unexpected command ${command}`);
    return `http://127.0.0.1:${window.__COMPARE_PORT__}\ncompare-test-token`;
  } } }; }, server.address().port);
  await page.goto(`http://127.0.0.1:${server.address().port}/compare.html`);
  await page.locator('#leftFile').setInputFiles({ name: 'left-contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-left') });
  await page.locator('#rightFile').setInputFiles({ name: 'right-contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-right') });
  await expect(page.locator('#runBtn')).toBeEnabled();
  await page.locator('#runBtn').click();
  await expect(page.locator('#similarity')).toHaveText('98.50%');
  await expect(page.locator('#leftSummary')).toHaveText('left-contract.pdf');
  await expect(page.locator('#textChanges')).toContainText('Inserted line');
  await expect(page.locator('#status')).toContainText('PDF nguồn không bị thay đổi');
  console.log('Compare: two local PDFs, authenticated Core request, visual/text report and source-derived names PASS');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
