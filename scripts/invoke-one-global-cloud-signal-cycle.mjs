/** Trusted Actions runner sends a short-lived identity, never vendor or owner keys. */
import {SIGNAL_CYCLE_AUDIENCE} from '../lib/trading/one-global-cloud-workflow-auth.mjs';
import {oneGlobalActionsCycleSummary} from '../lib/trading/one-global-cloud-cycle-report.mjs';
import {appendFileSync} from 'node:fs';
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
  if(!response.ok)throw Error('CYCLE_BLOCKED');
  // Explicit allowlist only: never dump an upstream response to public logs.
  const visible=oneGlobalActionsCycleSummary(report);
  console.log(JSON.stringify(visible.report));
  console.log('ONE_GLOBAL_PAPER_OUTCOME='+visible.status);
  console.log(visible.annotation);
  if(visible.euAnnotation)console.log(visible.euAnnotation);
  // This summary is attached to the job run, not just buried in raw logs.
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,visible.markdown,{encoding:'utf8'});
}catch{
  console.error('ONE_GLOBAL_PRIVATE_CLOUD_CYCLE_NOT_CONFIRMED');process.exitCode=1;
}
