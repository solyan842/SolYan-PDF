#!/usr/bin/env node
// Read-only, fail-closed GitHub state gate; never edits source or starts CI.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const ROOT='https://api.github.com/repos/solyan842/SolYan-PDF';
const SHA=/^[a-f0-9]{40}$/i;
function block(reason){throw Error('PREFLIGHT BLOCKED: '+reason);}
async function get(path){
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
  if(token)headers.Authorization='Bearer '+token;
  const r=await fetch(ROOT+path,{headers,signal:AbortSignal.timeout(15000)});
  if(r.status===404)return null;
  if(!r.ok)block('GitHub API '+r.status+' for '+path);
  return r.json();
}
export async function preflight({branch,head,edit,create},request=get){
  if(!branch||!/^feat\/windows-reader-[a-z0-9-]+$/.test(branch))block('explicit active Reader feature branch required');
  if(!head||!SHA.test(head))block('exact 40-character HEAD required');
  if(Boolean(edit)===Boolean(create))block('specify exactly one --edit or --create path');
  const path=edit||create;
  if(!/^[-\w./]+$/.test(path)||path.startsWith('/')||path.includes('..'))block('unsafe file path');
  // Must fetch repository-wide Actions FIRST; never infer active branch from CI.
  const all=await request('/actions/runs?per_page=100');
  const runs=all?.workflow_runs;
  if(!Array.isArray(runs)||!runs.length||!runs[0].head_sha||!runs[0].head_branch)block('repository-wide latest Actions not verified');
  const latest=runs[0];
  const ref=await request('/branches/'+branch);
  if(!ref?.commit?.sha)block('branch not found');
  if(ref.commit.sha.toLowerCase()!==head.toLowerCase())block('HEAD mismatch expected '+head+' actual '+ref.commit.sha);
  const exact=runs.filter(x=>x.head_branch===branch&&x.name==='Windows Reader CI');
  if(!exact.length)block('Reader CI not present in first 100 unfiltered Actions; inspect GitHub and stop');
  const readerRun=exact[0];
  if(readerRun.head_sha?.toLowerCase()!==head.toLowerCase())block('latest branch Reader CI is for another commit');
  if(readerRun.status!=='completed'||readerRun.conclusion!=='success')block('exact-head CI not PASS: '+readerRun.status+'/'+readerRun.conclusion);
  const file=await request('/contents/'+path.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(branch));
  if(edit&&!file?.sha)block('edit target missing: '+path);
  if(create&&file!==null)block('new path already exists: '+path);
  return {
    ok:true,branch,head,
    repositoryLatest:{id:latest.id,number:latest.run_number,branch:latest.head_branch,sha:latest.head_sha,status:latest.status,conclusion:latest.conclusion},
    verifiedReaderCI:{id:readerRun.id,number:readerRun.run_number,sha:readerRun.head_sha,conclusion:readerRun.conclusion},
    scope:{operation:edit?'edit':'create',path,blobSha:edit?file.sha:null},
    reminder:'Read exact code and tests to detect semantic duplicates; path check cannot prove a feature is new.'
  };
}
function parse(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    const name=argv[i];
    if(name==='--help'){out.help=true;continue;}
    if(!['--branch','--head','--edit','--create'].includes(name)||!argv[i+1]||argv[i+1].startsWith('--')||out[name])block('invalid CLI arguments');
    out[name]=argv[++i];
  }
  return {branch:out['--branch'],head:out['--head'],edit:out['--edit'],create:out['--create'],help:out.help};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const opts=parse(process.argv.slice(2));
  if(opts.help)console.log('node scripts/reader-preflight.mjs --branch feat/windows-reader-fast-unified-controls --head <40-char-sha> (--edit path | --create path)');
  else preflight(opts).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=2;});
}
