import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findLiteralMatches,normalizeTerms,rectForTextItem} from '../ui/redaction-tools-core.js';

test('terms are trimmed, Unicode-normalized and deduplicated with Vietnamese case folding',()=>{
  assert.deepEqual(normalizeTerms('  Hòa Bình \nHÒA BÌNH\n\nMã 123'),['Hòa Bình','Mã 123']);
  assert.deepEqual(normalizeTerms('ID\nid',true),['ID','id']);
  assert.throws(()=>normalizeTerms(Array.from({length:21},(_,i)=>'term'+i).join('\n')),/Tối đa 20/);
  assert.throws(()=>normalizeTerms('x'.repeat(201)),/200 ký tự/);
});

test('literal matching honors Unicode whole-word boundaries and text geometry',()=>{
  const viewport={transform:[1,0,0,-1,0,100],scale:1,width:200,height:100};
  const items=[{str:'Hòa Bình',transform:[10,0,0,10,10,80],width:45,height:10},{str:'HÒA BÌNH',transform:[10,0,0,10,10,60],width:45,height:10},{str:'banana',transform:[10,0,0,10,10,40],width:35,height:10}];
  const matches=findLiteralMatches({items},viewport,['hòa bình'],{wholeWord:true});
  assert.equal(matches.length,2);assert.deepEqual(matches[0].terms,['hòa bình']);assert.ok(matches[0].rect.x>=0&&matches[0].rect.width>45);
  assert.equal(rectForTextItem({str:'empty'},viewport),null);
});
