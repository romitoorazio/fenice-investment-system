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
  // Follow-up is READ ONLY and deliberately independent: a forensic outage
  // cannot reverse/duplicate the already finished atomic PAPER cycle.
  try{
    const auditResponse=await fetch(SIGNAL_CYCLE_AUDIENCE,{method:'POST',redirect:'error',
      signal:AbortSignal.timeout(52000),headers:{Authorization:'Bearer '+value,
        'Content-Type':'application/json'},body:JSON.stringify({action:'AUDIT_FIRST_FILL_READ_ONLY'})});
    if(!auditResponse.ok)throw Error('FORENSIC_UNAVAILABLE');
    const auditText=await auditResponse.text();if(auditText.length>2500)throw Error('FORENSIC_OVERSIZE');
    const audit=JSON.parse(auditText);
    const states=['NO_ORIGINAL_FILL','FILL_NOT_YET_VERIFIABLE',
      'FILL_INVALID','FILL_RIGOROUS_REPLAY_VERIFIED'];
    const safeMissing=new Set([
      'NONE','NO_ORIGINAL_FILL','FORENSIC_INTEGRITY_DEFECT',
      'PRIVATE_EVIDENCE_GAP_UNCLASSIFIED',
      'PRIVATE_READ_ONLY_EVIDENCE_ACCESS_REQUIRED','ORIGINAL_JOURNAL_REQUIRED',
      'PRIVATE_EVIDENCE_READ_UNAVAILABLE','PRIVATE_EVIDENCE_OBJECT_MISSING',
      'PRIVATE_EVIDENCE_ORIGIN_METADATA_REQUIRED','PRIVATE_EVIDENCE_ORIGIN_METADATA_INVALID',
      'PRIVATE_EVIDENCE_ORIGINAL_READ_INVALID',
      'FIRST_FILL_MARKET_FORENSIC_ADAPTER_NOT_REVIEWED',
      'ORIGINAL_CBOE_FILE_DISCOVERY_REQUIRED',
      'ORIGINAL_JOURNAL_CHANGED_DURING_READ_ONLY_AUDIT',
      'ORIGINAL_STORAGE_OBJECT_TIMESTAMPS_REQUIRED',
      'SETTLEMENT_ARCHIVE_PRECOMMIT_TIMESTAMP_NOT_PROVEN',
      'PRIVATE_FORENSIC_CHECK_NOT_COMPLETED',
    ]);
    const safeChecks=new Set([
      'ORIGINAL_HASH_CHAIN_AND_ACCOUNT_REPLAY',
      'ORIGINAL_SETTLEMENT_ARCHIVE_AND_RECEIPTS_BOUND_TO_FILL',
      'ORIGINAL_DOCUMENT_BYTES_CONSENT_RIGHTS_MAPPING_AND_EXACT_SESSION',
      'BOTH_ORIGINAL_VENUE_FILES_REPARSED_EXACTLY',
      'ARCHIVED_OFFICIAL_USAGE_POLICIES_CALENDAR_AND_DISCOVERY',
      'PROSPECTIVE_SIGNAL_RECOMPUTED_FROM_ORIGINAL_PRIOR_SESSION_BYTES',
      'EXACT_FILL_EVENT_QUANTITY_FEE_BALANCE_AND_HASH_REPRODUCED',
      'ONE_FILL_FOR_SIGNAL_AND_SINGLE_OPEN_POSITION',
      'ORIGINAL_JOURNAL_UNCHANGED_DURING_AUDIT',
      'ORIGINAL_STORAGE_TIMESTAMPS_PRESERVE_PROSPECTIVE_EVIDENCE',
    ]);
    if(!states.includes(audit.state)
      ||audit.mode!=='ONE_GLOBAL_FIRST_FILL_FORENSIC_SAFE_STATUS'
      ||typeof audit.firstFillForensicallyVerified!=='boolean'
      ||audit.firstFillForensicallyVerified!==(audit.state==='FILL_RIGOROUS_REPLAY_VERIFIED')
      ||!Number.isSafeInteger(audit.checksPassed)||audit.checksPassed<0||audit.checksPassed>10
      ||typeof audit.originalJournalReplayed!=='boolean'
      ||!Number.isSafeInteger(audit.missingEvidenceCount)||audit.missingEvidenceCount<0
      ||!Number.isSafeInteger(audit.defectCount)||audit.defectCount<0
      ||!safeMissing.has(audit.forensicReasonCode)
      ||audit.nextRequiredCheck!==null&&!safeChecks.has(audit.nextRequiredCheck)
      ||audit.journalMutationAllowed!==false||audit.paperFillsCreated!==0
      ||audit.certifiedTrades!==0||audit.phase9Credit!==0
      ||audit.brokerConnectivityAllowed!==false||audit.liveTradingAllowed!==false)
      throw Error('FORENSIC_STATUS_NOT_VERIFIED');
    console.log('ONE_GLOBAL_FIRST_FILL_FORENSIC='+audit.state
      +' REASON='+audit.forensicReasonCode
      +' CHECKS='+audit.checksPassed+'/10');
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '\n## First original FILL — read-only forensic audit\n'
      +'\n| Check | Result |\n|---|---|\n'
      +'| Verdict | '+audit.state+' |\n'
      +'| Independent replay checks passed | '+audit.checksPassed+' / 10 |\n'
      +'| Next pending forensic check | '+(audit.nextRequiredCheck??'NONE')+' |\n'
      +'| First safe evidence reason | '+audit.forensicReasonCode+' |\n'
      +'| Missing evidence groups | '+audit.missingEvidenceCount+' |\n'
      +'| Evidence defects | '+audit.defectCount+' |\n'
      +'| Phase 9 / Directa LIVE | DISABLED |\n',
      {encoding:'utf8'});
  }catch{
    // Safe warning only: NEVER echo the private endpoint body or its error.
    console.log('ONE_GLOBAL_FIRST_FILL_FORENSIC=CHECK_NOT_CONFIRMED');
  }

}catch{
  console.error('ONE_GLOBAL_PRIVATE_CLOUD_CYCLE_NOT_CONFIRMED');process.exitCode=1;
}
