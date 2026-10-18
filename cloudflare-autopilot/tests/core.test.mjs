import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac,webcrypto} from 'node:crypto';
import {SOURCE_BRANCH,REPOSITORY,initialState,onWorkflowCompleted,reconcile,nextReady,statusSnapshot,workflowVerdict} from '../src/planner.mjs';
import {validGitHubSignature} from '../src/index.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const head='a'.repeat(40);
const run=(name,result,sha=head,id=123)=>({id,name,head_sha:sha,head_branch:SOURCE_BRANCH,status:'completed',conclusion:result});
const allGreen=[run('Windows Desktop CI','success'),run('Windows OCR Runtime CI','success')];
test('verified GitHub signature and tampering',async()=>{
 const secret="It's a Secret to Everybody";
 const bytes=new TextEncoder().encode('Hello, World!');
 const sig='sha256='+createHmac('sha256',secret).update(bytes).digest('hex');
 assert.equal(sig,'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17');
 assert.equal(await validGitHubSignature(bytes,secret,sig),true);
 assert.equal(await validGitHubSignature(new TextEncoder().encode('tampered'),secret,sig),false);
 assert.equal(await validGitHubSignature(bytes,secret,'sha256=bad'),false);
});
test('no task without exact-SHA baseline',()=>{
 const state=initialState();
 reconcile(state,head,[allGreen[0],run('Windows OCR Runtime CI','success','b'.repeat(40))]);
 assert.equal(state.baseline.accepted,false);
 assert.equal(nextReady(state),null);
});
test('CI PASS automatically unlocks next approved task',()=>{
 const state=initialState();
 reconcile(state,head,allGreen);
 assert.equal(nextReady(state)?.id,'desktop-d5-signing');
 state.tasks['desktop-d5-signing']={status:'waiting_ci',sha:head,ci:{},repairs:0};
 onWorkflowCompleted(state,{delivery:'unique',repo:REPOSITORY,currentHead:head,run:run('Windows Desktop CI','success')});
 assert.equal(state.tasks['desktop-d5-signing'].status,'done');
 assert.equal(nextReady(state)?.id,'desktop-d5-pdfa');
 const replay=onWorkflowCompleted(state,{delivery:'unique',repo:REPOSITORY,currentHead:head,run:run('Windows Desktop CI','failure')});
 assert.equal(replay.duplicate,true);
 assert.equal(state.tasks['desktop-d5-signing'].status,'done');
});
test('FAIL creates repair-ready state without claiming AI wakeup',()=>{
 const state=initialState();reconcile(state,head,allGreen);
 state.tasks['desktop-d5-signing']={status:'waiting_ci',sha:head,ci:{},repairs:0};
 onWorkflowCompleted(state,{delivery:'f1',repo:REPOSITORY,currentHead:head,run:run('Windows Desktop CI','failure')});
 assert.equal(state.tasks['desktop-d5-signing'].status,'repair_ready');
 assert.equal(statusSnapshot(state).nextAction,'repair');
 assert.equal(statusSnapshot(state).runnerConfigured,false);
});
test('old SHA and foreign repository fail closed',()=>{
 const state=initialState();reconcile(state,head,allGreen);
 state.tasks['desktop-d5-signing']={status:'waiting_ci',sha:head,ci:{},repairs:0};
 assert.equal(onWorkflowCompleted(state,{delivery:'old',repo:REPOSITORY,currentHead:'b'.repeat(40),run:run('Windows Desktop CI','success')}).ignored,true);
 assert.equal(onWorkflowCompleted(state,{delivery:'wrong',repo:'foreign/repo',currentHead:head,run:run('Windows Desktop CI','success')}).ignored,true);
 assert.equal(state.tasks['desktop-d5-signing'].status,'waiting_ci');
});
test('HEAD drift blocks pending task',()=>{
 const state=initialState();reconcile(state,head,allGreen);
 state.tasks['desktop-d5-signing']={status:'waiting_ci',sha:head,ci:{},repairs:0};
 reconcile(state,'b'.repeat(40),[]);
 assert.equal(state.tasks['desktop-d5-signing'].status,'blocked');
});
test('success from another branch does not count',()=>{
 const foreign=[{...run('Windows Desktop CI','success'),head_branch:'main'}];
 assert.equal(workflowVerdict(foreign,head,SOURCE_BRANCH,['Windows Desktop CI']),'missing');
});
test('unrelated failed workflow cannot alter task',()=>{
 const state=initialState();reconcile(state,head,allGreen);
 const before=JSON.stringify(state.tasks);
 onWorkflowCompleted(state,{delivery:'other',repo:REPOSITORY,currentHead:head,run:run('Unrelated CI','failure')});
 assert.equal(JSON.stringify(state.tasks),before);
});
