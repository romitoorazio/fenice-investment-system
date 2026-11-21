import assert from 'node:assert/strict';
import {publicOneGlobalCloudCycleReport as publicReport,oneGlobalActionsCycleSummary,
  publicOneGlobalFirstFillForensicSummary as forensicSummary,
  publicOneGlobalSecondFillForensicSummary as secondForensicSummary,publicOneGlobalLatestFillForensicSummary as latestSummary,
  validateOneGlobalWorkflowForensic} from '../lib/trading/one-global-cloud-cycle-report.mjs';
import {SIGNAL_CYCLE_AUDIENCE} from '../lib/trading/one-global-cloud-workflow-auth.mjs';
import {ONE_GLOBAL_MILAN_INSTRUMENTS} from '../lib/market/one-global-eu-delayed-eod.mjs';
assert.equal(Object.keys(ONE_GLOBAL_MILAN_INSTRUMENTS).length,6,
  'Report cap must track the reviewed original Milan PAPER identity count');
const fixture={state:'ORIGINAL_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW',originalJournalVerified:true,originalEventsPreserved:true,
  journalEventCount:3,pendingSignalCount:1,virtualFillCount:0,paperFillsCreated:0,newSignals:0,sourcePairsAttempted:0,
  settlementState:'SETTLEMENT_BLOCKED',settlementSourceRequests:0,
  settlementBlockers:['CLOUD_SETTLEMENT_ORIGINAL_CONTEXT_NOT_CONNECTED'],sourceOutcomes:[],
  originalSettlementContextPresent:false,ownerPaperAuthorityValidated:false,sourceRightsEvidenceValidated:false,
  upstreamEvidenceValidated:false,exchangeSessionEvidenceValidated:false,sourceEvidenceArchived:false,
  providerConfiguration:{alphaVantageKeyPresent:true,eodhdPersonalKeyPresent:false,twelveDataKeyPresent:false},
  certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
const safe=publicReport({...fixture,rawClose:123,token:'SECRET',privateJournal:{},lastHash:'PRIVATE'});
assert.equal(safe.virtualFillCount,0);assert.equal(safe.journalEventCount,3);
assert.doesNotMatch(JSON.stringify(safe),/rawClose|SECRET|privateJournal|lastHash/);
for(const delta of [{paperFillsCreated:null},{virtualFillCount:null},{paperFillsCreated:1},{virtualFillCount:-1},
  {journalEventCount:2},{journalEventCount:3.5},{originalEventsPreserved:false},{liveTradingAllowed:true},
  {certifiedTrades:1},{state:'raw price = secret'},{settlementBlockers:['apikey=SECRET']},
  {sourceOutcomes:[{providerId:'fake',state:'EXACT_DAILY_ROW_RECEIVED'}]},
  {providerConfiguration:{alphaVantageKeyPresent:'SECRET'}}])assert.throws(()=>publicReport({...fixture,...delta}),/NOT_VERIFIED/);
const filled={...fixture,state:'STRICT_PAPER_FILL_COMMITTED_PRIVATE',settlementState:'STRICT_PAPER_FILL_COMMITTED_PRIVATE',
  journalEventCount:4,pendingSignalCount:0,virtualFillCount:1,paperFillsCreated:1,originalSettlementContextPresent:true,
  ownerPaperAuthorityValidated:true,sourceRightsEvidenceValidated:true,upstreamEvidenceValidated:true,
  exchangeSessionEvidenceValidated:true,sourceEvidenceArchived:true,settlementSourceRequests:2,settlementBlockers:[]};
assert.equal(publicReport(filled).paperFillsCreated,1,'never force a real confirmed fill count to zero');
for(const gate of ['ownerPaperAuthorityValidated','sourceRightsEvidenceValidated','upstreamEvidenceValidated',
  'exchangeSessionEvidenceValidated','sourceEvidenceArchived'])assert.throws(()=>publicReport({...filled,[gate]:false}),/NOT_VERIFIED/);
console.log('PASS cloud public report: exact real totals, positive FILL only with all gates, ambiguous writes rejected, private data stripped.');

const sourceAccessCheck={state:'TWO_DAILY_ROWS_AGREE_REVIEW_REQUIRED',symbol:'AAPL',sessionDate:'2026-11-13',
  alphaState:'EXACT_DAILY_ROW_RECEIVED',alpacaState:'EXACT_DAILY_ROW_RECEIVED',eodhdState:'NOT_REQUESTED',twoDailyRowsReceived:true,
  closesAgree:true,rawReceiptArchiveConfirmed:true,originalDocumentsArchived:2,originalDocumentsConnected:true,
  rightsApproved:false,independenceCertified:false,paperFillsCreated:0,liveTradingAllowed:false};
const qualified=publicReport({...fixture,providerConfiguration:{...fixture.providerConfiguration,alpacaSipKeyPresent:true},
 sourceAccessCheck:{...sourceAccessCheck,rawClose:123,rawBody:'SECRET',payloadSha256:'PRIVATE'}});
assert.equal(qualified.sourceAccessCheck.closesAgree,true);assert.equal(qualified.providerConfiguration.alpacaSipKeyPresent,true);
assert.doesNotMatch(JSON.stringify(qualified),/SECRET|rawClose|rawBody|PRIVATE/);
for(const delta of [{rightsApproved:true},{independenceCertified:true},{paperFillsCreated:1},{alpacaState:'secret key'},
  {originalDocumentsArchived:3},{originalDocumentsConnected:'SECRET'},{twoDailyRowsReceived:false}])
  assert.throws(()=>publicReport({...fixture,sourceAccessCheck:{...sourceAccessCheck,...delta}}),/NOT_VERIFIED/);

const connected=publicReport({...fixture,sourceAccessCheck:{...sourceAccessCheck,
 originalDocumentConnectionState:'ORIGINAL_DOCUMENTS_CONNECTED',candidateContextBytes:12345}});
assert.equal(connected.sourceAccessCheck.originalDocumentConnectionState,'ORIGINAL_DOCUMENTS_CONNECTED');
for(const fields of [{originalDocumentConnectionState:'private exception = SECRET'},{candidateContextBytes:-1},{candidateContextBytes:'SECRET'}])
 assert.throws(()=>publicReport({...fixture,sourceAccessCheck:{...sourceAccessCheck,...fields}}),/NOT_VERIFIED/);

const reviewed=publicReport({...fixture,sourceAccessCheck:{...sourceAccessCheck,technicalReviewsConnected:2,
 alphaDocumentReview:'PRIVATE_SCOPE_TEXT_SUPPORTED',alpacaDocumentReview:'ACCOUNT_SCOPE_UNRESOLVED',
 technicalReviews:[{bodyBase64:'PRIVATE',reviewer:'PRIVATE'}]}});
assert.equal(reviewed.sourceAccessCheck.technicalReviewsConnected,2);assert.equal(reviewed.sourceAccessCheck.rightsApproved,false);
assert.doesNotMatch(JSON.stringify(reviewed),/bodyBase64|reviewer|technicalReviews"|PRIVATE"/);
for(const fields of [{technicalReviewsConnected:3},{technicalReviewsConnected:1,alphaDocumentReview:'SECRET',alpacaDocumentReview:'ACCOUNT_SCOPE_UNRESOLVED'},
 {technicalReviewsConnected:2,alphaDocumentReview:'PRIVATE_SCOPE_TEXT_SUPPORTED',alpacaDocumentReview:'APPROVED_FOR_DOCUMENTED_SCOPE'}])
 assert.throws(()=>publicReport({...fixture,sourceAccessCheck:{...sourceAccessCheck,...fields}}),/NOT_VERIFIED/);

const euSourceAccessCheck={state:'EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED',sessionDate:'2026-11-13',
 sourcePairsReceived:2,sourcePairsAgree:2,uptrendCandidates:2,rawArtifactsVerified:true,rightsEvidenceConnected:true,
 paperFillsCreated:0,certifiedTrades:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};
const euQualified=publicReport({...fixture,euSourceAccessCheck,
 sourceOutcomes:[{providerId:'euronext-mifir',state:'EXACT_DAILY_ROW_RECEIVED'},
  {providerId:'cboe-eu-mifir',state:'EXACT_DAILY_ROW_RECEIVED'}]});
assert.equal(euQualified.euSourceAccessCheck.rightsEvidenceConnected,true);
assert.deepEqual(euQualified.sourceOutcomes.map(x=>x.providerId),['euronext-mifir','cboe-eu-mifir']);
assert.doesNotMatch(JSON.stringify(euQualified),/rawArtifactsSha|payloadSha|price/);
const euBlocked=publicReport({...fixture,euSourceAccessCheck:{...euSourceAccessCheck,
 state:'EU_SOURCE_ACCESS_NOT_CONFIRMED',sourcePairsReceived:0,sourcePairsAgree:0,uptrendCandidates:0,
 rawArtifactsVerified:false,rightsEvidenceConnected:false,blocker:'EU_DELAYED_EOD_CBOE_DISCOVERY_JSON_INVALID'}});
assert.equal(euBlocked.euSourceAccessCheck.blocker,'EU_DELAYED_EOD_CBOE_DISCOVERY_JSON_INVALID');
const sixSourceSafe=publicReport({...fixture,euSourceAccessCheck:{...euSourceAccessCheck,
  sourcePairsReceived:6,sourcePairsAgree:5,uptrendCandidates:3,rawPayload:'PRIVATE_RAW'}});
assert.equal(sixSourceSafe.euSourceAccessCheck.sourcePairsReceived,6);
assert.equal(sixSourceSafe.euSourceAccessCheck.sourcePairsAgree,5);
assert.doesNotMatch(JSON.stringify(sixSourceSafe),/PRIVATE_RAW|rawPayload/);
for(const delta of [{sourcePairsReceived:7},{sourcePairsAgree:7},{uptrendCandidates:7},
  {sourcePairsAgree:2,sourcePairsReceived:1},{rightsEvidenceConnected:'SECRET'},
 {blocker:'private URL = SECRET'},{state:'EU_FAKE_PASS'}])
 assert.throws(()=>publicReport({...fixture,euSourceAccessCheck:{...euSourceAccessCheck,...delta}}),/NOT_VERIFIED/);


// GitHub Actions must never represent a blocked settlement as a completed FILL.
// Two independently eligible markets may legitimately request more than
// three receipts. The public report must remain valid without unbounding probes.
const multiMarketSafe=publicReport({...fixture,settlementSourceRequests:4});
assert.equal(multiMarketSafe.settlementSourceRequests,4);
assert.match(oneGlobalActionsCycleSummary({...fixture,settlementSourceRequests:4}).markdown,
  /Source requests attempted \\| 4/);
assert.throws(()=>publicReport({...fixture,settlementSourceRequests:10}),/NOT_VERIFIED/,
  'Never accept more than three source requests per journal event');
const annotatedBlock=oneGlobalActionsCycleSummary({...fixture,
  token:'SENSITIVE_TOKEN',rawClose:10.123456,privateOwnerConsent:'PRIVATE'});
assert.equal(annotatedBlock.status,'PAPER_BLOCKED');
assert.match(annotatedBlock.markdown,/PAPER OUTCOME: PAPER_BLOCKED/);
assert.match(annotatedBlock.markdown,/CLOUD_SETTLEMENT_ORIGINAL_CONTEXT_NOT_CONNECTED/);
assert.match(annotatedBlock.markdown,/New FILLs this cycle \\| 0/);
assert.match(annotatedBlock.annotation,/^::warning title=FENICE PAPER BLOCKED::/);
assert.doesNotMatch(JSON.stringify(annotatedBlock),/SENSITIVE_TOKEN|10\\.123456|privateOwnerConsent/);
const noFillRun=oneGlobalActionsCycleSummary({...fixture,pendingSignalCount:0,
  settlementState:'NO_PENDING_SIGNAL_TO_SETTLE',settlementBlockers:[]});
assert.equal(noFillRun.status,'NO_FILL');
assert.match(noFillRun.annotation,/^::notice title=FENICE PAPER NOT EXECUTED::/);
const confirmedRun=oneGlobalActionsCycleSummary(filled);
assert.equal(confirmedRun.status,'FILL_VERIFIED');
assert.match(confirmedRun.markdown,/New FILLs this cycle \\| 1/);
assert.match(confirmedRun.annotation,/^::notice title=FENICE PAPER FILL RECORDED::/);
assert.throws(()=>oneGlobalActionsCycleSummary({...fixture,settlementBlockers:['secret=TOKEN']}),/NOT_VERIFIED/);
console.log('PASS GitHub Actions PAPER outcome: visible blocked warning, NO_FILL and verified FILL mutually distinct; sanitized enumeration only.');


// The EU source/forward-SIGNAL path must remain visible independently of an
// expired older CBA settlement blocker. No prices, ISINs, raw receipts, keys,
// private journal body or unreviewed proof may enter Actions.
const euProspectiveBlocked={state:'EU_OFFICIAL_SOURCE_PAIR_UNAVAILABLE',
  newSignals:0,sourcePairsAttempted:2,canonicalSignalCommitted:false,
  sourceEvidenceArchived:false,paperFillsCreated:0,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,privateRawQuote:'PRIVATE_EU_PRICE',
  validatedCandidatePairs:0,agreedCandidatePairs:0,uptrendCandidatePairs:0,
  eligibleBuyCandidates:0,eligibleExitCandidates:0};
const euBlockedSummary=oneGlobalActionsCycleSummary({...fixture,euSignalCycle:euProspectiveBlocked});
assert.equal(euBlockedSummary.status,'PAPER_BLOCKED','Old settlement and EU research statuses are independent');
assert.equal(euBlockedSummary.report.euSignalCycle.state,'EU_OFFICIAL_SOURCE_PAIR_UNAVAILABLE');
assert.match(euBlockedSummary.markdown,/European signal research \| EU_OFFICIAL_SOURCE_PAIR_UNAVAILABLE/);
assert.match(euBlockedSummary.euAnnotation,/^::warning title=FENICE EU SIGNAL BLOCKED::/);
assert.doesNotMatch(JSON.stringify(euBlockedSummary),/PRIVATE_EU_PRICE|privateRawQuote/);

const euRejectedSummary=oneGlobalActionsCycleSummary({...fixture,euSignalCycle:{
  ...euProspectiveBlocked,validatedCandidatePairs:1,rejectedCandidatePairs:1,
  privateRejectionReason:'SECRET_VENDOR_RESPONSE',
}});
assert.equal(euRejectedSummary.report.euSignalCycle.rejectedCandidatePairs,1);
assert.equal(euRejectedSummary.report.euSignalCycle.validatedCandidatePairs,1);
assert.doesNotMatch(JSON.stringify(euRejectedSummary),/SECRET_VENDOR_RESPONSE|privateRejectionReason/);
for(const rejectedCandidatePairs of [-1,3,1.5,'1',NaN]){
  assert.throws(()=>publicReport({...fixture,euSignalCycle:{
    ...euProspectiveBlocked,rejectedCandidatePairs,
  }}),/NOT_VERIFIED/);
}
assert.throws(()=>publicReport({...fixture,euSignalCycle:{
  ...euProspectiveBlocked,validatedCandidatePairs:2,rejectedCandidatePairs:1,
}}),/NOT_VERIFIED/,'Rejected and accepted candidate totals cannot exceed attempted pairs');

// The sanitized Actions report must preserve the difference between an
// absent source pair, a divergent valid pair and a genuine no-signal day.
const divergentEu={...euProspectiveBlocked,state:'EU_DUAL_VENUE_CLOSE_DIVERGENCE',
  validatedCandidatePairs:1,agreedCandidatePairs:0,uptrendCandidatePairs:1};
const divergentSummary=oneGlobalActionsCycleSummary({...fixture,euSignalCycle:divergentEu});
assert.equal(divergentSummary.report.euSignalCycle.state,'EU_DUAL_VENUE_CLOSE_DIVERGENCE');
assert.equal(divergentSummary.report.euSignalCycle.agreedCandidatePairs,0);
assert.match(divergentSummary.euAnnotation,/Independent EU venue closes disagree/);
assert.equal(divergentSummary.report.paperFillsCreated,0);
assert.doesNotMatch(JSON.stringify(divergentSummary),/PRIVATE_EU_PRICE|privateRawQuote/);
for(const invalid of [
  {...divergentEu,agreedCandidatePairs:1},
  {...divergentEu,validatedCandidatePairs:0},
  {...divergentEu,eligibleBuyCandidates:1},
  {state:'EU_DUAL_VENUE_CLOSE_DIVERGENCE',sourcePairsAttempted:2,
   newSignals:0,canonicalSignalCommitted:false},
])assert.throws(()=>publicReport({...fixture,euSignalCycle:invalid}),/NOT_VERIFIED/);

const euProspectiveCommitted={...euProspectiveBlocked,state:'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE',
  newSignals:1,canonicalSignalCommitted:true,sourceEvidenceArchived:true,
  rightsAndNextSessionEvidenceConnected:true,validatedCandidatePairs:1,
  agreedCandidatePairs:1,uptrendCandidatePairs:1,eligibleBuyCandidates:1};
// A genuine six-candidate EUROPEAN prospective signal does not invalidate a
// technically successful OIDC cycle at the Actions report boundary.
const sixEuSignal={...euProspectiveCommitted,sourcePairsAttempted:6,
  validatedCandidatePairs:6,agreedCandidatePairs:5,uptrendCandidatePairs:3,
  eligibleBuyCandidates:2,eligibleExitCandidates:0,rejectedCandidatePairs:0};
const sixCommittedRun={...fixture,state:'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE',
  journalEventCount:4,pendingSignalCount:2,newSignals:1,sourcePairsAttempted:6,
  sourceEvidenceArchived:true,euSignalCycle:sixEuSignal};
const sixSummary=oneGlobalActionsCycleSummary(sixCommittedRun);
assert.equal(sixSummary.report.euSignalCycle.validatedCandidatePairs,6);
assert.equal(sixSummary.report.euSignalCycle.sourcePairsAttempted,6);
assert.equal(sixSummary.status,'PAPER_BLOCKED');
assert.doesNotMatch(JSON.stringify(sixSummary),/PRIVATE_RAW|rawPayload|SECRET/);
for(const change of [
  {sourcePairsAttempted:7},
  {euSignalCycle:{...sixEuSignal,sourcePairsAttempted:7}},
  {euSignalCycle:{...sixEuSignal,validatedCandidatePairs:7}},
])assert.throws(()=>publicReport({...sixCommittedRun,...change}),/NOT_VERIFIED/,
  'Seven EU PAPER candidates must still be rejected without a reviewed universe change');
const sixNeutral=oneGlobalActionsCycleSummary({...fixture,euSignalCycle:{
  ...euProspectiveBlocked,state:'EU_NO_DUAL_VENUE_UPTREND',sourcePairsAttempted:6,
  validatedCandidatePairs:6,agreedCandidatePairs:6,uptrendCandidatePairs:0,
  eligibleBuyCandidates:0,eligibleExitCandidates:0,rejectedCandidatePairs:0}});
assert.equal(sixNeutral.report.euSignalCycle.state,'EU_NO_DUAL_VENUE_UPTREND');
assert.equal(sixNeutral.status,'PAPER_BLOCKED');
const partialEu=oneGlobalActionsCycleSummary({...fixture,euSignalCycle:{
  ...euProspectiveBlocked,state:'EU_PARTIAL_SOURCE_PAIR_UNAVAILABLE',sourcePairsAttempted:6,
  validatedCandidatePairs:5,agreedCandidatePairs:5,uptrendCandidatePairs:0,
  eligibleBuyCandidates:0,eligibleExitCandidates:0,rejectedCandidatePairs:1}});
assert.equal(partialEu.report.euSignalCycle.rejectedCandidatePairs,1);
assert.match(partialEu.euAnnotation,/EU SOURCE INCOMPLETE/);
assert.throws(()=>publicReport({...fixture,euSignalCycle:{
  ...partialEu.report.euSignalCycle,state:'EU_NO_DUAL_VENUE_UPTREND'}}),/NOT_VERIFIED/,
  'Partial evidence must not be reported as no opportunity');
assert.throws(()=>publicReport({...fixture,euSignalCycle:{
  ...partialEu.report.euSignalCycle,rejectedCandidatePairs:0}}),/NOT_VERIFIED/,
  'Partial diagnostic requires at least one rejected pair');
assert.doesNotMatch(JSON.stringify(partialEu),/rawPrice|SECRET|privateJournal/);
const euCommitSummary=oneGlobalActionsCycleSummary({...fixture,
  state:'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE',journalEventCount:4,
  pendingSignalCount:2,newSignals:1,sourcePairsAttempted:2,sourceEvidenceArchived:true,
  euSignalCycle:euProspectiveCommitted});
assert.equal(euCommitSummary.report.euSignalCycle.newSignals,1);
assert.equal(euCommitSummary.report.euSignalCycle.rightsAndNextSessionEvidenceConnected,true);
assert.equal(euCommitSummary.report.paperFillsCreated,0,'A SIGNAL must never masquerade as FILL');
assert.equal(euCommitSummary.status,'PAPER_BLOCKED','Expired CBA can still be pending when fresh EU SIGNAL is valid');
assert.match(euCommitSummary.euAnnotation,/^::notice title=FENICE EU SIGNAL RECORDED::/);
assert.match(euCommitSummary.markdown,/EU next-session evidence \| CONNECTED/);
// Regression for PR #567: a genuine research SELL can be committed into the
// original journal. The public allowlist MUST accept it without leaking
// holdings, prices, original receipts or declaring it a completed FILL.
const euExitCommitted={...euProspectiveCommitted,state:'EU_PROSPECTIVE_EXIT_SIGNAL_COMMITTED_PRIVATE',
  uptrendCandidatePairs:0,eligibleBuyCandidates:0,eligibleExitCandidates:1,
  privatePosition:{key:'XMIL:ENEL',cashEuro:999},rawPrice:123456};
const exitReport={...fixture,
  state:'EU_PROSPECTIVE_EXIT_SIGNAL_COMMITTED_PRIVATE',journalEventCount:4,
  pendingSignalCount:2,newSignals:1,sourcePairsAttempted:2,
  sourceEvidenceArchived:true,euSignalCycle:euExitCommitted};
const euExitSummary=oneGlobalActionsCycleSummary(exitReport);
assert.equal(euExitSummary.report.euSignalCycle.state,'EU_PROSPECTIVE_EXIT_SIGNAL_COMMITTED_PRIVATE');
assert.equal(euExitSummary.report.euSignalCycle.newSignals,1);
assert.equal(euExitSummary.report.paperFillsCreated,0,'An EXIT SIGNAL is not a settled SELL');
assert.match(euExitSummary.euAnnotation,/EU SIGNAL RECORDED/);
assert.doesNotMatch(JSON.stringify(euExitSummary),/privatePosition|rawPrice|123456|cashEuro/);
assert.throws(()=>publicReport({...exitReport,state:'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE'}),
  /NOT_VERIFIED/,'Reject mismatched reported BUY versus committed SELL state');
assert.throws(()=>publicReport({...exitReport,euSignalCycle:{...euExitCommitted,newSignals:0}}),
  /NOT_VERIFIED/,'Never mask an original SELL SIGNAL as a no-op');
const alreadyHeld=publicReport({...fixture,euSignalCycle:{
  ...euProspectiveBlocked,state:'EU_ALL_CANDIDATES_ALREADY_HELD_OR_PENDING'}});
assert.equal(alreadyHeld.euSignalCycle.state,'EU_ALL_CANDIDATES_ALREADY_HELD_OR_PENDING');
assert.equal(alreadyHeld.euSignalCycle.canonicalSignalCommitted,false);
assert.equal(alreadyHeld.paperFillsCreated,0);
const countedNoSignal=oneGlobalActionsCycleSummary({...fixture,euSignalCycle:{
  ...euProspectiveBlocked,state:'EU_NO_DUAL_VENUE_UPTREND',
  validatedCandidatePairs:2,agreedCandidatePairs:2,uptrendCandidatePairs:1,
  eligibleBuyCandidates:0,eligibleExitCandidates:0,
  secretQuote:12345,privateIsin:'IT0000000000'
}});
assert.equal(countedNoSignal.report.euSignalCycle.uptrendCandidatePairs,1,
  'UPTREND can exist but be ineligible for BUY or SELL');
assert.match(countedNoSignal.markdown,/EU uptrend research candidates \| 1/);
assert.match(countedNoSignal.markdown,/EU eligible prospective BUYs \| 0/);
assert.doesNotMatch(JSON.stringify(countedNoSignal),/secretQuote|privateIsin|12345|IT0000000000/);
for(const delta of [
  {validatedCandidatePairs:3},
  {agreedCandidatePairs:3},
  {uptrendCandidatePairs:3},
  {eligibleBuyCandidates:1},
  {eligibleExitCandidates:1},
  {validatedCandidatePairs:0},
  {eligibleBuyCandidates:'SECRET'},
  {uptrendCandidatePairs:undefined},
]){
  assert.throws(()=>oneGlobalActionsCycleSummary({...fixture,euSignalCycle:{
    ...countedNoSignal.report.euSignalCycle,...delta
  }}),/NOT_VERIFIED/,'Reject misleading, incomplete or unbounded public candidate counts');
}
assert.equal(countedNoSignal.report.paperFillsCreated,0);
console.log('PASS ONE GLOBAL EU SELL Actions report: exit signal, held-position no-op, strict matching, no fake FILL or private leakage.');

for(const q of [
  {...euProspectiveBlocked,state:'EU_FAKE_SIGNAL_COMMITTED'},
  {...euProspectiveBlocked,newSignals:1},
  {...euProspectiveBlocked,canonicalSignalCommitted:true},
  {...euProspectiveBlocked,sourcePairsAttempted:7},
  {...euProspectiveBlocked,rightsAndNextSessionEvidenceConnected:true},
  {...euProspectiveCommitted,sourceEvidenceArchived:false},
  {...euProspectiveCommitted,rightsAndNextSessionEvidenceConnected:false},
  {...euProspectiveCommitted,paperFillsCreated:1},
])assert.throws(()=>oneGlobalActionsCycleSummary({...fixture,euSignalCycle:q}),/NOT_VERIFIED/,
  'No forged or internally contradictory EU run status');
console.log('PASS separated EU SIGNAL visibility: source-failure warning, private next-session SIGNAL notice, older CBA block still disclosed, zero fake FILL/secret leaks.');


// The OIDC Actions forensic status must never publish original instruments,
// receipts, owner consent, account values, document bytes or content hashes.
const auditChecks=[
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
];
const rawAudit={state:'FILL_RIGOROUS_REPLAY_VERIFIED',
  checks:auditChecks.map(name=>({name,verified:true,privateRaw:'SECRET'})),
  missingEvidence:[],defects:[],journalMutationAllowed:false,
  paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
  identity:{key:'XMIL:BAMI',signalHash:'PRIVATE_HASH'},accounting:{cashEuro:999,price:12345},
  originalPolicy:'VERY_PRIVATE'};
const safeAudit=forensicSummary(rawAudit);
assert.equal(safeAudit.firstFillForensicallyVerified,true);
assert.equal(safeAudit.forensicReasonCode,'NONE');
assert.equal(safeAudit.nextRequiredCheck,null);
assert.equal(safeAudit.checksPassed,10);
assert.equal(safeAudit.originalJournalReplayed,true);
assert.equal(safeAudit.phase9Credit,0);
assert.doesNotMatch(JSON.stringify(safeAudit),/SECRET|PRIVATE_HASH|XMIL|12345|cashEuro|originalPolicy/);
const incompleteAudit=forensicSummary({...rawAudit,state:'FILL_NOT_YET_VERIFIABLE',
  checks:rawAudit.checks.slice(0,2),missingEvidence:[{code:'MISSING_ORIGINAL',path:'SECRET'}]});
assert.equal(incompleteAudit.firstFillForensicallyVerified,false);
assert.equal(incompleteAudit.missingEvidenceCount,1);
assert.equal(incompleteAudit.forensicReasonCode,'PRIVATE_EVIDENCE_GAP_UNCLASSIFIED');
assert.equal(incompleteAudit.nextRequiredCheck,'ORIGINAL_DOCUMENT_BYTES_CONSENT_RIGHTS_MAPPING_AND_EXACT_SESSION');
const metadataGap=forensicSummary({...rawAudit,state:'FILL_NOT_YET_VERIFIABLE',
  checks:rawAudit.checks.slice(0,1),
  missingEvidence:[{code:'PRIVATE_EVIDENCE_ORIGIN_METADATA_INVALID',
    path:'fenice/one-global/private-eod/observations/private-hash-NEVER-EXPOSE'}]});
assert.equal(metadataGap.forensicReasonCode,'PRIVATE_EVIDENCE_ORIGIN_METADATA_INVALID');
assert.equal(metadataGap.checksPassed,1);
assert.doesNotMatch(JSON.stringify(metadataGap),/fenice\/|private-hash|NEVER-EXPOSE/);
const arbitraryException=forensicSummary({...rawAudit,state:'FILL_NOT_YET_VERIFIABLE',
  checks:rawAudit.checks.slice(0,1),
  missingEvidence:[{code:'SECRET=https://somewhere.invalid/personal',path:'PRIVATE'}]});
assert.equal(arbitraryException.forensicReasonCode,'PRIVATE_EVIDENCE_GAP_UNCLASSIFIED');
assert.doesNotMatch(JSON.stringify(arbitraryException),/SECRET|somewhere|personal/);
assert.doesNotMatch(JSON.stringify(incompleteAudit),/SECRET|MISSING_ORIGINAL/);
for(const delta of [
  {state:'FILL_RIGOROUS_REPLAY_VERIFIED',checks:rawAudit.checks.slice(0,9)},
  {missingEvidence:[{code:'SECRET'}]},
  {defects:['TAMPERED']},
  {checks:[...rawAudit.checks,rawAudit.checks[0]]},
  {checks:[...rawAudit.checks].reverse()},
  {checks:[...rawAudit.checks.slice(0,9),{name:'FORGED_CERTIFICATION',verified:true}]},
  {liveTradingAllowed:true},{phase9Credit:1},{brokerConnectivityAllowed:true},
  {state:'FAKE_VERIFIED_FILL'},
])assert.throws(()=>forensicSummary({...rawAudit,...delta}),/NOT_VERIFIED/,
  'No forged forensic proof or escalated broker authority');
console.log('PASS first original FILL forensic Actions attestation: 10 exact checks, incomplete evidence, no leaks or broker elevation.');

  
// Execute the trusted Actions runner against SYNTHETIC safe route responses.
// Regression: release #68 could report CHECK_NOT_CONFIRMED because the runner
// still used Milan-only stage/reason enums for the new XNAS/USD audit.
// No external HTTP, real OIDC, private Blob or journal writes occur here.
const usOriginalSecond=secondForensicSummary({...rawAudit,fillOrdinal:2,
  identity:{mic:'XNAS',currency:'USD',side:'BUY',opaqueFixture:'PRIVATE_US_ORIGINAL'},
  state:'FILL_NOT_YET_VERIFIABLE',checks:rawAudit.checks.slice(0,3),
  missingEvidence:[{code:'US_ORIGINAL_RECEIPT_RAW_BYTES_REQUIRED',
    path:'PRIVATE_ORIGINAL_BLOB'}]});
assert.equal(usOriginalSecond.checksPassed,3);
assert.equal(usOriginalSecond.nextRequiredCheck,'US_TWO_ORIGINAL_DAILY_SOURCE_PAYLOADS_REPARSED');
assert.equal(usOriginalSecond.forensicReasonCode,'US_ORIGINAL_RECEIPT_RAW_BYTES_REQUIRED');
const firstHistoric=forensicSummary({...rawAudit,
  state:'FILL_NOT_YET_VERIFIABLE',checks:rawAudit.checks.slice(0,9),
  missingEvidence:[{code:'SETTLEMENT_ARCHIVE_PRECOMMIT_TIMESTAMP_NOT_PROVEN'}]});
const syntheticNoFill={...fixture,state:'ORIGINAL_VERIFIED_NO_ELIGIBLE_SIGNAL',
  pendingSignalCount:0,settlementState:'NO_PENDING_SIGNAL_TO_SETTLE',
  settlementBlockers:[]};
const latestReceipt=latestSummary({...rawAudit,fillOrdinal:3});
assert.equal(validateOneGlobalWorkflowForensic(latestReceipt,'LATEST',3).checksPassed,10);
for(const altered of [
  {...latestReceipt,fillOrdinal:4},{...latestReceipt,checksPassed:9},{...latestReceipt,missingEvidenceCount:1},
  {...latestReceipt,forensicReasonCode:'PRIVATE_BYTES'},{...latestReceipt,price:123},
])assert.throws(()=>validateOneGlobalWorkflowForensic(altered,'LATEST',3),/NOT_VERIFIED/);
const rejection=oneGlobalActionsCycleSummary({...syntheticNoFill,sourcePairsAttempted:2,outcomes:[
  {symbol:'SECRET_SYMBOL',state:'EOD_PROSPECTIVE_BRIDGE_RESEARCH_GATE_NOT_MET'},
  {symbol:'SECRET_SYMBOL',state:'PRIVATE_UNKNOWN_PROVIDER_ERROR'}]});
assert.deepEqual(rejection.report.usResearchReasons,['STRATEGY_CONDITIONS_NOT_MET','OTHER_RESEARCH_GATE']);
assert.doesNotMatch(JSON.stringify(rejection),/SECRET_SYMBOL|PRIVATE_UNKNOWN_PROVIDER_ERROR/);
const envKeys=['GITHUB_REPOSITORY','GITHUB_REF','ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN','GITHUB_STEP_SUMMARY'];
const previousEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const originalFetch=globalThis.fetch,originalLog=console.log;
const syntheticLogs=[];
try{
  Object.assign(process.env,{GITHUB_REPOSITORY:'romitoorazio/fenice-investment-system',
    GITHUB_REF:'refs/heads/main',
    ACTIONS_ID_TOKEN_REQUEST_URL:'https://token.actions.githubusercontent.com/oidc',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN:'SYNTHETIC_TEST_ONLY'});
  delete process.env.GITHUB_STEP_SUMMARY;
  globalThis.fetch=async(url,init={})=>{
    const link=String(url);
    if(link.startsWith('https://token.actions.githubusercontent.com/'))
      return Response.json({value:'SYNTHETIC_OIDC_'.repeat(20)});
    assert.equal(link,SIGNAL_CYCLE_AUDIENCE,'No other network origin');
    assert.equal(init.method,'POST');
    const action=JSON.parse(init.body).action;
    if(action==='RESEARCH_SIGNAL_CYCLE')return Response.json({...syntheticNoFill,journalEventCount:6,virtualFillCount:3});
    if(action==='AUDIT_LATEST_FILL_READ_ONLY')return Response.json(latestReceipt);
    if(action==='AUDIT_FIRST_FILL_READ_ONLY')return Response.json(firstHistoric);
    if(action==='AUDIT_SECOND_FILL_READ_ONLY')return Response.json(usOriginalSecond);
    assert.fail('Unexpected synthetic protected route action');
  };
  console.log=(...values)=>syntheticLogs.push(values.map(String).join(' '));
  await import('./invoke-one-global-cloud-signal-cycle.mjs?synthetic-us-forensic-runner-regression');
}finally{
  globalThis.fetch=originalFetch;
  console.log=originalLog;
  for(const k of envKeys){
    if(previousEnv[k]===undefined)delete process.env[k];
    else process.env[k]=previousEnv[k];
  }
}
assert(syntheticLogs.some(x=>x.startsWith('ONE_GLOBAL_FIRST_FILL_FORENSIC=FILL_NOT_YET_VERIFIABLE')));
assert(syntheticLogs.some(x=>x==='ONE_GLOBAL_SECOND_FILL_FORENSIC=FILL_NOT_YET_VERIFIABLE REASON=US_ORIGINAL_RECEIPT_RAW_BYTES_REQUIRED ADAPTER=NOT_REQUIRED_OR_UNDETERMINED CHECKS=3/10'),
  'Runner must publish bounded XNAS/USD blocker rather than CHECK_NOT_CONFIRMED');
assert(syntheticLogs.some(x=>x.startsWith('ONE_GLOBAL_LATEST_FILL_FORENSIC=FILL_RIGOROUS_REPLAY_VERIFIED')
  &&x.endsWith('CHECKS=10/10 ORDINAL=3')));
assert(!syntheticLogs.some(x=>x.includes('CHECK_NOT_CONFIRMED')));
assert.doesNotMatch(syntheticLogs.join('\n'),/PRIVATE_US_ORIGINAL|PRIVATE_ORIGINAL_BLOB|SYNTHETIC_OIDC_/);
assert.equal(process.exitCode??0,0);
console.log('PASS trusted Actions forensic runner: bounded USD stage/reason allowlist, no private leakage, first 9\/10 unchanged and Directa locked. SYNTHETIC.');
