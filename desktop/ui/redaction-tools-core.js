const WORD = /[\p{L}\p{N}\p{M}_]/u;
export function normalizeTerms(raw, caseSensitive = false) {
  const terms = [], seen = new Set();
  for (const line of String(raw).split(/\r?\n/)) {
    const term = line.trim(); if (!term) continue;
    const normalized = term.normalize('NFC'), key = caseSensitive ? normalized : normalized.toLocaleLowerCase('vi');
    if (!seen.has(key)) { seen.add(key); terms.push(term); }
  }
  if (terms.length > 20) throw new Error('Tối đa 20 từ hoặc cụm từ cho mỗi lần xử lý.');
  if (terms.some(term => term.length > 200)) throw new Error('Mỗi từ hoặc cụm từ tối đa 200 ký tự.');
  return terms;
}
function codePointBefore(text, index) {
  if (index <= 0) return '';
  let start = index - 1;
  if (/^[\uDC00-\uDFFF]$/.test(text[start]) && start > 0 && /^[\uD800-\uDBFF]$/.test(text[start - 1])) start--;
  return text.slice(start, index);
}
function codePointAt(text, index) { return index >= text.length ? '' : String.fromCodePoint(text.codePointAt(index)); }
function wholeWordMatch(haystack, needle) {
  const beginsWord = WORD.test(String.fromCodePoint(needle.codePointAt(0)));
  const endsWord = WORD.test(codePointBefore(needle, needle.length));
  let at = 0;
  while ((at = haystack.indexOf(needle, at)) >= 0) {
    const left = codePointBefore(haystack, at), right = codePointAt(haystack, at + needle.length);
    if ((!beginsWord || !WORD.test(left)) && (!endsWord || !WORD.test(right))) return true;
    at += 1;
  }
  return false;
}
export function rectForTextItem(item, viewport, padding = 1.5) {
  const itemTransform = item?.transform, viewportTransform = viewport?.transform;
  if (!Array.isArray(itemTransform) || itemTransform.length < 6 || !Array.isArray(viewportTransform) || viewportTransform.length < 6) return null;
  const a = viewportTransform, b = itemTransform;
  const tx = [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  if (!tx.every(Number.isFinite)) return null;
  const scale = Math.abs(Number(viewport.scale) || 1), height = Math.max(Math.hypot(tx[2], tx[3]), Math.abs(Number(item.height) || 0) * scale), advance = Math.abs(Number(item.width) || 0) * scale;
  if (!(height > 0) || !(advance > 0)) return null;
  const angle = Math.atan2(tx[1], tx[0]), ux = Math.cos(angle), uy = Math.sin(angle), vx = Math.sin(angle), vy = -Math.cos(angle);
  const points = [[tx[4],tx[5]],[tx[4]+ux*advance,tx[5]+uy*advance],[tx[4]+vx*height,tx[5]+vy*height],[tx[4]+ux*advance+vx*height,tx[5]+uy*advance+vy*height]];
  const xs = points.map(p=>p[0]), ys=points.map(p=>p[1]), w=Number(viewport.width), h=Number(viewport.height);
  const left=Math.max(0,Math.min(w,Math.min(...xs)-padding)), top=Math.max(0,Math.min(h,Math.min(...ys)-padding));
  const right=Math.max(left,Math.min(w,Math.max(...xs)+padding)), bottom=Math.max(top,Math.min(h,Math.max(...ys)+padding));
  return right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;
}
export function findLiteralMatches(textContent, viewport, terms, {caseSensitive=false, wholeWord=false, padding=1.5}={}) {
  const entries=(Array.isArray(textContent?.items)?textContent.items:[]).filter(item=>typeof item?.str==='string'&&item.str.trim());
  if (entries.length>100_000) throw new Error('PDF vượt giới hạn 100.000 dòng văn bản.');
  const searchable=terms.map(term=>{const n=term.normalize('NFC');return caseSensitive?n:n.toLocaleLowerCase('vi');}),matches=[];
  for(const item of entries){const text=item.str.normalize('NFC'),hay=caseSensitive?text:text.toLocaleLowerCase('vi');
    const matchedTerms=terms.filter((_,i)=>wholeWord?wholeWordMatch(hay,searchable[i]):hay.includes(searchable[i]));
    if(!matchedTerms.length)continue;const rect=rectForTextItem(item,viewport,padding);if(rect)matches.push({text,terms:matchedTerms,rect});
  }
  return matches;
}
