import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','ui');
const [html,js,print]=await Promise.all(['reader.html','reader.js','reader-print.js'].map(f=>readFile(path.join(root,f),'utf8')));
test('Quick Sign keeps the three simple local creation paths and typography choice',()=>{
  for(const id of ['signatureModeType','signatureModeDraw','signatureModeImage','signatureTypePanel','signatureDrawPanel','signatureImagePanel','signatureFont','typeName','clearInk','imageSign','useSign'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(js,/const fonts=\{'Segoe Print'/);
  assert.match(js,/setSignatureMode\('type'\)/);
  assert.match(js,/r2\.rememberSignature\(image\)/);
  assert.match(html,/không phải chữ ký số có chứng thư/);
});
test('print layout groups controls that already drive PDF.js print preparation',()=>{
  for(const id of ['printSubset','printRange','printParity','printLayout','printNup','printPaper','printOrientation','printScale','printPercent','printMargin','printAutoRotate','printQuality','printEdits','printAnnotations','printForms','printGray'])assert.match(print,new RegExp("'"+id+"'"));
  assert.match(print,/window\.print\(\)/);
});
