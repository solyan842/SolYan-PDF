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
 assert.match(reader.app.security.csp,/connect-src[^;]*\bipc:\s+http:\/\/ipc\.localhost/,'Reader must allow Tauri v2 IPC origin');
});
test('Reader icons remain pinned MIT Phosphor originals',()=>{
 const source=JSON.parse(read('../ui/reader-icons/SOURCE.json'));assert.equal(source.commit,'2b75f3ad12b420c9504ef05df8d2564a28f8500e');assert.equal(source.license,'MIT');assert.equal(Object.keys(source.assets).length,23);
 for(const [name,hash]of Object.entries(source.assets))assert.equal(createHash('sha256').update(read('../ui/reader-icons/'+name)).digest('hex'),hash,name);
 assert.match(read('../ui/reader-icons/LICENSE').toString(),/MIT License/);
});

test('Reader displays unshaded icons and distinct layout/fullscreen symbols',()=>{
 const source=JSON.parse(read('../ui/reader-icons/SOURCE.json'));
 assert.equal(Object.keys(source.outline.assets).length,23);assert.equal(Object.keys(source.local.assets).length,4);
 for(const [name,hash]of Object.entries({...source.outline.assets,...source.local.assets})){const bytes=read('../ui/reader-icons/'+name);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name);assert.doesNotMatch(bytes.toString(),/opacity=/,name);}
 for(const name of Object.keys(source.assets)){const original=read('../ui/reader-icons/'+name).toString().replace(/\r\n/g,'\n');assert.equal(read('../ui/reader-icons/'+name.replace('-duotone','-outline')).toString(),original.replace(/<path\b[^>]*\bopacity="0\.2"[^>]*\/>/g,''));}
 assert.equal(new Set(Object.values(source.local.assets)).size,4);
});


test('Native Reader bootstrap has no eager browser-only transfer dependency',()=>{
 const module=read('../ui/reader-actions.js').toString();
 assert.doesNotMatch(module,/^import\s+.*document-transfer\.js/m,'document-transfer must not block app startup');
 assert.match(module,/await import\('\.\/document-transfer\.js'\)/,'browser transfer must remain accessible on demand');
});

test('Reader initial HTML does not eagerly load the Unicode font engine',()=>{
 const html=read('../ui/reader.html').toString();
 assert.doesNotMatch(html,/<script[^>]+src=["']\.\/vendor\/fontkit\.umd\.min\.js["']/i);
 const editor=read('../ui/reader-text.js').toString();
 assert.match(editor,/ensureFontkit\(/);
 assert.match(editor,/fontkitPending/);
});

test('optional Windows font catalog is bounded and loaded only on demand',async()=>{
 const {textFonts,windowsFontChoices,discoverWindowsFonts}=await import('../ui/reader-text.js');
 assert.equal(Object.keys(windowsFontChoices).length,13);
 assert.deepEqual(Object.keys(textFonts),['sans','serif','mono']);
 const before=globalThis.__TAURI__,calls=[];
 try{
  globalThis.__TAURI__={core:{invoke:async command=>{
   calls.push(command);
   if(command==='reader_windows_fonts')return ['win-arial','win-times','../forbidden','win-consolas'];
   throw Error('Unknown command');
  }}};
  const ids=await discoverWindowsFonts();
  assert.deepEqual(ids,['win-arial','win-times','win-consolas']);
  assert.equal(textFonts['win-arial'].family,'Arial');
  assert.equal(textFonts['win-times'].family,'Times New Roman');
  assert.equal(textFonts['../forbidden'],undefined);
  await discoverWindowsFonts();
  assert.deepEqual(calls,['reader_windows_fonts']);
 }finally{if(before===undefined)delete globalThis.__TAURI__;else globalThis.__TAURI__=before;}
});

test('Reader default PDF registration is per-user and never overrides Windows UserChoice',()=>{
 const reader=JSON.parse(read('../src-tauri/tauri.reader.conf.json'));
 const tools=JSON.parse(read('../src-tauri/tauri.conf.json'));
 assert.equal(reader.bundle.windows.nsis.installMode,'currentUser');
 assert.equal(reader.bundle.windows.nsis.installerHooks,'./windows/reader-default-app-hooks.nsi');
 assert.equal(tools.bundle.windows.nsis?.installerHooks,undefined,'Toolbox is not modified');
 const hook=read('../src-tauri/windows/reader-default-app-hooks.nsi').toString();
 assert.match(hook,/NSIS_HOOK_POSTINSTALL/);
 assert.match(hook,/NSIS_HOOK_PREUNINSTALL/);
 assert.match(hook,/WriteRegStr HKCU "Software\\RegisteredApplications" "sReader PDF"/);
 assert.match(hook,/WriteRegStr HKCU "Software\\SolYan\\sReader PDF\\Capabilities\\FileAssociations" "\.pdf"/);
 assert.doesNotMatch(hook,/^\s*(?:WriteReg\w*|DeleteReg\w*)\s+\w+\s+"[^"]*UserChoice/m,'Never write Windows protected defaults');
 const rust=read('../src-tauri/src/main.rs').toString();
 assert.match(rust,/reader_pdf_default_state/);
 assert.match(rust,/ms-settings:defaultapps\?registeredAppUser=sReader%20PDF/);
});

test('Reader-only native WebView2 enables touchpad gestures without altering Toolbox',()=>{
 const reader=JSON.parse(read('../src-tauri/tauri.reader.conf.json'));
 const toolbox=JSON.parse(read('../src-tauri/tauri.conf.json'));
 assert.equal(reader.app.windows[0].zoomHotkeysEnabled,true);
 assert.equal(toolbox.app.windows[0].zoomHotkeysEnabled,undefined);
 const js=read('../ui/reader.js').toString();
 assert.match(js,/document\.addEventListener\('wheel'/);
 assert.match(js,/capture:true,passive:false/);
 assert.match(js,/if\(!event\.ctrlKey\)return/);
 assert.match(js,/event\.preventDefault\(\)/);
});

test('Reader has exactly one shared rail/thumb style and one aligned text-control grid',()=>{
 const stylesheet=read('../ui/reader.css').toString();
 const shared=stylesheet.slice(stylesheet.indexOf('/* sReader control standard'),stylesheet.indexOf('/* Foxit-inspired docked'));
 assert.match(shared,/input\[type=range\]::\-webkit-slider-runnable-track/);
 assert.match(shared,/input\[type=range\]::\-webkit-slider-thumb/);
 assert.match(shared,/height:2px/);
 assert.match(shared,/--reader-range-thumb-size:10px/);
 assert.match(shared,/width:var\(--reader-range-thumb-size\)/);
 assert.match(shared,/height:var\(--reader-range-thumb-size\)/);
 assert.match(stylesheet,/--reader-control-height:32px/);
 assert.match(stylesheet,/--reader-control-label-height:28px/);
 assert.match(stylesheet,/grid-template-columns:minmax\(0,1fr\) 74px 62px/);
 assert.doesNotMatch(stylesheet,/#readerFormatPanel \.format-inline>input\[type=range\][^{]*\{[^}]*accent-color/);
 assert.doesNotMatch(stylesheet,/#readerFooter #zoomRange::\-webkit-slider-thumb/);
});
