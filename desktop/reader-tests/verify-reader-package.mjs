import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base=JSON.parse(read('../src-tauri/tauri.conf.json'));
const reader=JSON.parse(read('../src-tauri/tauri.reader.conf.json'));
assert.ok(Object.hasOwn(reader.bundle,'resources'),'Reader must explicitly clear inherited Tools resources');
assert.equal(reader.bundle.resources,null,'Reader cannot bundle Tools engines');
assert.equal(reader.identifier,'vn.solyan.pdf.reader');
assert.equal(reader.mainBinaryName,'solyan-pdf-reader');
assert.notEqual(reader.identifier,base.identifier);
assert.equal(reader.app.windows[0].url,'reader.html');
assert.deepEqual(reader.bundle.icon,['../branding/sReader_PDF/app.ico']);
assert.match(read('../src-tauri/Cargo.toml'),/^reader-only\s*=\s*\["dep:tauri-plugin-single-instance", "dep:tauri-plugin-window-state"\]/m);
const html=read('../ui/reader.html');
assert.doesNotMatch(html,/<script\b[^>]*>\s*[^<\s]/i,'No inline Reader scripts');
for(const [,path] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)){
  assert.ok(existsSync(new URL('../ui/'+path,import.meta.url)),`Missing Reader asset: ${path}`);
}
const csp=base.app.security.csp;
assert.match(csp,/script-src 'self' 'wasm-unsafe-eval'/);
assert.doesNotMatch(csp,/'unsafe-inline'|(?:^|\s)'unsafe-eval'/);
console.log('Reader identities, no engine resources, local assets and CSP: PASS');
