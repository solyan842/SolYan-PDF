import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={PDFLib:await import('pdf-lib')};
const {sheets,printPageDensity}=await import('../ui/reader-print-layout.js');
const sizes={0:[600,800],1:[800,600],2:[1200,1600],3:[600,800],4:[600,800]};
test('mixed physical sizes and actual/custom scaling preserve dimensions',()=>{
 const p=sheets([0,1],sizes);assert.deepEqual(p.map(s=>s.size),[[600,800],[800,600]]);
 assert.equal(sheets([0],sizes,{paper:[300,400],scale:'actual',rotate:false})[0].items[0].width,600);
 assert.equal(sheets([0],sizes,{paper:[300,400],scale:'custom',percent:50,rotate:false})[0].items[0].width,300);
});
test('fit, reduce and actual size produce distinct placements when source paper is smaller',()=>{
 const small={0:[300,400]};
 const fit=sheets([0],small,{paper:[595,842],scale:'fit',rotate:false})[0].items[0];
 const reduce=sheets([0],small,{paper:[595,842],scale:'reduce',rotate:false})[0].items[0];
 const actual=sheets([0],small,{paper:[595,842],scale:'actual',rotate:false})[0].items[0];
 assert.ok(fit.width>reduce.width&&fit.height>reduce.height,'Fit should enlarge a small source page to the target paper');
 assert.deepEqual([reduce.width,reduce.height],[actual.width,actual.height],'Reduce should not enlarge; actual size should preserve native dimensions');
});
test('N-up and booklet impose page order with padding instead of dropping pages',()=>{
 const multiple=sheets([0,1,2,3,4],sizes,{nup:4,paper:[800,600]});assert.equal(multiple.length,2);assert.deepEqual(multiple.flatMap(s=>s.items.map(p=>p.index)),[0,1,2,3,4]);
 const booklet=sheets([0,1,2,3,4],sizes,{mode:'booklet',paper:[800,600]});assert.equal(booklet.length,4);assert.deepEqual(booklet.map(s=>s.items.map(p=>p.index)),[[0],[1],[2],[3,4]]);
});
test('tiling covers entire large page at physical scale without source mutation',()=>{
 const source=structuredClone(sizes),p=sheets([2],sizes,{mode:'tile',paper:[600,800]});assert.equal(p.length,4);assert.deepEqual(p.map(s=>[s.items[0].x,s.items[0].y]),[[0,0],[-600,0],[0,-800],[-600,-800]]);assert.deepEqual(sizes,source);
});

test('print preview renders beyond 17 A4 sheets within the raster memory budget',()=>{
 const pages=Array.from({length:30},(_,i)=>i),many=Object.fromEntries(pages.map(i=>[i,[595.276,841.89]]));
 const plan=sheets(pages,many),density=printPageDensity(plan,216);
 assert.equal(plan.length,30);
 assert.ok(density>0&&density<216/72,'large jobs lower raster resolution rather than dropping sheets');
 const total=plan.reduce((sum,sheet)=>sum+Math.floor(sheet.size[0]*density)*Math.floor(sheet.size[1]*density),0);
 assert.ok(total<=80_000_000,'raster budget exceeded: '+total);
 assert.ok(Math.min(...plan.map(s=>s.size[0]*s.size[1]*density*density))<=12_000_000);
 const shortPlan=sheets(pages.slice(0,17),many);
 assert.equal(printPageDensity(shortPlan,216),3,'small jobs retain requested print resolution');
});