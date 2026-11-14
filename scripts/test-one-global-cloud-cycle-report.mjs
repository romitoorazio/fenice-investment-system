import assert from 'node:assert/strict';
import {publicOneGlobalCloudCycleReport as publicReport} from '../lib/trading/one-global-cloud-cycle-report.mjs';
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
