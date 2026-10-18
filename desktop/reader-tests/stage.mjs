import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const vendor = new URL('../ui/vendor/', import.meta.url);
await mkdir(vendor, { recursive: true });
await cp(new URL('./node_modules/pdf-lib/dist/pdf-lib.min.js', import.meta.url), new URL('pdf-lib.min.js', vendor));
for (const directory of ['build','web','cmaps','standard_fonts','wasm']) {
  await cp(new URL(`./node_modules/pdfjs-dist/${directory}/`, import.meta.url), new URL(`pdfjs/${directory}/`, vendor), { recursive: true });
}
await cp(new URL('./node_modules/pdfjs-dist/LICENSE', import.meta.url), new URL('pdfjs/LICENSE', vendor));
console.log(`Staged pinned pdf-lib 1.17.1 and PDF.js 6.4.299 at ${fileURLToPath(vendor)}`);

for(const app of ['sReader_PDF','sTool_PDF'])await cp(new URL('../branding/'+app+'/icon-48.png',import.meta.url),new URL(app+'.png',vendor));
