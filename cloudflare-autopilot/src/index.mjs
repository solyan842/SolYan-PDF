import {SOURCE_BRANCH,REPOSITORY,initialState,onWorkflowCompleted,reconcile,statusSnapshot} from './planner.mjs';
const enc=new TextEncoder();
function fail(text,status=400){return new Response(text,{status,headers:{'content-type':'text/plain; charset=utf-8'}});}
function json(value,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store'}});}
export async function validGitHubSignature(body,secret,header){
  if(!secret||!/^sha256=[a-fA-F0-9]{64}$/.test(header||''))return false;
  const bytes=new Uint8Array(32);
  for(let i=0;i<32;i++)bytes[i]=parseInt(header.slice(7+i*2,9+i*2),16);
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,bytes,body);
}
async function githubGet(path,env){
  const headers={'Accept':'application/vnd.github+json','User-Agent':'SolYan-PDF-Cloudflare-Autopilot','X-GitHub-Api-Version':'2022-11-28'};
  if(env.GITHUB_TOKEN)headers.Authorization=`Bearer ${env.GITHUB_TOKEN}`;
  const response=await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`,{headers});
  if(!response.ok)throw new Error(`GitHub API ${response.status}`);
  return response.json();
}
function controller(env){return env.CONTROLLER.getByName('solyan-pdf');}
async function fromGitHub(env){
  const [branch,records]=await Promise.all([
    githubGet(`branches/${SOURCE_BRANCH}`,env),githubGet('actions/runs?per_page=100',env)
  ]);
  return {sha:branch.commit.sha,runs:records.workflow_runs.map(r=>({id:r.id,name:r.name,head_sha:r.head_sha,head_branch:r.head_branch,status:r.status,conclusion:r.conclusion}))};
}
export class Controller {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const type=new URL(request.url).pathname;
    const state=(await this.ctx.storage.get('state'))??initialState();
    if(type==='/internal/status')return json(statusSnapshot(state));
    if(type==='/internal/reconcile'){
      const data=await request.json();
      reconcile(state,data.sha,data.runs);
      await this.ctx.storage.put('state',state);
      return json(statusSnapshot(state));
    }
    if(type==='/internal/workflow'){
      const data=await request.json();
      const result=onWorkflowCompleted(state,data);
      if(!result.ignored&&!result.duplicate)await this.ctx.storage.put('state',state);
      return json({accepted:!result.ignored,duplicate:!!result.duplicate,nextTask:statusSnapshot(state).nextTask});
    }
    return fail('Not found',404);
  }
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/health')return json({status:'ok',aiRunner:'not_configured'});
    if(path==='/status'&&request.method==='GET'){
      if(!env.STATUS_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.STATUS_TOKEN}`)return fail('Unauthorized',401);
      return controller(env).fetch(new Request('https://internal/internal/status'));
    }
    if(path!=='/github/webhook'||request.method!=='POST')return fail('Not found',404);
    const raw=await request.arrayBuffer();
    if(raw.byteLength>512000)return fail('Payload too large',413);
    if(!await validGitHubSignature(raw,env.GITHUB_WEBHOOK_SECRET,request.headers.get('X-Hub-Signature-256')))return fail('Unauthorized',401);
    if(request.headers.get('X-GitHub-Event')!=='workflow_run')return json({ignored:true});
    const body=JSON.parse(new TextDecoder().decode(raw));
    if(body.action!=='completed'||body.repository?.full_name!==REPOSITORY||body.workflow_run?.head_repository?.full_name!==REPOSITORY)return json({ignored:true});
    if(body.workflow_run.head_branch!==SOURCE_BRANCH)return json({ignored:true});
    // Never allow an old webhook to accept a task after branch HEAD advanced.
    const branch=await githubGet(`branches/${SOURCE_BRANCH}`,env);
    const run=body.workflow_run;
    const message={repo:REPOSITORY,delivery:request.headers.get('X-GitHub-Delivery'),currentHead:branch.commit.sha,
      run:{id:run.id,name:run.name,head_sha:run.head_sha,head_branch:run.head_branch,status:run.status,conclusion:run.conclusion}};
    return controller(env).fetch(new Request('https://internal/internal/workflow',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)}));
  },
  async scheduled(_controller,env){
    const current=await fromGitHub(env);
    const response=await controller(env).fetch(new Request('https://internal/internal/reconcile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(current)}));
    if(!response.ok)throw new Error(`State reconciliation failed: ${response.status}`);
  },
};
