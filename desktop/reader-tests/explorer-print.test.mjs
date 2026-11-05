import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('installer registers multi-select Print and removes the verb on uninstall',()=>{
 const nsi=read('../src-tauri/windows/reader-default-app-hooks.nsi');const smoke=read('./scripts/verify-installed-reader.ps1');
 assert.match(nsi,/SystemFileAssociations.*\\.pdf.*SolYanReaderPrint/);assert.match(nsi,/MultiSelectModel" "Player/);assert.ok(nsi.includes('--print assert.match(nsi,/DeleteRegKey HKCU .*SystemFileAssociations/);
 assert.match(smoke,/Explorer PDF Print verb missing/);assert.match(smoke,/Explorer PDF Print verb remains after uninstall/);
});
test('Explorer print paths use native queue grants and Windows default printer',()=>{
 const main=read('../src-tauri/src/main.rs'),native=read('../ui/reader-native.js'),print=read('../ui/reader-print.js');
 assert.match(main,/reader_next_print_request/);assert.match(main,/reader_read_print_request/);assert.match(main,/\.visible\(!print_only\)/);assert.match(main,/window\.hide\(\)/);
 assert.match(native,/reader-print-pending/);assert.match(native,/reader_finish_print_batch/);assert.match(print,/find\(p=>p\.is_default\)/);assert.match(print,/await prepare\(true,false\)/);
});+String.fromCharCode(92)+'"%1assert.match(nsi,/DeleteRegKey HKCU .*SystemFileAssociations/);
 assert.match(smoke,/Explorer PDF Print verb missing/);assert.match(smoke,/Explorer PDF Print verb remains after uninstall/);
});
test('Explorer print paths use native queue grants and Windows default printer',()=>{
 const main=read('../src-tauri/src/main.rs'),native=read('../ui/reader-native.js'),print=read('../ui/reader-print.js');
 assert.match(main,/reader_next_print_request/);assert.match(main,/reader_read_print_request/);assert.match(main,/\.visible\(!print_only\)/);assert.match(main,/window\.hide\(\)/);
 assert.match(native,/reader-print-pending/);assert.match(native,/reader_finish_print_batch/);assert.match(print,/find\(p=>p\.is_default\)/);assert.match(print,/await prepare\(true,false\)/);
});+String.fromCharCode(92)+'"'));assert.match(nsi,/DeleteRegKey HKCU .*SystemFileAssociations/);
 assert.match(smoke,/Explorer PDF Print verb missing/);assert.match(smoke,/Explorer PDF Print verb remains after uninstall/);
});
test('Explorer print paths use native queue grants and Windows default printer',()=>{
 const main=read('../src-tauri/src/main.rs'),native=read('../ui/reader-native.js'),print=read('../ui/reader-print.js');
 assert.match(main,/reader_next_print_request/);assert.match(main,/reader_read_print_request/);assert.match(main,/\.visible\(!print_only\)/);assert.match(main,/window\.hide\(\)/);
 assert.match(native,/reader-print-pending/);assert.match(native,/reader_finish_print_batch/);assert.match(print,/find\(p=>p\.is_default\)/);assert.match(print,/await prepare\(true,false\)/);
});