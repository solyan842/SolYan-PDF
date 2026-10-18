import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL(p,import.meta.url));
test('approved branding hashes, multi-size ICO and independent application identities',()=>{
 const manifest=JSON.parse(read('../branding/SHA256.json'));
 for(const [name,hash]of Object.entries(manifest))assert.equal(createHash('sha256').update(read('../branding/'+name)).digest('hex'),hash,name);
 for(const app of ['sReader_PDF','sTool_PDF']){const ico=read('../branding/'+app+'/app.ico');assert.equal(ico.readUInt16LE(2),1);const sizes=Array.from({length:ico.readUInt16LE(4)},(_,i)=>ico[6+i*16]||256);for(const size of [16,24,32,48,64,128,256])assert.ok(sizes.includes(size));}
 const tools=JSON.parse(read('../src-tauri/tauri.conf.json')),reader=JSON.parse(read('../src-tauri/tauri.reader.conf.json'));assert.equal(tools.productName,'sTool PDF');assert.equal(reader.productName,'sReader PDF');assert.notEqual(tools.identifier,reader.identifier);assert.notEqual(tools.mainBinaryName,reader.mainBinaryName);assert.deepEqual(tools.bundle.icon,['../branding/sTool_PDF/app.ico']);assert.deepEqual(reader.bundle.icon,['../branding/sReader_PDF/app.ico']);
});
test('Reader icons remain pinned MIT Phosphor originals',()=>{
 const source=JSON.parse(read('../ui/reader-icons/SOURCE.json'));assert.equal(source.commit,'2b75f3ad12b420c9504ef05df8d2564a28f8500e');assert.equal(source.license,'MIT');assert.equal(Object.keys(source.assets).length,14);
 for(const [name,hash]of Object.entries(source.assets))assert.equal(createHash('sha256').update(read('../ui/reader-icons/'+name)).digest('hex'),hash,name);
 assert.match(read('../ui/reader-icons/LICENSE').toString(),/MIT License/);
});
