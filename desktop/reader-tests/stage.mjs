import { cp, mkdir, readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const vendor = new URL('../ui/vendor/', import.meta.url);
await mkdir(vendor, { recursive: true });
const appConfig=JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
await writeFile(new URL('reader-version.json',vendor),JSON.stringify({version:appConfig.version})+'\n');
await cp(new URL('./node_modules/pdf-lib/dist/pdf-lib.min.js', import.meta.url), new URL('pdf-lib.min.js', vendor));
await cp(new URL('./node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js', import.meta.url), new URL('fontkit.umd.min.js',vendor));
await cp(new URL('./node_modules/@pdf-lib/fontkit/README.md', import.meta.url), new URL('fontkit-README.txt',vendor));
const fonts=JSON.parse(await readFile(new URL('./reader-fonts.json',import.meta.url),'utf8'));
await mkdir(new URL('reader-fonts/',vendor),{recursive:true});
for(const asset of fonts.assets){
  const target=new URL('reader-fonts/'+asset.name,vendor),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  let bytes;try{bytes=await readFile(target);}catch{}
  if(!bytes||hash(bytes)!==asset.sha256){const response=await fetch(asset.url);if(!response.ok)throw Error('Font download failed: '+asset.name);bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==asset.sha256)throw Error('Font hash mismatch: '+asset.name);await writeFile(target,bytes);}
}
for (const directory of ['build','web','cmaps','standard_fonts','wasm']) {
  await cp(new URL(`./node_modules/pdfjs-dist/${directory}/`, import.meta.url), new URL(`pdfjs/${directory}/`, vendor), { recursive: true });
}
await cp(new URL('./node_modules/pdfjs-dist/LICENSE', import.meta.url), new URL('pdfjs/LICENSE', vendor));
console.log(`Staged pinned pdf-lib 1.17.1 and PDF.js 6.4.299 at ${fileURLToPath(vendor)}`);

for(const app of ['sReader_PDF','sTool_PDF'])await cp(new URL('../branding/'+app+'/icon-48.png',import.meta.url),new URL(app+'.png',vendor));
