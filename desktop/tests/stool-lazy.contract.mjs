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

test('fast CI only creates empty compile-only resource roots and never builds Reader',()=>{
  const ci=read('.github/workflows/windows-stool-fast-ci.yml');
  for(const service of ['core','office','ocr','sign','archive'])assert.ok(ci.includes("'"+service+"'"));
  assert.ok(ci.includes('Prepare compile-only resource roots'));
  assert.ok(ci.includes("Expected an empty compile-only directory"));
  assert.ok(ci.includes('cargo check --no-default-features'));
  assert.equal(ci.includes('cargo tauri build'),false);
  assert.equal(ci.includes('windows-reader-ci.yml'),false);
});

test('stale cached sessions and exited heavy sidecars are checked before reuse',()=>{
  const main=read('desktop/src-tauri/src/main.rs');
  assert.ok(main.includes('fn managed_child_healthy<T:ManagedJob>('));
  assert.ok(main.includes('job.terminate_and_wait()'));
  assert.ok(main.includes('.try_wait()'));
  assert.ok(main.includes('state.session.lock()'));
  for(const service of ['Office','OCR','Signing','Archive'])
    assert.match(main,new RegExp('managed_child_healthy\\(&mut \\*slot,[^\\n]+,"'+service+'"\\)'),service+' needs crash and health restart');
  assert.ok(main.includes('managed_child_healthy(&mut *owned,|p|&mut p.child'));
  assert.ok(main.includes('child.kill()')&&main.includes('child.wait()'));
});
