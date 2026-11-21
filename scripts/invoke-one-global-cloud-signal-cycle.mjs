/** Trusted Actions runner sends a short-lived identity, never vendor or owner keys. */
import {SIGNAL_CYCLE_AUDIENCE} from '../lib/trading/one-global-cloud-workflow-auth.mjs';
import {oneGlobalActionsCycleSummary,validateOneGlobalWorkflowForensic} from '../lib/trading/one-global-cloud-cycle-report.mjs';
import {appendFileSync} from 'node:fs';
// Emit only a fixed diagnostic stage on failure. Never log tokens, headers,
// provider messages, private response bodies, timestamps or source payloads.
let failureStage='SCOPE';
try{
  if(process.env.GITHUB_REPOSITORY!=='romitoorazio/fenice-investment-system'
    ||process.env.GITHUB_REF!=='refs/heads/main')throw Error('SCOPE');
  const identityUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if(identityUrl.protocol!=='https:'||!identityUrl.hostname.endsWith('.actions.githubusercontent.com'))
    throw Error('OIDC_ORIGIN');
  identityUrl.searchParams.set('audience',SIGNAL_CYCLE_AUDIENCE);
  failureStage='OIDC_HTTP_REQUEST';
  const identity=await fetch(identityUrl,{redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
  if(!identity.ok)throw Error('OIDC');
  const {value}=await identity.json();
  if(typeof value!=='string'||value.length<100||value.length>16000)throw Error('OIDC');
  failureStage='CYCLE_TRANSPORT';
  const response=await fetch(SIGNAL_CYCLE_AUDIENCE,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(70000),headers:{Authorization:'Bearer '+value,
      'Content-Type':'application/json'},body:JSON.stringify({action:'RESEARCH_SIGNAL_CYCLE'})});
  failureStage='CYCLE_HTTP_'+(Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:'OTHER');
  const text=await response.text();if(text.length>10000)throw Error('RESPONSE_SIZE');
  const report=JSON.parse(text);
  if(!response.ok)throw Error('CYCLE_BLOCKED');
  // Explicit allowlist only: never dump an upstream response to public logs.
  failureStage='CYCLE_REPORT_VALIDATION';
  const visible=oneGlobalActionsCycleSummary(report);
  console.log(JSON.stringify(visible.report));
  console.log('ONE_GLOBAL_PAPER_OUTCOME='+visible.status);
  console.log(visible.annotation);
  if(visible.euAnnotation)console.log(visible.euAnnotation);
  // This summary is attached to the job run, not just buried in raw logs.
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,visible.markdown,{encoding:'utf8'});
  // Fetch in parallel after settlement. Each read-only audit is isolated and
  // bound to the ordinal observed by this cycle before rendering any output.
  failureStage='READ_ONLY_FORENSIC';
  const targets=[['FIRST',1],['SECOND',2]];
  if(visible.report.virtualFillCount>2)targets.push(['LATEST',visible.report.virtualFillCount]);
  const audits=await Promise.allSettled(targets.map(async ([which,ordinal])=>{
    const response=await fetch(SIGNAL_CYCLE_AUDIENCE,{method:'POST',redirect:'error',
      signal:AbortSignal.timeout(52000),headers:{Authorization:'Bearer '+value,
        'Content-Type':'application/json'},body:JSON.stringify({action:'AUDIT_'+which+'_FILL_READ_ONLY'})});
    if(!response.ok)throw Error('FORENSIC_UNAVAILABLE');
    const text=await response.text();
    if(text.length>2500)throw Error('FORENSIC_OVERSIZE');
    return validateOneGlobalWorkflowForensic(JSON.parse(text),which,ordinal);
  }));
  for(const [index,outcome] of audits.entries()){
    const [which,ordinal]=targets[index];
    const tag='ONE_GLOBAL_'+which+'_FILL_FORENSIC=';
    if(outcome.status!=='fulfilled'){
      console.log(tag+'CHECK_NOT_CONFIRMED');
      if(which==='LATEST'){
        console.log('::warning title=FENICE PAPER forensic replay unavailable::Recorded FILL '+ordinal+' has no confirmed replay in this run.');
      }
      continue;
    }
    const audit=outcome.value;
    console.log(tag+audit.state+' REASON='+audit.forensicReasonCode
      +(audit.adapterFamily?' ADAPTER='+audit.adapterFamily:'')+' CHECKS='+audit.checksPassed+'/10'
      +(which==='LATEST'?' ORDINAL='+ordinal:''));
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '\n## Original FILL '+ordinal+' — read-only forensic audit\n'
      +'\n| Check | Result |\n|---|---|\n'
      +'| Verdict | '+audit.state+' |\n'
      +'| Independent replay checks passed | '+audit.checksPassed+' / 10 |\n'
      +'| Next pending forensic check | '+(audit.nextRequiredCheck??'NONE')+' |\n'
      +'| Evidence reason | '+audit.forensicReasonCode+' |\n'
      +'| Missing evidence groups | '+audit.missingEvidenceCount+' |\n'
      +'| Evidence defects | '+audit.defectCount+' |\n'
      +(audit.adapterFamily?'| Original market adapter | '+audit.adapterFamily+' |\n':'')
      +'| Phase 9 / Directa LIVE | DISABLED |\n',{encoding:'utf8'});
  }

}catch{
  // Strict finite vocabulary; even arbitrary HTTP statuses are never echoed.
  const allow=/^(?:SCOPE|OIDC_HTTP_REQUEST|CYCLE_TRANSPORT|CYCLE_REPORT_VALIDATION|READ_ONLY_FORENSIC|CYCLE_HTTP_(?:200|400|401|403|404|408|409|429|500|502|503|504))$/;
  console.error('ONE_GLOBAL_PRIVATE_CLOUD_CYCLE_NOT_CONFIRMED');
  console.error('ONE_GLOBAL_SAFE_FAILURE_STAGE='+(allow.test(failureStage)?failureStage:'OTHER'));
  process.exitCode=1;
}
