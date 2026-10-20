import test from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from './reader-preflight.mjs';

const head='f39ee9ab6b7c7a37facc744ced0eb936ba698f91';
const branch='feat/windows-reader-fast-unified-controls';
const runs=[
  {id:29,run_number:29,name:'Windows Reader CI',head_branch:'ci/windows-reader-fast-20261020',head_sha:'35791444c8402e4549ba9e4e694ae9f0ad2460a6',status:'completed',conclusion:'success'},
  {id:27,run_number:27,name:'Windows Reader CI',head_branch:branch,head_sha:head,status:'completed',conclusion:'success'}
];
const data={
 '/actions/runs?per_page=100':{workflow_runs:runs},
 ['/branches/'+branch]:{commit:{sha:head}},
 ['/contents/desktop/ui/reader.css?ref='+encodeURIComponent(branch)]:{sha:'a'.repeat(40)},
 ['/contents/scripts/new-tool.mjs?ref='+encodeURIComponent(branch)]:null
};
function mock(override={}){
 const calls=[];
 const request=async path=>{calls.push(path);return Object.hasOwn(override,path)?override[path]:(data[path]??null);};
 return {calls,request};
}
test('global Actions first: #27 remains correct despite newer wrong-branch #29',async()=>{
 const {request,calls}=mock();
 const result=await preflight({branch,head,edit:'desktop/ui/reader.css'},request);
 assert.equal(result.ok,true);
 assert.equal(result.repositoryLatest.number,29);
 assert.equal(result.verifiedReaderCI.number,27);
 assert.equal(calls[0],'/actions/runs?per_page=100');
});
test('rejects a stale branch HEAD',async()=>{
 const {request}=mock();
 await assert.rejects(preflight({branch,head:'b'.repeat(40),edit:'desktop/ui/reader.css'},request),/HEAD mismatch/);
});
test('rejects nonpassing exact-HEAD Reader CI',async()=>{
 const {request}=mock({'/actions/runs?per_page=100':{workflow_runs:[runs[0],{...runs[1],status:'in_progress',conclusion:null}]}});
 await assert.rejects(preflight({branch,head,edit:'desktop/ui/reader.css'},request),/not PASS/);
});
test('rejects missing repository-wide Actions without guessing',async()=>{
 const {request}=mock({'/actions/runs?per_page=100':null});
 await assert.rejects(preflight({branch,head,edit:'desktop/ui/reader.css'},request),/repository-wide/);
});
test('rejects duplicate create, accepts a truly absent path',async()=>{
 const path='/contents/scripts/new-tool.mjs?ref='+encodeURIComponent(branch);
 const good=await preflight({branch,head,create:'scripts/new-tool.mjs'},mock().request);
 assert.equal(good.scope.operation,'create');
 const {request}=mock({[path]:{sha:'a'.repeat(40)}});
 await assert.rejects(preflight({branch,head,create:'scripts/new-tool.mjs'},request),/already exists/);
});
