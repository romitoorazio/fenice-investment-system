/** Trusted Actions runner sends a short-lived identity, never vendor or owner keys. */
import {SIGNAL_CYCLE_AUDIENCE} from '../lib/trading/one-global-cloud-workflow-auth.mjs';
try{
  if(process.env.GITHUB_REPOSITORY!=='romitoorazio/fenice-investment-system'
    ||process.env.GITHUB_REF!=='refs/heads/main')throw Error('SCOPE');
  const identityUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if(identityUrl.protocol!=='https:'||!identityUrl.hostname.endsWith('.actions.githubusercontent.com'))
    throw Error('OIDC_ORIGIN');
  identityUrl.searchParams.set('audience',SIGNAL_CYCLE_AUDIENCE);
  const identity=await fetch(identityUrl,{redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
  if(!identity.ok)throw Error('OIDC');
  const {value}=await identity.json();
  if(typeof value!=='string'||value.length<100||value.length>16000)throw Error('OIDC');
  const response=await fetch(SIGNAL_CYCLE_AUDIENCE,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(70000),headers:{Authorization:'Bearer '+value,
      'Content-Type':'application/json'},body:JSON.stringify({action:'RESEARCH_SIGNAL_CYCLE'})});
  const text=await response.text();if(text.length>10000)throw Error('RESPONSE_SIZE');
  const report=JSON.parse(text);
  if(!response.ok||report.liveTradingAllowed!==false||report.brokerConnectivityAllowed!==false
    ||report.paperFillsCreated!==0||report.certifiedTrades!==0||report.phase9Credit!==0
    ||report.originalJournalVerified!==true||report.originalEventsPreserved!==true)
    throw Error('CYCLE_BLOCKED');
  // Explicit allowlist only: never dump an upstream response to public logs.
  console.log(JSON.stringify({state:report.state,originalJournalVerified:true,
    originalEventsPreserved:true,journalEventCount:report.journalEventCount,
    pendingSignalCount:report.pendingSignalCount,newSignals:report.newSignals,
    sourcePairsAttempted:report.sourcePairsAttempted,sourceEvidenceArchived:report.sourceEvidenceArchived,
    paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
    brokerConnectivityAllowed:false,liveTradingAllowed:false}));
}catch{
  console.error('ONE_GLOBAL_PRIVATE_CLOUD_CYCLE_NOT_CONFIRMED');process.exitCode=1;
}
