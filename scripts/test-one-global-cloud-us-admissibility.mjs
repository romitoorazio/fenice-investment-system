/** SYNTHETIC tests: no network, broker, private Blob, real rights or FILL. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {inspectOneGlobalUsAdmission} from '../lib/trading/one-global-cloud-us-admissibility.mjs';
import {publicOneGlobalCloudCycleReport} from '../lib/trading/one-global-cloud-cycle-report.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function doc(kind,body,providerId){
  const bytes=Buffer.from(typeof body==='string'?body:JSON.stringify(body));
  return {kind,sha256:sha(bytes),bodyBase64:bytes.toString('base64'),...(providerId?{providerId}:{})};
}
const approved='2026-11-12T20:00:00.000Z';
const reference='2026-11-12T22:00:00.000Z';
const authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,approvedForVirtualSimulation:true,
  approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},
  executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,strategyPerformanceCertified:false,
  approvedAt:approved,expiresAt:'2026-12-01T00:00:00.000Z'};
const recorded=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),
  nowIso:reference,signal:{signalId:'synthetic-us-aapl-prospective',
    key:'XNAS:AAPL',mic:'XNAS',side:'BUY',currency:'USD',decisionAt:reference,
    referenceSessionDate:'2026-11-12',referenceCloseAt:'2026-11-12T21:00:00.000Z',
    referencePublishedAt:'2026-11-12T21:35:00.000Z',
    sourceSnapshotHash:'f'.repeat(64),maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
const originalConsent=doc('ORIGINAL_OWNER_PAPER_CONSENT',authority);
const sourceEvidence=[
  doc('PROVIDER_UPSTREAM_PROVENANCE','SYNTHETIC TEST ONLY independent origin one'),
  doc('PROVIDER_UPSTREAM_PROVENANCE','SYNTHETIC TEST ONLY independent origin two'),
];
const usageDocs=[
  doc('ORIGINAL_PROVIDER_USAGE_RIGHTS','SYNTHETIC TEST ONLY approved user scope alpha','alpha-vantage'),
  doc('ORIGINAL_PROVIDER_USAGE_RIGHTS','SYNTHETIC TEST ONLY approved user scope alpaca','alpaca-sip'),
];
const calendar=doc('ORIGINAL_EXCHANGE_SESSION','SYNTHETIC TEST ONLY exact Nasdaq trading session');
const reviewedAt='2026-11-12T22:01:00.000Z';
const sources=['alpha-vantage','alpaca-sip'].map((providerId,i)=>({
  providerId,key:'XNAS:AAPL',mic:'XNAS',currency:'USD',symbol:'AAPL',
  sourceFamily:i?'alpaca-sip-historical':'alpha-vantage-daily',independenceEvidenceSha256:sourceEvidence[i].sha256,
  reviewedByOwner:true,reviewedAt,
}));
const rights=['alpha-vantage','alpaca-sip'].map((providerId,i)=>({
  providerId,mic:'XNAS',currency:'USD',evidenceSha256:usageDocs[i].sha256,
  usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedUseAllowed:true,
  validUntil:'2026-12-01T00:00:00.000Z',reviewedByOwner:true,reviewedAt,
}));
const context={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority,
  authorityEvidenceSha256:originalConsent.sha256,
  documents:[originalConsent,...sourceEvidence,...usageDocs,calendar],
  markets:[{key:'XNAS:AAPL',mic:'XNAS',currency:'USD',sources,ownerReviewedRights:rights}],
  sessions:[{mic:'XNAS',sessionDate:'2026-11-13',sessionOpenedAt:'2026-11-13T14:30:00.000Z',
    sessionClosedAt:'2026-11-13T21:00:00.000Z',evidenceSha256:calendar.sha256,
    reviewedByOwner:true,reviewedAt}],
};
const invoke=(ledger,originals,nowIso='2026-11-12T22:30:00.000Z')=>inspectOneGlobalUsAdmission({ledger,context:originals,nowIso});
assert.equal(invoke(recorded,null).state,'US_ORIGINAL_CONTEXT_NOT_CONNECTED');
const empty=invoke(newOneGlobalEodPaperLedger(),context);
assert.equal(empty.state,'US_NO_PENDING_PROSPECTIVE_SIGNAL');
assert.equal(empty.configuredUsMarketMappings,1);
assert.equal(empty.originalUsUsageDocuments,2);
assert.equal(empty.sourceRightsEvidenceValidated,false);
const missing=invoke(recorded,{...context,markets:[]});
assert.equal(missing.state,'US_ADMISSION_BLOCKED');
assert.equal(missing.blocker,'CLOUD_SETTLEMENT_OWNER_REVIEWED_MARKET_MAPPING_MISSING');
assert.equal(missing.sourceRightsEvidenceValidated,false);
const revoked=structuredClone(context);
revoked.markets[0].ownerReviewedRights[1].automatedUseAllowed=false;
const noRights=invoke(recorded,revoked);
assert.equal(noRights.state,'US_ADMISSION_BLOCKED');
assert.equal(noRights.blocker,'CLOUD_SETTLEMENT_ORIGINAL_PROVIDER_RIGHTS_MISSING_OR_EXPIRED');
assert.equal(noRights.exchangeSessionEvidenceValidated,false);
const waiting=invoke(recorded,context);
assert.equal(waiting.state,'US_NEXT_SESSION_NOT_COMPLETED');
assert.equal(waiting.sourceRightsEvidenceValidated,true);
assert.equal(waiting.independentUpstreamEvidenceValidated,true);
assert.equal(waiting.exchangeSessionEvidenceValidated,true);
assert.equal(waiting.paperFillsCreated,0);
const ready=invoke(recorded,context,'2026-11-13T22:00:00.000Z');
assert.equal(ready.state,'US_CONTEXT_READY_FOR_EXACT_DAILY_RECEIPTS');
assert.equal(ready.paperFillsCreated,0,'admissible context is NOT an original PAPER fill');
const expired=invoke(recorded,context,'2026-11-16T21:00:00.000Z');
assert.equal(expired.state,'US_SETTLEMENT_WINDOW_EXPIRED');
assert.equal(expired.paperFillsCreated,0);
const tampered=structuredClone(context);tampered.documents[0].bodyBase64=Buffer.from('FORGED').toString('base64');
assert.equal(invoke(recorded,tampered).state,'US_ORIGINAL_CONSENT_OR_DOCUMENTS_INVALID');
const exposed=JSON.stringify(waiting);
assert.doesNotMatch(exposed,/bodyBase64|sourceSnapshotHash|referenceCloseAt|SYNTHETIC TEST ONLY|lastHash/);
assert.equal(recorded.events.length,1,'audit must not change original journal');
const report={state:'ORIGINAL_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW',originalJournalVerified:true,originalEventsPreserved:true,
  journalEventCount:3,pendingSignalCount:1,virtualFillCount:0,paperFillsCreated:0,newSignals:0,sourcePairsAttempted:0,
  settlementState:'SETTLEMENT_BLOCKED',settlementSourceRequests:0,
  settlementBlockers:['CLOUD_SETTLEMENT_OWNER_REVIEWED_MARKET_MAPPING_MISSING'],sourceOutcomes:[],
  originalSettlementContextPresent:true,ownerPaperAuthorityValidated:true,
  sourceRightsEvidenceValidated:false,upstreamEvidenceValidated:false,exchangeSessionEvidenceValidated:false,
  sourceEvidenceArchived:false,providerConfiguration:{alphaVantageKeyPresent:true,
    eodhdPersonalKeyPresent:false,twelveDataKeyPresent:false,alpacaSipKeyPresent:true},
  certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
const publicWaiting=publicOneGlobalCloudCycleReport({...report,usAdmissibility:{...waiting,secret:'SECRET'}});
assert.equal(publicWaiting.usAdmissibility.state,'US_NEXT_SESSION_NOT_COMPLETED');
assert.equal(publicWaiting.usAdmissibility.sourceRightsEvidenceValidated,true);
assert.doesNotMatch(JSON.stringify(publicWaiting),/SECRET|privateOwner|closePrice/);
for(const mutant of [{sourceRightsEvidenceValidated:false},{configuredUsMarketMappings:99},
  {state:'US_FAKE_FILL'}, {blocker:'raw price = SECRET'},{paperFillsCreated:1},{liveTradingAllowed:true}])
  assert.throws(()=>publicOneGlobalCloudCycleReport({...report,usAdmissibility:{...waiting,...mutant}}),/NOT_VERIFIED/);
console.log('PASS ONE GLOBAL USA admission: original consent/market source rights/next session audited; missing/revoked/expired inputs fail closed; no network, mutable journal, retroactive FILL or Directa.');
