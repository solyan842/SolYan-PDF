import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Explorer Print passes a selected PDF and unregisters on uninstall',()=>{
 const nsi=read('../src-tauri/windows/reader-default-app-hooks.nsi');
 const smoke=read('./scripts/verify-installed-reader.ps1');
 assert.ok(nsi.includes('SolYanReaderPrint'));
 assert.ok(nsi.includes('"MultiSelectModel" "Player"'));
 assert.ok(nsi.includes('%1'));assert.ok(!nsi.includes('%*'));
 assert.ok(smoke.includes('Explorer PDF Print verb missing'));
 assert.ok(smoke.includes('Explorer PDF Print verb remains after uninstall'));
});
