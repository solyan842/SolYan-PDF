/* Browser-local visual signatures. PDF.js supplies viewports; pdf-lib writes images. */
(function (root) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(Math.min(lo, hi), Math.min(hi, v));
  function move(r, dx, dy) { return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) }; }
  function resize(r, handle, dx, dy) {
    const west = handle.includes('w'), north = handle.includes('n');
    let w = r.w, h = r.h;
    if (handle.length === 2) {
      const fx = (west ? -dx : dx) / r.w, fy = (north ? -dy : dy) / r.h;
      let factor = 1 + (Math.abs(fx) > Math.abs(fy) ? fx : fy);
      factor = clamp(factor, Math.max(.01 / r.w, .01 / r.h), Math.min((west ? r.x + r.w : 1 - r.x) / r.w, (north ? r.y + r.h : 1 - r.y) / r.h));
      w *= factor; h *= factor;
    } else {
      if (/[ew]/.test(handle)) w = clamp(r.w + (west ? -dx : dx), .01, west ? r.x + r.w : 1 - r.x);
      if (/[ns]/.test(handle)) h = clamp(r.h + (north ? -dy : dy), .01, north ? r.y + r.h : 1 - r.y);
    }
    return { x: west ? r.x + r.w - w : r.x, y: north ? r.y + r.h - h : r.y, w, h };
  }
  function pages(value, count, current) {
    if (value === 'all') return Array.from({ length: count }, (_, i) => i);
    if (value === 'current') return [current];
    const selected = new Set();
    for (const item of value.split(',')) {
      const m = item.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw Error('Nhập trang như 1,3-5.');
      const a = Number(m[1]), b = Number(m[2] || m[1]);
      if (a < 1 || b < a || b > count) throw Error('Khoảng trang không hợp lệ.');
      for (let i = a; i <= b; i++) selected.add(i - 1);
    }
    return [...selected];
  }
  function copyRect(r, source, target) {
    const width = r.w * source.width, height = r.h * source.height;
    const fit = Math.min(1, target.width / width, target.height / height);
    const w = width * fit / target.width, h = height * fit / target.height;
    return { x: clamp(r.x * source.width / target.width, 0, 1 - w), y: clamp(r.y * source.height / target.height, 0, 1 - h), w, h };
  }
  function imageMatrix(viewport, r) {
    const [a,b,c,d,e,f] = viewport.transform, det = a*d-b*c;
    if (!Number.isFinite(det) || det === 0) throw Error('Invalid page transform');
    const point = (x,y) => [(d*(x-e)-c*(y-f))/det, (-b*(x-e)+a*(y-f))/det];
    const x = r.x*viewport.width, y = r.y*viewport.height, w = r.w*viewport.width, h = r.h*viewport.height;
    const origin = point(x,y+h), right = point(x+w,y+h), top = point(x,y);
    return [right[0]-origin[0],right[1]-origin[1],top[0]-origin[0],top[1]-origin[1],...origin];
  }
  async function save(bytes, placements, viewportForPage, PDFLib) {
    if (!placements.length) throw Error('Chưa có chữ ký để lưu.');
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    const images = new Map();
    for (const item of placements) {
      if (item.page < 0 || item.page >= doc.getPageCount()) throw Error('Invalid signature page');
      if (!images.has(item.image)) images.set(item.image, await doc.embedPng(item.image));
      const page = doc.getPage(item.page), matrix = imageMatrix(item.viewport || await viewportForPage(item.page, item), item.rect);
      page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.concatTransformationMatrix(...matrix));
      page.drawImage(images.get(item.image), { x: 0, y: 0, width: 1, height: 1 });
      page.pushOperators(PDFLib.popGraphicsState());
    }
    return doc.save();
  }
  const api = { move, resize, pages, copyRect, imageMatrix, save };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuickSign = api;
})(typeof window === 'undefined' ? globalThis : window);
