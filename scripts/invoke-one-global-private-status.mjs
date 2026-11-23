/** GitHub Actions OIDC read-only probe: no vendor, owner secret, journal or broker in CI. */
import {SIGNAL_CYCLE_AUDIENCE} from '../lib/trading/one-global-cloud-workflow-auth.mjs';
import {appendFileSync} from 'node:fs';

const EXPECTED_KEYS=[
  'brokerConnectivityAllowed','elapsedRegularWindowCount','journalEventCount',
  'journalMutationAllowed','liveTradingAllowed','originalJournalValid',
  'pendingSignalCount','state','virtualBuyCount','virtualSellCount',
  'withinRegularWindowCount',
].sort().join(',');
const count=x=>Number.isSafeInteger(x)&&x>=0;
let phase='SETUP';
try{
  if(process.env.GITHUB_REPOSITORY!=='romitoorazio/fenice-investment-system'
    ||process.env.GITHUB_REF!=='refs/heads/main')throw Error('UNTRUSTED_SCOPE');
  const idUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if(idUrl.protocol!=='https:'||!idUrl.hostname.endsWith('.actions.githubusercontent.com'))
    throw Error('UNTRUSTED_IDENTITY_ORIGIN');
  idUrl.searchParams.set('audience',SIGNAL_CYCLE_AUDIENCE);
  phase='OIDC';
  const identity=await fetch(idUrl,{redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
  if(!identity.ok)throw Error('OIDC_NOT_AVAILABLE');
  const {value}=await identity.json();
  if(typeof value!=='string'||value.length<100||value.length>16000)
    throw Error('OIDC_INVALID');
  phase='READ';
  const response=await fetch(SIGNAL_CYCLE_AUDIENCE,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(30000),
    headers:{Authorization:'Bearer '+value,'Content-Type':'application/json'},
    body:JSON.stringify({action:'AUDIT_JOURNAL_STATUS_READ_ONLY'})});
  if(!response.ok)throw Error('PRIVATE_READER_REJECTED');
  const body=await response.text();
  if(body.length>2500)throw Error('REPORT_TOO_LARGE');
  const report=JSON.parse(body);
  if(!report||Array.isArray(report)
    ||Object.keys(report).sort().join(',')!==EXPECTED_KEYS
    ||report.journalMutationAllowed!==false
    ||report.brokerConnectivityAllowed!==false
    ||report.liveTradingAllowed!==false
    ||typeof report.state!=='string'||typeof report.originalJournalValid!=='boolean')
    throw Error('REPORT_NOT_SANITIZED');
  const keys=['journalEventCount','pendingSignalCount','virtualBuyCount',
    'virtualSellCount','withinRegularWindowCount','elapsedRegularWindowCount'];
  if(report.originalJournalValid){
    if(report.state!=='ORIGINAL_JOURNAL_VALID_PRIVATE'
      ||keys.some(k=>!count(report[k])))throw Error('REPORT_NOT_VALID');
  }else if(report.state==='ORIGINAL_JOURNAL_VALID_PRIVATE'
    ||keys.some(k=>report[k]!==null))throw Error('INVALID_JOURNAL_MUST_NOT_EXPOSE_COUNTS');
  const summary=JSON.stringify(report);
  // The fixed report is validated against exact keys, never echo OIDC, raw
  // response, original snapshot, upstream bytes, price, symbol or provider.
  console.log('ONE_GLOBAL_PRIVATE_JOURNAL_READ_ONLY='+summary);
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '\n## ONE GLOBAL private journal — OIDC read-only verification\n'
      +'\n- State: '+report.state
      +'\n- Verified replay: '+report.originalJournalValid
      +'\n- Pending signals: '+(report.pendingSignalCount??'NOT_CONFIRMED')
      +'\n- Original journal mutation: FORBIDDEN\n'
      +'\n- LIVE broker: DISABLED\n',{encoding:'utf8'});
}catch{
  // No URLs, response text, JWTs, stack traces or exception bodies in logs.
  console.error('ONE_GLOBAL_PRIVATE_JOURNAL_READ_ONLY_NOT_CONFIRMED PHASE='+phase);
  process.exitCode=1;
}
