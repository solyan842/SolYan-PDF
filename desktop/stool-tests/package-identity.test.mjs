import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import YAML from 'yaml';

const workflow=YAML.parse(readFileSync(new URL('../../.github/workflows/windows-stool-acceptance.yml',import.meta.url),'utf8'));
const script=workflow.jobs['accept-existing-candidate'].steps.find(s=>s.id==='candidate').with.script;
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const resolveCandidate=new AsyncFunction('github','context','core',script);
async function check(files=[],{run={},status='ahead'}={}){
  const output={};
  const github={rest:{actions:{getWorkflowRun:async()=>({data:{
    path:'.github/workflows/windows-stool-installer.yml',status:'completed',conclusion:'success',
    head_sha:'a'.repeat(40),head_repository:{full_name:'solyan842/SolYan-PDF'},...run
  }})},repos:{compareCommitsWithBasehead:async()=>({data:{status,files}})}}};
  const previous=process.env.CANDIDATE_RUN;process.env.CANDIDATE_RUN='123';
  try{await resolveCandidate(github,{repo:{owner:'solyan842',repo:'SolYan-PDF'},sha:'b'.repeat(40)},
    {setOutput:(k,v)=>output[k]=v});return output;}
  finally{if(previous===undefined)delete process.env.CANDIDATE_RUN;else process.env.CANDIDATE_RUN=previous;}
}
test('same installer accepts identical source or a compatible driver-only revision',async()=>{
  assert.equal((await check([],{status:'identical'})).sha,'a'.repeat(40));
  assert.equal((await check([{filename:'desktop/backend/stool-save-dialog.ps1'},{filename:'desktop/stool-tests/native-save.mjs'}])).sha,'a'.repeat(40));
});
test('candidate refuses changed application code and renamed application files',async()=>{
  for(const filename of ['desktop/ui/output-save.js','desktop/src-tauri/src/output_save.rs','engines/ocr-service/app/main.py'])
    await assert.rejects(check([{filename}]),/Application source differs/);
  await assert.rejects(check([{filename:'docs/renamed.md',previous_filename:'desktop/ui/merge.js'}]),/Application source differs/);
});
test('candidate refuses failed, foreign, unrelated or incomplete source comparisons',async()=>{
  for(const run of [{conclusion:'failure'},{path:'.github/workflows/windows-reader-ci.yml'},
    {head_repository:{full_name:'other/fork'}},{head_sha:'main'}])
    await assert.rejects(check([],{run}),/Invalid installer candidate/);
  await assert.rejects(check([],{status:'diverged'}),/Application source differs/);
  await assert.rejects(check(Array.from({length:300},(_,i)=>({filename:`docs/${i}.md`})) ),/Application source differs/);
});
