import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('heavy installer runs only manually or on a deliberate sTool build milestone',()=>{
  const wf=read('.github/workflows/windows-stool-installer.yml');
  const triggers=wf.slice(wf.indexOf('on:'),wf.indexOf('permissions:'));
  assert.match(triggers,/workflow_dispatch:/);assert.match(triggers,/'build\/windows-stool-demo-\*'/);
  assert.doesNotMatch(triggers,/pull_request|feat\/|reader/i);
  const legacy=read('.github/workflows/windows-desktop-ci.yml').split('permissions:')[0];
  assert.doesNotMatch(legacy,/pull_request:|push:/);
  assert.doesNotMatch(wf,/reader-only|tauri\.reader|SolYan-PDF-Reader/);
  assert.match(wf,/name: sTool-PDF-Windows-x64/);
  assert.match(wf,/if: always\(\)/);
});
test('installed acceptance retains D6 signing, PDF-A and uninstall gates',()=>{
  const script=read('desktop/backend/stool-installer-smoke.ps1');
  for(const file of ['sign_runtime_smoke.py','pdfa_frozen_smoke.py','verify-installer-release.ps1'])assert.ok(script.includes(file));
  for(const guard of ['GITHUB_ACTIONS','Pre-existing app/engine','Refuse to overwrite','installed_executables_removed','silent_uninstall','smokeOrphans'])assert.ok(script.includes(guard));
  assert.doesNotMatch(script,/Stop-Process/);
  const native=read('desktop/stool-tests/installed.mjs');
  assert.match(native,/await roots\(\[\]\)/);
  for(const service of ['core','office','ocr','sign','archive'])assert.ok(native.includes(`'-Service','${service}'`));
  assert.ok(native.includes('createHash'));assert.ok(native.includes('await downloadOutput('));
  const download=read('desktop/stool-tests/tool-download.mjs');
  assert.ok(download.includes('page.waitForEvent(\'download\''));
  assert.ok(download.includes('await saved.saveAs(path)'));
  const sign=read('desktop/ui/sign.html');
  for(const id of ['pdfInput','certInput','certPassword','runBtn'])assert.ok(sign.includes(`id="${id}"`));
});

test('installed OCR assertion accepts token segmentation without losing content',async()=>{
  const {expectedOcrLine}=await import('../stool-tests/ocr-assertion.mjs');
  for(const actual of ['SOLYAN OCR TEST 12345','SOL YAN OCR TEST 12345','SOL   YAN OCR TEST 12345','sol yan ocr test 12345']){
    assert.match(actual,expectedOcrLine);
  }
  for(const wrong of ['SOL YANN OCR TEST 12345','SOL YAN OCB TEST 12345','SOL YAN OCR TEST 12346','SOL YAN TEST OCR 12345','SOL YAN OCR TEST 1234']){
    assert.doesNotMatch(wrong,expectedOcrLine);
  }
  assert.match(read('desktop/stool-tests/installed.mjs'),/toHaveValue\(expectedOcrLine,\{timeout:300000\}\)/);
});
