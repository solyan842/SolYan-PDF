import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const root='desktop/ui/';
test('sTool uses the exact pinned Reader Phosphor Duotone mapping offline',()=>{
  const context={window:{}};
  for(const file of ['catalog.js','catalog-additions.js','icons.js'])
    runInNewContext(read(root+file),context,{filename:file,timeout:2000});
  const icons=context.window.SOLYAN_PHOSPHOR;
  const catalog=context.window.SOLYAN_TOOL_CATALOG;
  const source=JSON.parse(read(root+'icons/phosphor-duotone/SOURCE.json'));
  assert.equal(icons.sourceCommit,'2b75f3ad12b420c9504ef05df8d2564a28f8500e');
  assert.equal(source.commit,icons.sourceCommit);
  assert.equal(Object.keys(icons.tools).length,96);
  assert.equal(Object.keys(source.assets).length,86);
  for(const tool of catalog.tools){
    assert.ok(Object.hasOwn(icons.tools,tool.id),'unmapped tool '+tool.id);
    const slug=icons.tools[tool.id];
    const filename=slug+'-duotone.svg';
    assert.ok(Object.hasOwn(source.assets,filename),'untracked SVG '+filename);
    assert.ok(existsSync(root+'icons/phosphor-duotone/'+filename),'missing SVG '+filename);
  }
  for(const category of catalog.categories)assert.ok(Object.hasOwn(icons.categories,category.id));
  assert.match(read(root+'icons/phosphor-duotone/LICENSE'),/MIT License/);
});
test('sTool UI keeps Reader control styling without loading the Reader app',()=>{
  const html=read(root+'index.html'),styles=read(root+'styles.css'),app=read(root+'app.js');
  assert.ok(html.indexOf('src="./icons.js"')>=0);
  assert.ok(html.indexOf('src="./icons.js"')<html.indexOf('src="./app.js"'));
  assert.doesNotMatch(html,/reader-launch\.js|id="open-reader"|\.\/reader\.html|vendor\/sTool_PDF\.png/);
  assert.match(app,/icons\.tool\(tool\.id, tool\.category\)/);
  assert.match(app,/icons\.category\(c\.id\)/);
  assert.match(styles,/\.tool-body\{display:flex;flex-direction:column/);
  assert.match(styles,/\.tool-svg\{/);
});
