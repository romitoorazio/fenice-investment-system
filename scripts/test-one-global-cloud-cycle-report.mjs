import assert from 'node:assert/strict';
import {publicOneGlobalCloudCycleReport as publicReport,oneGlobalActionsCycleSummary} from '../lib/trading/one-global-cloud-cycle-report.mjs';
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
for(const delta of [{sourcePairsReceived:3},{sourcePairsAgree:2,sourcePairsReceived:1},{rightsEvidenceConnected:'SECRET'},
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
assert.match(confirmedRun.annotation,/^::notice title=FENICE PAPER FILL VERIFIED::/);
assert.throws(()=>oneGlobalActionsCycleSummary({...fixture,settlementBlockers:['secret=TOKEN']}),/NOT_VERIFIED/);
console.log('PASS GitHub Actions PAPER outcome: visible blocked warning, NO_FILL and verified FILL mutually distinct; sanitized enumeration only.');
