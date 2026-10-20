import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(p, 'utf8');
const main = read('desktop/src-tauri/src/main.rs');
test('sTool startup is lightweight', () => {
  const start = main.slice(main.indexOf('fn main() {'));
  assert.ok(start.startsWith('fn main() {'));
  for (const name of ['start_office(', 'start_ocr(', 'start_sign(', 'start_archive(', 'start_core(']) {
    assert.equal(start.includes(name), false, 'eager sidecar: ' + name);
  }
  assert.equal(start.includes('.setup('), false);
  assert.ok(main.includes('fn desktop_service_ready('));
  assert.ok(main.includes('fn desktop_core_session('));
  assert.ok(main.includes('spawn_blocking'));
});
test('each specialized tool requests only its engine on click', () => {
  for (const [service, path] of [
    ['ocr','desktop/ui/ocr.js'],
    ['office','desktop/ui/office-convert.js'],
    ['sign','desktop/ui/sign.js'],
    ['archive','desktop/ui/pdfa.js']
  ]) {
    const source = read(path);
    const wanted = "desktop_service_ready',{service:'" + service + "'}";
    const position = source.indexOf(wanted);
    assert.ok(position >= 0, path + ' does not request ' + service);
    assert.ok(source.indexOf('desktop_core_session', position) > position);
  }
});
test('only allowlisted services and local endpoints can be requested', () => {
  assert.ok(main.includes('matches!(service.as_str(),"office"|"ocr"|"sign"|"archive")'));
  assert.ok(main.includes('launch_lock: Mutex<()>'));
  assert.ok(main.includes('http://127.0.0.1:'));
  assert.ok(read('desktop/ui/index.html').includes('id="home-view"'));
});
