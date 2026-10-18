export const SOURCE_BRANCH = 'feat/windows-desktop-d4-text-integration';
export const REPOSITORY = 'solyan842/SolYan-PDF';
export const BASELINE_WORKFLOWS = ['Windows Desktop CI', 'Windows OCR Runtime CI'];
export const TASKS = [
  {id: 'desktop-d5-signing', title: 'D5: offline signing runtime integration', dependsOn: [], requiredWorkflows: ['Windows Desktop CI']},
  {id: 'desktop-d5-pdfa', title: 'D5: offline PDF/A runtime integration', dependsOn: ['desktop-d5-signing'], requiredWorkflows: ['Windows Desktop CI']},
  {id: 'desktop-d6-installer', title: 'D6: installer acceptance and release hardening', dependsOn: ['desktop-d5-pdfa'], requiredWorkflows: ['Windows Desktop CI']},
];
const MAX_DELIVERIES = 256;
export function initialState(){
  return {schema: 1, baseline: {sha:null, accepted:false}, currentHead:null,
    tasks: Object.fromEntries(TASKS.map(t=>[t.id,{status:'queued',sha:null,ci:{},repairs:0}])),
    lease:null, seenDeliveries:[], lastEvent:null, blockedReason:null};
}
export function workflowVerdict(runs, sha, branch, expected){
  const selected={};
  for(const run of runs){
    if(run.head_sha!==sha || run.head_branch!==branch || !expected.includes(run.name))continue;
    if(!selected[run.name])selected[run.name]=run;
  }
  if(expected.some(n=>!selected[n]))return 'missing';
  if(expected.some(n=>selected[n].status!=='completed'))return 'running';
  if(expected.some(n=>selected[n].conclusion!=='success'))return 'failed';
  return 'passed';
}
export function nextReady(state){
  if(!state.baseline.accepted || state.blockedReason || state.lease)return null;
  if(Object.values(state.tasks).some(t=>['working','waiting_ci','repair_ready','blocked'].includes(t.status)))return null;
  for(const task of TASKS){
    const rec=state.tasks[task.id];
    if(rec.status==='queued'&&task.dependsOn.every(d=>state.tasks[d].status==='done'))return task;
  }
  return null;
}
export function reconcile(state, currentHead, runs){
  if(typeof currentHead!=='string'|| !/^[a-f0-9]{40}$/.test(currentHead))throw Error('Invalid branch SHA');
  state.currentHead=currentHead;
  if(!state.baseline.accepted){
    if(workflowVerdict(runs,currentHead,SOURCE_BRANCH,BASELINE_WORKFLOWS)==='passed'){
      state.baseline={sha:currentHead,accepted:true};
    }
  }
  for(const task of TASKS){
    const rec=state.tasks[task.id];
    if(rec.status!=='waiting_ci')continue;
    if(rec.sha!==currentHead){rec.status='blocked';rec.reason='HEAD changed during pending CI';continue;}
    const verdict=workflowVerdict(runs,rec.sha,SOURCE_BRANCH,task.requiredWorkflows);
    if(verdict==='passed')rec.status='done';
    if(verdict==='failed')rec.status=rec.repairs>=2?'blocked':'repair_ready';
  }
  return state;
}
export function onWorkflowCompleted(state, input){
  const {delivery,repo,run,currentHead}=input;
  if(repo!==REPOSITORY||!run||run.status!=='completed'||run.head_branch!==SOURCE_BRANCH||run.head_sha!==currentHead)return {state,ignored:true};
  if(typeof delivery!=='string'||delivery.length>128||!delivery)throw Error('Invalid delivery');
  if(state.seenDeliveries.includes(delivery))return {state,duplicate:true};
  state.seenDeliveries.push(delivery);
  if(state.seenDeliveries.length>MAX_DELIVERIES)state.seenDeliveries.splice(0,state.seenDeliveries.length-MAX_DELIVERIES);
  state.currentHead=currentHead;
  state.lastEvent={workflow:run.name,sha:run.head_sha,result:run.conclusion,id:run.id};
  for(const task of TASKS){
    const rec=state.tasks[task.id];
    if(rec.status!=='waiting_ci'||rec.sha!==run.head_sha||!task.requiredWorkflows.includes(run.name))continue;
    rec.ci[run.name]={status:run.status,conclusion:run.conclusion,id:run.id};
    if(task.requiredWorkflows.every(name=>rec.ci[name]?.conclusion==='success'))rec.status='done';
    else if(task.requiredWorkflows.some(name=>rec.ci[name]&&rec.ci[name].conclusion!=='success')){
      rec.status=rec.repairs>=2?'blocked':'repair_ready';
      rec.failedRun=run.id;
    }
  }
  return {state,ignored:false};
}
export function statusSnapshot(state){
  const task=nextReady(state);
  const fixing=TASKS.find(t=>state.tasks[t.id].status==='repair_ready');
  return {schema:state.schema,baseline:state.baseline,currentHead:state.currentHead,
    nextTask:fixing?.id??task?.id??null,
    nextAction:fixing?'repair':task?'implement':'wait_or_blocked',
    tasks:state.tasks,lastEvent:state.lastEvent,runnerConfigured:false,
    note:'No AI wakeup/runner configured. Cloudflare queues work but does not invoke ChatGPT Plus.'};
}
