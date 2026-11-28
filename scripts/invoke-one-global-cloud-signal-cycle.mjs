/** Trusted Actions runner sends a short-lived identity, never vendor or owner keys. */
import {SIGNAL_CYCLE_AUDIENCE} from '../lib/trading/one-global-cloud-workflow-auth.mjs';
import {oneGlobalActionsCycleSummary,validateOneGlobalWorkflowForensic} from '../lib/trading/one-global-cloud-cycle-report.mjs';
import {validateR2PublicCycleSummary,validateR2EuPreflightSummary,validateR2UsPreflightSummary} from '../lib/trading/one-global-r2-paper-control.mjs';
import {appendFileSync} from 'node:fs';
// Public Actions logs may contain ONLY a fixed phase plus a bounded HTTP
// status category. No response body, JWT, provider error, private URL or hash.
let failurePhase='START',failureStatus=0;
const safeTransportFailure=()=>(
  failurePhase==='OIDC_REQUEST'?'OIDC_REQUEST':
  failurePhase==='OIDC_RESPONSE'?'OIDC_RESPONSE':
  failurePhase==='CYCLE_REQUEST'?'CYCLE_REQUEST':
  failurePhase==='CYCLE_RESPONSE'?'CYCLE_RESPONSE':
  failurePhase==='CYCLE_REPORT'?'CYCLE_REPORT':
  failurePhase==='AUDIT'?'AUDIT':'SETUP')+
  '_'+([400,401,403,404,408,409,422,429,500,502,503,504].includes(failureStatus)
    ?'HTTP_'+failureStatus:failureStatus?'HTTP_OTHER':'NO_HTTP_RESPONSE');
const backupOnly=process.env.FENICE_R2_BACKUP_ONLY==='true';
const preflightOnly=process.env.FENICE_R2_EU_PREFLIGHT_ONLY==='true';
const usPreflightOnly=process.env.FENICE_R2_US_PREFLIGHT_ONLY==='true';
try{
  if(process.env.GITHUB_REPOSITORY!=='romitoorazio/fenice-investment-system'
    ||process.env.GITHUB_REF!=='refs/heads/main')throw Error('SCOPE');
  const identityUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if(identityUrl.protocol!=='https:'||!identityUrl.hostname.endsWith('.actions.githubusercontent.com'))
    throw Error('OIDC_ORIGIN');
  identityUrl.searchParams.set('audience',SIGNAL_CYCLE_AUDIENCE);
  failurePhase='OIDC_REQUEST';
  const identity=await fetch(identityUrl,{redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
  failurePhase='OIDC_RESPONSE';failureStatus=identity.status;
  if(!identity.ok)throw Error('OIDC');
  const {value}=await identity.json();
  if(typeof value!=='string'||value.length<100||value.length>16000)throw Error('OIDC');
  failurePhase='CYCLE_REQUEST';failureStatus=0;
  const r2=process.env.FENICE_R2_PROSPECTIVE_ENABLED==='true';
  const response=await fetch(SIGNAL_CYCLE_AUDIENCE,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(70000),headers:{Authorization:'Bearer '+value,
      'Content-Type':'application/json'},body:JSON.stringify({action:usPreflightOnly?'R2_US_SOURCE_PREFLIGHT':preflightOnly?'R2_EU_SOURCE_PREFLIGHT':backupOnly?'R2_PROSPECTIVE_BACKUP':r2?'R2_PROSPECTIVE_PAPER_CYCLE':'RESEARCH_SIGNAL_CYCLE'})});
  failurePhase='CYCLE_RESPONSE';failureStatus=response.status;
  const text=await response.text();if(text.length>10000)throw Error('RESPONSE_SIZE');
  const report=JSON.parse(text);failurePhase='CYCLE_REPORT';
  if(!response.ok)throw Error('CYCLE_BLOCKED');
  // Explicit allowlist only: never dump an upstream response to public logs.
  if(usPreflightOnly){
    const visible=validateR2UsPreflightSummary(report);
    console.log(JSON.stringify(visible));
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n## R2 USA access diagnostic (not rights or trading certification)\n\n'+JSON.stringify(visible)+'\n');
    if(visible.state==='US_ACCESS_DIAGNOSTIC_COMPLETED'&&visible.symbols.some(x=>!x.numericalAgreement))
      console.log('::warning title=FENICE USA source preflight::SOURCE_PAIR_INCOMPLETE_OR_DIVERGENT');
  }else if(preflightOnly){
    const visible=validateR2EuPreflightSummary(report);
    console.log(JSON.stringify(visible));
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n## R2 EU weekend qualification\n\n'+Object.entries(visible).map(([k,v])=>'- '+k+': '+v).join('\n')+'\n');
    if(visible.state!=='EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED'&&visible.state!=='R2_PREFLIGHT_OUTSIDE_WEEKEND')
      console.log('::warning title=FENICE EU source preflight::'+visible.state);
  }else if(backupOnly){
    if(report.state!=='R2_AUTOMATIC_BACKUP_VERIFIED'||report.paperFillsCreated!==0
      ||report.certifiedTrades!==0||report.phase9Credit!==0
      ||report.brokerConnectivityAllowed!==false||report.liveTradingAllowed!==false)throw Error('BACKUP_NOT_VERIFIED');
    console.log('R2_AUTOMATIC_BACKUP_VERIFIED');
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n## R2 encrypted backup\n\nVERIFIED — isolated readback and replay.\n');
  }else if(r2){
    const visible=validateR2PublicCycleSummary(report);
    console.log(JSON.stringify(visible));
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## R2 prospective PAPER (uncertified)\n\n'+Object.entries(visible).map(([k,v])=>'- '+k+': '+v).join('\n')+'\n');
  }else{
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
  const fillCount=visible.report.virtualFillCount;
  // An absent or unknown policy keeps the previous full recheck behaviour.
  const recheck=process.env.FENICE_RECHECK_HISTORICAL_FILLS!=='false';
  const targets=[];
  if(recheck){
    if(fillCount>=1)targets.push(['FIRST',1]);
    if(fillCount>=2)targets.push(['SECOND',2]);
    if(fillCount>2)targets.push(['LATEST',fillCount]);
  }else if(visible.report.paperFillsCreated===1){
    // The new FILL must still be independently replayed immediately. Older
    // ordinals are preserved and rechecked by the daily or explicit audit.
    if(fillCount===1)targets.push(['FIRST',1]);
    else if(fillCount===2)targets.push(['SECOND',2]);
    else if(fillCount>2)targets.push(['LATEST',fillCount]);
  }else{
    console.log('ONE_GLOBAL_FILL_REPLAY=SKIPPED_NO_NEW_FILL');
  }
  failurePhase='AUDIT';failureStatus=0;
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

  }
}catch{
  if(usPreflightOnly){
    console.log('::warning title=FENICE USA source preflight::R2_US_PREFLIGHT_NOT_CONFIRMED '+safeTransportFailure());
  }else if(preflightOnly){
    console.log('::warning title=FENICE EU source preflight::R2_EU_PREFLIGHT_NOT_CONFIRMED '+safeTransportFailure());
  }else if(backupOnly){
    // A secondary storage problem must not change a completed PAPER outcome.
    console.log('::warning title=FENICE R2 backup::R2_AUTOMATIC_BACKUP_NOT_CONFIRMED '+safeTransportFailure());
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n## R2 encrypted backup\n\nNOT CONFIRMED — retry at next authorized cycle.\n');
  }else{
  console.error('ONE_GLOBAL_PRIVATE_CLOUD_CYCLE_NOT_CONFIRMED');
  console.error('ONE_GLOBAL_PRIVATE_CLOUD_FAILURE_CLASS='+safeTransportFailure());
  process.exitCode=1;
  }
}
