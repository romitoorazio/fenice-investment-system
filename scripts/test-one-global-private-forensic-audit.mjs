import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {auditOneGlobalFirstPrivateFill as audit,handleOneGlobalPrivateForensicRequest as handle} from '../lib/trading/one-global-private-forensic-audit.mjs';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,settleOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {buildOneGlobalEuDualVenueReport,oneGlobalEuReceipt,oneGlobalMilanSession} from '../lib/market/one-global-eu-delayed-eod.mjs';
import {createVercelPrivateEodBlobStore} from '../lib/trading/one-global-vercel-private-blob-store.mjs';
import {publicOneGlobalSecondFillForensicSummary} from '../lib/trading/one-global-cloud-cycle-report.mjs';
import {isOneGlobalEuConfirmedExitResearch} from '../lib/trading/one-global-cloud-eu-prospective-cycle.mjs';
import {buildFirstPaperFreeEodEvidence} from '../lib/market/one-global-first-paper-dual-eod.mjs';
import {buildOneGlobalProspectiveSignalFromDualEod} from '../lib/trading/one-global-prospective-dual-eod-bridge.mjs';
import {selectOneGlobalEcbCurrencyReference} from '../lib/market/one-global-cloud-ecb-reference.mjs';

// SYNTHETIC ONLY. No private journal, consent, publisher payload or actual
// production fill is committed in this fixture; no network request is made.
const sha=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>sha(JSON.stringify(x));
const isin='IT0005218380',nowIso='2026-11-17T18:00:00.000Z';
const documents=[],raws=new Map(),observations=new Map();
const doc=(kind,value)=>{const bytes=Buffer.from(JSON.stringify(value)),hash=sha(bytes);
  documents.push({kind,sha256:hash,bodyBase64:bytes.toString('base64')});return hash;};
const raw=bytes=>{const hash=sha(bytes);raws.set(hash,{body:bytes});return hash;};
const header='TradingDateTime,PublicationDateTime,MifidInstrumentID,MifidPrice,MifidQuantity,MifidPriceNotation,MifidCurrency,MmtMarketMechanism,MmtNegotiationIndicator,MmtModificationIndicator,MmtBenchMarkIndicator,MmtContributionToPrice,MmtAlgorithmicIndicator,MmtPublicationMode,Venue,ThirdCountryTradingVenueExecution,TradeUniqueIdentifier,MissingPrice,MmtContingentTransactionIndicator,VenueOfPublication';
function primary(date,close,trend='up'){
  const row=(time,price,id)=>[`${date}T${time}.000000Z`,`${date}T${time}.001000Z`,isin,price,100,'MONE','EUR','1','-','-','-','-','-','-','MTAA','',id,'','-','MTAA'].join(',');
  const rows=Array.from({length:12},(_,i)=>row('08:'+String(i).padStart(2,'0')+':00',
    trend==='down'?10.5-i*.08:9.7+i*.01,'REGULAR'+i));
  rows.push(row('16:29:59',trend==='down'?close+.01:close-.01,'REGULARLAST'),row('16:35:09',close,'AUCTION0001'));
  return Buffer.from('Euronext N.V. SYNTHETIC TEST ONLY\n'+header+'\n'+rows.join('\n')+'\n');
}
const secondary=(date,price)=>Buffer.from(`${date} 16:29:55.000000,${isin},${price},EUR,MONE,100,CEUX,CLOB,${date} 16:29:55.001000,CEUX,TEST00001,""\n`);
function discovery(date){return Buffer.from(JSON.stringify({daily:[],minute:[{
  filename:'eqt_trade_CEUX_'+date.replaceAll('-','')+'_1629.csv',
  serveUrl:'https://cdn.cboe.com/data/europe/equities/delayed_data/eqt_trade_CEUX/0123456789/minute/eqt_trade_CEUX_'+date.replaceAll('-','')+'_1629.csv'}]}));}
const priorPrimary=primary('2026-11-16',10.2),priorSecondary=secondary('2026-11-16',10.19);
const report=buildOneGlobalEuDualVenueReport({euronextRaw:priorPrimary,cboeRaw:priorSecondary,symbol:'BAMI',
  sessionDate:'2026-11-16',observedAt:'2026-11-16T17:00:00.000Z'});
assert.equal(report.researchIndicator,'UPTREND_RESEARCH_ONLY');
const signalSnapshot=digest(report),signalObservation={version:1,kind:'ONE_GLOBAL_PRIVATE_EU_DUAL_VENUE_RESEARCH_OBSERVATION',report,
  rawArtifacts:{euronextHash:raw(priorPrimary),cboeHash:raw(priorSecondary),cboeDiscoveryHash:raw(discovery('2026-11-16'))},
  paperSettlementEligible:false,strategyPerformanceCertified:false,liveTradingAllowed:false,brokerConnectivityAllowed:false};
observations.set(signalSnapshot,{body:Buffer.from(JSON.stringify(signalObservation)),uploadedAt:'2026-11-16T17:00:00.100Z'});
const before=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),nowIso:'2026-11-16T17:00:01.000Z',signal:{
  signalId:'synthetic-forensic-bami-20261116',key:'XMIL:BAMI',mic:'XMIL',side:'BUY',currency:'EUR',
  decisionAt:'2026-11-16T17:00:01.000Z',referenceSessionDate:'2026-11-16',referenceCloseAt:report.primary.tradeAt,
  referencePublishedAt:report.observedAt,sourceSnapshotHash:signalSnapshot,maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
const signal=before.events[0],authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,approvedForVirtualSimulation:true,
  approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',
  allowBackfill:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,
  strategyPerformanceCertified:false,approvedAt:'2026-11-16T12:00:00.000Z',expiresAt:'2026-12-01T00:00:00.000Z'};
const authorityEvidenceSha256=doc('ORIGINAL_OWNER_PAPER_CONSENT',authority);
const policyPins={};
const sources=[],rights=[];
for(const [name,providerId,sourceFamily,venue] of [
  ['euronext','euronext-mifir','euronext-mtaa-primary','MTAA'],['cboe','cboe-eu-mifir','cboe-ceux-orderbook','CEUX']]){
  const policy=Buffer.from('SYNTHETIC '+name+' usage policy for isolated testing only'),hash=raw(policy);
  const url='https://example.invalid/synthetic-'+name+'.pdf';policyPins[name]={providerId,url,sha256:hash};
  const evidenceSha256=doc('OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE',{providerId,officialUrl:url,originalDocumentSha256:hash,
    usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedInternalAnalysis:true,distributionAllowedByThisReview:false});
  rights.push({providerId,mic:'XMIL',currency:'EUR',evidenceSha256,usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',
    automatedUseAllowed:true,validUntil:'2026-12-31T23:59:59.000Z',reviewedByOwner:true});
  const independenceEvidenceSha256=doc('OFFICIAL_PROVIDER_UPSTREAM_PROVENANCE_CAPTURE',{
    providerId,instrumentKey:'XMIL:BAMI',isin,listingMic:'XMIL',observedVenueMic:venue,sourceFamily,independentTransportAndVenue:true});
  sources.push({providerId,key:'XMIL:BAMI',mic:'XMIL',currency:'EUR',symbol:isin,sourceFamily,
    independenceEvidenceSha256,reviewedByOwner:true,reviewedAt:'2026-11-16T16:00:00.000Z'});
}
const bounds=oneGlobalMilanSession('2026-11-17');
const calendarArtifactSha256=raw(Buffer.from('<html>Calendar of business days 2026 SYNTHETIC TEST ONLY</html>'));
const sessionEvidence=doc('OFFICIAL_EXCHANGE_SESSION_CAPTURE',{mic:'XMIL',sessionDate:'2026-11-17',calendarArtifactSha256,bounds});
const context={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority,authorityEvidenceSha256,documents,
  markets:[{key:'XMIL:BAMI',mic:'XMIL',currency:'EUR',sources,ownerReviewedRights:rights}],
  sessions:[{mic:'XMIL',sessionDate:'2026-11-17',sessionOpenedAt:bounds.sessionOpenedAt,sessionClosedAt:bounds.sessionClosedAt,
    evidenceSha256:sessionEvidence,reviewedByOwner:true,reviewedAt:'2026-11-16T16:00:00.000Z'}]};
const fillPrimary=primary('2026-11-17',10),fillSecondary=secondary('2026-11-17',9.99);
const marketEvidence={sessionDate:'2026-11-17',sessionOpenedAt:bounds.sessionOpenedAt,sessionClosedAt:bounds.sessionClosedAt,
  providerReceipts:[oneGlobalEuReceipt({source:sources[0],signal,sessionDate:'2026-11-17',raw:fillPrimary,observedAt:'2026-11-17T17:00:00.000Z'}),
    oneGlobalEuReceipt({source:sources[1],signal,sessionDate:'2026-11-17',raw:fillSecondary,observedAt:'2026-11-17T17:00:00.000Z'})]};
const observation={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_SOURCE_OBSERVATION',signalHash:signal.hash,context,
  contextSha256:sha(JSON.stringify(context,null,2)+'\n'),marketEvidence,providerRaw:[
    {providerId:'euronext-mifir',rawArtifactSha256:raw(fillPrimary)},
    {providerId:'cboe-eu-mifir',rawArtifactSha256:raw(fillSecondary)},
    {providerId:'cboe-eu-mifir',supportingKind:'CBOE_OFFICIAL_DISCOVERY_JSON',rawArtifactSha256:raw(discovery('2026-11-17'))}],
  fxEvidence:null,ecbRawBase64:null,sourceRightsIndependentlyCertified:false,liveTradingAllowed:false,brokerConnectivityAllowed:false};
const archiveHash=digest(observation);observations.set(archiveHash,{body:Buffer.from(JSON.stringify(observation)),uploadedAt:'2026-11-17T17:00:00.500Z'});
const ledger=settleOneGlobalEodSignal({previousLedger:before,nowIso:'2026-11-17T17:00:01.000Z',signalHash:signal.hash,
  marketEvidence,ownerReviewedRights:rights,authority,settlementEvidenceArchiveSha256:archiveHash}).ledger;
const ledgerBody=JSON.stringify(ledger),reads=[];
const storage={privateAccess:true,durable:true,
  async read(){reads.push('journal');return {body:ledgerBody,etag:'fixture-etag'};},
  async readResearchObservation(hash){reads.push('observation:'+hash);return observations.get(hash)??null;},
  async readSourceArtifact(hash){reads.push('raw:'+hash);return raws.get(hash)??null;},
  async compareAndSwap(){assert.fail('FORENSIC_AUDIT_MUST_NEVER_WRITE');},
  async writeSettlementContext(){assert.fail('FORENSIC_AUDIT_MUST_NEVER_REFRESH_ORIGINALS');}};
const complete=await audit({storage,nowIso,policyPins});
assert.equal(complete.state,'FILL_RIGOROUS_REPLAY_VERIFIED',JSON.stringify(complete));
assert.equal(complete.accounting.cashImmediatelyAfterEuro,949);assert.equal(complete.identity.isin,isin);
assert.equal(complete.certifiedTrades,0);assert.equal(complete.liveTradingAllowed,false);
assert.equal(complete.journalMutationAllowed,false);assert.equal(complete.certification.closedVirtualRoundTrips,0);
assert(complete.checks.every(x=>x.verified===true));
assert(complete.checks.some(x=>x.name==='EXACT_FILL_EVENT_QUANTITY_FEE_BALANCE_AND_HASH_REPRODUCED'));
assert(complete.checks.some(x=>x.name==='PROSPECTIVE_SIGNAL_RECOMPUTED_FROM_ORIGINAL_PRIOR_SESSION_BYTES'));
for(const field of ['bodyBase64','ownerConsent','approvalEvidence','rawBase64','technicalReview'])assert(!JSON.stringify(complete).includes(field));
assert.equal(JSON.stringify(ledger),ledgerBody,'original private fixture is byte-for-byte unchanged');
// Independent SECOND original FILL: prospective SELL, original preceding BUY
// position, separate raw venue receipts, source archive and real CAS semantics.
// Entire fixture is synthetic and stays outside the production private Blob.
const exitResearchPrimary=primary('2026-11-17',9.45,'down');
const exitResearchSecondary=secondary('2026-11-17',9.44);
const exitReport=buildOneGlobalEuDualVenueReport({euronextRaw:exitResearchPrimary,
  cboeRaw:exitResearchSecondary,symbol:'BAMI',sessionDate:'2026-11-17',
  observedAt:'2026-11-17T17:04:00.000Z'});
assert.equal(exitReport.researchIndicator,'NO_UPTREND');
assert.equal(isOneGlobalEuConfirmedExitResearch(exitReport),true);
const exitSnapshot=digest(exitReport);
observations.set(exitSnapshot,{body:Buffer.from(JSON.stringify({
  version:1,kind:'ONE_GLOBAL_PRIVATE_EU_DUAL_VENUE_RESEARCH_OBSERVATION',report:exitReport,
  rawArtifacts:{euronextHash:raw(exitResearchPrimary),cboeHash:raw(exitResearchSecondary),
    cboeDiscoveryHash:raw(discovery('2026-11-17'))},
  paperSettlementEligible:false,strategyPerformanceCertified:false,
  liveTradingAllowed:false,brokerConnectivityAllowed:false})),
  uploadedAt:'2026-11-17T17:04:00.100Z'});
const exitBefore=recordOneGlobalEodSignal({previousLedger:ledger,
  nowIso:'2026-11-17T17:04:01.000Z',signal:{
    signalId:'synthetic-forensic-bami-20261117-exit',
    key:'XMIL:BAMI',mic:'XMIL',side:'SELL',currency:'EUR',
    decisionAt:'2026-11-17T17:04:01.000Z',referenceSessionDate:'2026-11-17',
    referenceCloseAt:exitReport.primary.tradeAt,referencePublishedAt:exitReport.observedAt,
    sourceSnapshotHash:exitSnapshot,maxNotionalEuro:50,strategyReason:'DOWNTREND_EXIT'}}).ledger;
const exitSignal=exitBefore.events.at(-1),exitBounds=oneGlobalMilanSession('2026-11-18');
const exitCalendarArtifact=raw(Buffer.from('<html>Calendar of business days 2026 SYNTHETIC EXIT</html>'));
const exitSessionEvidence=doc('OFFICIAL_EXCHANGE_SESSION_CAPTURE',{mic:'XMIL',sessionDate:'2026-11-18',
  calendarArtifactSha256:exitCalendarArtifact,bounds:exitBounds});
const exitContext={...context,documents:[...documents],
  sessions:[...context.sessions,{mic:'XMIL',sessionDate:'2026-11-18',
    sessionOpenedAt:exitBounds.sessionOpenedAt,sessionClosedAt:exitBounds.sessionClosedAt,
    evidenceSha256:exitSessionEvidence,reviewedByOwner:true,reviewedAt:'2026-11-17T16:00:00.000Z'}]};
const exitFillPrimary=primary('2026-11-18',9.2,'down');
const exitFillSecondary=secondary('2026-11-18',9.19);
const exitMarket={sessionDate:'2026-11-18',
  sessionOpenedAt:exitBounds.sessionOpenedAt,sessionClosedAt:exitBounds.sessionClosedAt,
  providerReceipts:[
    oneGlobalEuReceipt({source:sources[0],signal:exitSignal,sessionDate:'2026-11-18',
      raw:exitFillPrimary,observedAt:'2026-11-18T17:00:00.000Z'}),
    oneGlobalEuReceipt({source:sources[1],signal:exitSignal,sessionDate:'2026-11-18',
      raw:exitFillSecondary,observedAt:'2026-11-18T17:00:00.000Z'})]};
const exitObservation={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_SOURCE_OBSERVATION',
  signalHash:exitSignal.hash,context:exitContext,
  contextSha256:sha(JSON.stringify(exitContext,null,2)+'\n'),marketEvidence:exitMarket,
  providerRaw:[
    {providerId:'euronext-mifir',rawArtifactSha256:raw(exitFillPrimary)},
    {providerId:'cboe-eu-mifir',rawArtifactSha256:raw(exitFillSecondary)},
    {providerId:'cboe-eu-mifir',supportingKind:'CBOE_OFFICIAL_DISCOVERY_JSON',
      rawArtifactSha256:raw(discovery('2026-11-18'))}],
  fxEvidence:null,ecbRawBase64:null,sourceRightsIndependentlyCertified:false,
  liveTradingAllowed:false,brokerConnectivityAllowed:false};
const exitArchive=digest(exitObservation);
observations.set(exitArchive,{body:Buffer.from(JSON.stringify(exitObservation)),
  uploadedAt:'2026-11-18T17:00:00.500Z'});
const exitLedger=settleOneGlobalEodSignal({previousLedger:exitBefore,
  nowIso:'2026-11-18T17:00:01.000Z',signalHash:exitSignal.hash,
  marketEvidence:exitMarket,ownerReviewedRights:rights,authority,
  settlementEvidenceArchiveSha256:exitArchive}).ledger;
const exitBody=JSON.stringify(exitLedger),twoFillStorage={...storage,
  async read(){return {body:exitBody,etag:'synthetic-two-fills'};}};
const firstOfTwo=await audit({storage:twoFillStorage,nowIso:'2026-11-18T18:00:00.000Z',policyPins,fillOrdinal:1});
const secondOfTwo=await audit({storage:twoFillStorage,nowIso:'2026-11-18T18:00:00.000Z',policyPins,fillOrdinal:2});
assert.equal(firstOfTwo.state,'FILL_RIGOROUS_REPLAY_VERIFIED',JSON.stringify(firstOfTwo));
assert.equal(secondOfTwo.state,'FILL_RIGOROUS_REPLAY_VERIFIED',JSON.stringify(secondOfTwo));
assert.equal(secondOfTwo.identity.side,'SELL');
assert.equal(secondOfTwo.identity.sequence,4);
assert.equal(secondOfTwo.certification.closedVirtualRoundTrips,1);
assert.equal(secondOfTwo.accounting.cashImmediatelyAfterEuro,exitLedger.cashEuro);
assert(secondOfTwo.accounting.executionPrice<secondOfTwo.accounting.referencePrice);
const secondSafe=publicOneGlobalSecondFillForensicSummary(secondOfTwo);
assert.equal(secondSafe.fillOrdinal,2);
assert.equal(secondSafe.secondFillForensicallyVerified,true);
assert.equal(secondSafe.checksPassed,10);
assert.equal(secondSafe.adapterFamily,'NOT_REQUIRED_OR_UNDETERMINED');
const missingAdapterSafe=publicOneGlobalSecondFillForensicSummary({
  ...secondOfTwo,state:'FILL_NOT_YET_VERIFIABLE',
  checks:secondOfTwo.checks.slice(0,3),
  missingEvidence:[{code:'FIRST_FILL_MARKET_FORENSIC_ADAPTER_NOT_REVIEWED'}],
  adapterRequirement:{status:'NOT_IMPLEMENTED',family:'NON_MILAN_USD_MARKET',
    originalReceiptCount:2}});
assert.equal(missingAdapterSafe.adapterFamily,'NON_MILAN_USD_MARKET');
assert.equal(missingAdapterSafe.secondFillForensicallyVerified,false);
assert.throws(()=>publicOneGlobalSecondFillForensicSummary({
  ...secondOfTwo,adapterRequirement:{status:'NOT_IMPLEMENTED',
    family:'INJECT_PRIVATE_SYMBOL_XYZ',originalReceiptCount:2}}),
  /ONE_GLOBAL_PRIVATE_CLOUD_REPORT_NOT_VERIFIED/);
assert.equal(secondSafe.liveTradingAllowed,false);
assert(!JSON.stringify(secondSafe).includes(isin));
assert(!JSON.stringify(secondSafe).includes(exitSignal.hash));
assert(!JSON.stringify(secondSafe).includes('ownerConsent'));
assert.equal(exitBody,JSON.stringify(exitLedger),'never mutate original two-FILL ledger');
const secondTooLate={...twoFillStorage,readResearchObservation:async hash=>
  hash===exitArchive?{...observations.get(hash),uploadedAt:'2026-11-18T17:00:02.000Z'}
    :observations.get(hash)};
const secondLate=await audit({storage:secondTooLate,nowIso:'2026-11-18T18:00:00.000Z',policyPins,fillOrdinal:2});
assert.equal(secondLate.state,'FILL_NOT_YET_VERIFIABLE');
assert.equal(secondLate.missingEvidence[0].code,'SETTLEMENT_ARCHIVE_PRECOMMIT_TIMESTAMP_NOT_PROVEN');
assert.equal((await audit({storage,nowIso,policyPins,fillOrdinal:2})).state,'NO_ORIGINAL_FILL');
assert.throws(()=>publicOneGlobalSecondFillForensicSummary(firstOfTwo),/ONE_GLOBAL_PRIVATE_CLOUD_REPORT_NOT_VERIFIED/);

const absent=await audit({storage:{...storage,readSourceArtifact:async()=>null},nowIso,policyPins});
assert.equal(absent.state,'FILL_NOT_YET_VERIFIABLE');assert.match(absent.missingEvidence[0].path,/observations\/raw\/[a-f0-9]{64}$/);
const corrupt=await audit({storage:{...storage,readSourceArtifact:async()=>({body:Buffer.from('CORRUPTED ORIGINAL BYTES')})},nowIso,policyPins});
assert.equal(corrupt.state,'FILL_INVALID');assert.deepEqual(corrupt.defects,['ARCHIVED_RAW_BYTES_HASH_MISMATCH']);
const unavailable=await audit({storage:{...storage,readResearchObservation:async()=>{throw Error('DO_NOT_ECHO_SECRET_OR_URL');}},nowIso,policyPins});
assert.equal(unavailable.state,'FILL_NOT_YET_VERIFIABLE');assert(!JSON.stringify(unavailable).includes('DO_NOT_ECHO'));
// A protected origin metadata failure is separately actionable without
// exposing any private blob path, vendor response, ETag or timestamp.
const invalidOrigin=await audit({storage:{...storage,
  readResearchObservation:async()=>{throw Error('CLOUD_BLOB_FORENSIC_VERSION_METADATA_INVALID');}},nowIso,policyPins});
assert.equal(invalidOrigin.state,'FILL_NOT_YET_VERIFIABLE');
assert.equal(invalidOrigin.missingEvidence[0].code,'PRIVATE_EVIDENCE_ORIGIN_METADATA_INVALID');
const requiredOrigin=await audit({storage:{...storage,
  readResearchObservation:async()=>{throw Error('CLOUD_BLOB_FORENSIC_VERSION_METADATA_REQUIRED');}},nowIso,policyPins});
assert.equal(requiredOrigin.missingEvidence[0].code,'PRIVATE_EVIDENCE_ORIGIN_METADATA_REQUIRED');
const invalidOriginalRead=await audit({storage:{...storage,
  readResearchObservation:async()=>{throw Error('CLOUD_BLOB_FORENSIC_EVIDENCE_READ_INVALID');}},nowIso,policyPins});
assert.equal(invalidOriginalRead.missingEvidence[0].code,'PRIVATE_EVIDENCE_ORIGINAL_READ_INVALID');
const noAdapter=await audit({storage:{...storage,readSourceArtifact:undefined},nowIso,policyPins});
assert.equal(noAdapter.state,'FILL_NOT_YET_VERIFIABLE');
let readCount=0;
const changed=await audit({storage:{...storage,async read(){return {body:ledgerBody,etag:++readCount===1?'first':'changed'};}},nowIso,policyPins});
assert.equal(changed.state,'FILL_NOT_YET_VERIFIABLE');
assert.equal(changed.missingEvidence[0].code,'ORIGINAL_JOURNAL_CHANGED_DURING_READ_ONLY_AUDIT');
const delayedSignal={...storage,readResearchObservation:async hash=>hash===signalSnapshot
  ?{...observations.get(hash),uploadedAt:'2026-11-17T09:00:00.000Z'}:observations.get(hash)};
assert.equal((await audit({storage:delayedSignal,nowIso,policyPins})).state,'FILL_INVALID');
const noTimestamp={...storage,readResearchObservation:async hash=>({...observations.get(hash),uploadedAt:null})};
assert.equal((await audit({storage:noTimestamp,nowIso,policyPins})).state,'FILL_NOT_YET_VERIFIABLE');
const unauthFactory=()=>assert.fail('unauthenticated request must never initialize storage');
let response=await handle(new Request('https://fenice.example/api'),{production:true,authorized:false,storageFactory:unauthFactory});
assert.equal(response.status,401);assert.equal((await response.json()).state,'OWNER_AUTH_REQUIRED');
assert.match(response.headers.get('cache-control'),/private, no-store/);
response=await handle(new Request('https://fenice.example/api'),{production:false,authorized:true,storageFactory:unauthFactory});
assert.equal(response.status,403);
response=await handle(new Request('https://fenice.example/api',{method:'POST'}),{production:true,authorized:true,storageFactory:unauthFactory});
assert.equal(response.status,405);
response=await handle(new Request('https://fenice.example/api?policyPins=forged'),{production:true,authorized:true,
  storageFactory:async()=>storage,clock:()=>nowIso});
assert.notEqual((await response.json()).state,'FILL_RIGOROUS_REPLAY_VERIFIED','HTTP never accepts synthetic policy pins');

const rawTest=Buffer.from('Synthetic private read-only raw artifact, not a real source'),rawHash=sha(rawTest);
let sdkReads=0;
const adapter=await createVercelPrivateEodBlobStore({token:'SYNTHETIC_TEST_TOKEN',storeId:'',sdk:{
  async get(path,options){sdkReads++;assert.equal(options.access,'private');assert.equal(options.useCache,false);
    assert.equal(path,'fenice/one-global/private-eod/observations/raw/'+rawHash);
    return {statusCode:200,blob:{size:rawTest.length,uploadedAt:new Date('2026-11-17T17:00:02.000Z')},stream:new Response(rawTest).body};},
  async head(path){assert.equal(path,'fenice/one-global/private-eod/observations/raw/'+rawHash);
    return {size:rawTest.length,uploadedAt:new Date('2026-11-17T17:00:01.456Z')};},
  async put(){assert.fail('read-only evidence read attempted a write');}}});
const exactMetadata=await adapter.readSourceArtifact(rawHash);
assert.deepEqual(exactMetadata.body,rawTest);
assert.equal(exactMetadata.uploadedAt.toISOString(),'2026-11-17T17:00:01.456Z');
assert.equal(exactMetadata.httpLastModified.toISOString(),'2026-11-17T17:00:02.000Z');
assert.equal(exactMetadata.uploadedAtSource,'VERCEL_CONTROL_PLANE_HEAD');
await assert.rejects(adapter.readSourceArtifact('../original-ledger.json'),/FORENSIC_HASH_INVALID/);
assert.equal(sdkReads,1,'invalid paths rejected before SDK access');
const route=readFileSync('app/api/paper/one-global-private-forensic/route.js','utf8');
assert.match(route,/verifyFeniceOwnerSession/);assert.match(route,/isOwnerAuthorized/);
assert.match(route,/pinOneGlobalRecoveredOriginalStore/);
assert.match(readFileSync('app/api/paper/one-global-private-signal-cycle/route.js','utf8'),/AUDIT_SECOND_FILL_READ_ONLY/);
assert.doesNotMatch(route,/export async function (?:POST|PUT|PATCH|DELETE)|console\.|\.put\(|\.compareAndSwap\(/);

// Synthetic US second FILL AFTER an independent Milan FILL. All private
// originals are supplied entirely in memory: no production Blob, API or CAS.
const usSignalDate='2026-11-17',usFillDate='2026-11-18';
const usResearchAt='2026-11-17T21:30:00.000Z',usSignalAt='2026-11-17T21:31:00.000Z';
const usFillAt='2026-11-18T22:30:00.000Z',usReceiptAt='2026-11-18T22:20:00.000Z';
const usBars={},usDate=new Date('2026-11-17T12:00:00.000Z');
for(let n=0;n<25;){
  if(![0,6].includes(usDate.getUTCDay())){
    usBars[usDate.toISOString().slice(0,10)]={'4. close':String(180-n)};n++;
  }
  usDate.setUTCDate(usDate.getUTCDate()-1);
}
const usPriorAlpha=Buffer.from(JSON.stringify({'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':usBars}));
const usPriorEodhd=Buffer.from(JSON.stringify([{date:usSignalDate,close:180}]));
const usReport=buildFirstPaperFreeEodEvidence({alphaRaw:usPriorAlpha,eodhdRaw:usPriorEodhd,
  symbol:'AAPL',sessionDate:usSignalDate,observedAt:usResearchAt});
assert.equal(usReport.researchIndicator,'UPTREND_RESEARCH_ONLY');
const usSignalSnapshot=digest(usReport),usSignalOriginal={
  version:1,kind:'ONE_GLOBAL_PRIVATE_RESEARCH_SOURCE_OBSERVATION',report:usReport,
  alphaRawBase64:usPriorAlpha.toString('base64'),
  eodhdRawBase64:usPriorEodhd.toString('base64'),
  paperSettlementEligible:false,liveTradingAllowed:false};
observations.set(usSignalSnapshot,{body:Buffer.from(JSON.stringify(usSignalOriginal)+'\n'),
  uploadedAt:'2026-11-17T21:30:00.100Z',uploadedAtSource:'VERCEL_CONTROL_PLANE_HEAD'});
const usBefore=buildOneGlobalProspectiveSignalFromDualEod({
  report:usReport,previousLedger:ledger,nowIso:usSignalAt}).ledger;
const usSignal=usBefore.events.at(-1);
const usDocuments=[],usDoc=(kind,value)=>{
  const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));
  const h=sha(bytes);usDocuments.push({kind,sha256:h,bodyBase64:bytes.toString('base64')});return h;
};
const usAuthority={...authority,approvedAt:'2026-11-16T12:00:00.000Z',
  expiresAt:'2026-12-01T00:00:00.000Z'};
const usAuthoritySha=usDoc('ORIGINAL_OWNER_PAPER_CONSENT',usAuthority);
const usSources=[],usRights=[];
for(const [id,symbol] of [['alpha-vantage','AAPL'],['eodhd','AAPL.US']]){
  const provenanceSha=usDoc('PROVIDER_UPSTREAM_PROVENANCE',
    'SYNTHETIC OWNER-REVIEWED NON-PRODUCTION UPSTREAM EVIDENCE '+id);
  const rightSha=usDoc('ORIGINAL_PROVIDER_USAGE_RIGHTS',
    'SYNTHETIC OWNER-REVIEWED PRIVATE PAPER RIGHTS '+id);
  usSources.push({providerId:id,key:'XNAS:AAPL',mic:'XNAS',currency:'USD',symbol,
    sourceFamily:id,independenceEvidenceSha256:provenanceSha,
    reviewedByOwner:true,reviewedAt:'2026-11-17T18:00:00.000Z'});
  usRights.push({providerId:id,mic:'XNAS',currency:'USD',evidenceSha256:rightSha,
    usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedUseAllowed:true,
    validUntil:'2026-12-31T23:59:59.000Z',reviewedByOwner:true});
}
const usOpenedAt='2026-11-18T14:30:00.000Z',usClosedAt='2026-11-18T21:00:00.000Z';
const usSessionSha=usDoc('ORIGINAL_EXCHANGE_SESSION',
  'SYNTHETIC reviewed XNAS November 18 regular session evidence, not exchange proof');
const usContext={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority:usAuthority,
  authorityEvidenceSha256:usAuthoritySha,documents:usDocuments,
  markets:[{key:'XNAS:AAPL',mic:'XNAS',currency:'USD',
    sources:usSources,ownerReviewedRights:usRights}],
  sessions:[{mic:'XNAS',sessionDate:usFillDate,sessionOpenedAt:usOpenedAt,
    sessionClosedAt:usClosedAt,evidenceSha256:usSessionSha,
    reviewedByOwner:true,reviewedAt:'2026-11-17T18:00:00.000Z'}]};
const usCloseAlpha=Buffer.from(JSON.stringify({'Meta Data':{'2. Symbol':'AAPL'},
  'Time Series (Daily)':{[usFillDate]:{'4. close':'181'}}}));
const usCloseEodhd=Buffer.from(JSON.stringify([{date:usFillDate,close:181.05}]));
const usFillRaws=[usCloseAlpha,usCloseEodhd];
const usReceipts=usSources.map((source,i)=>({
  providerId:source.providerId,sourceFamily:source.sourceFamily,
  key:'XNAS:AAPL',mic:'XNAS',currency:'USD',sessionDate:usFillDate,
  close:i===0?181:181.05,payloadSha256:sha(usFillRaws[i]),
  publishedAt:usReceiptAt,observedAt:usReceiptAt,
  timestampMeaning:'FIRST_OBSERVED_AT_HTTPS_FETCH_NOT_VENDOR_RELEASE',
  transport:'FIXED_HTTPS_ORIGIN_NO_REDIRECT',simulatedOrSynthetic:false}));
const usEcbRaw=Buffer.from("<?xml version='1.0'?><gesmes:Envelope><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender><Cube xmlns='eurofxref'><Cube time='2026-11-17'><Cube currency='USD' rate='1.1'/></Cube></Cube></gesmes:Envelope>");
const usFx=selectOneGlobalEcbCurrencyReference({raw:usEcbRaw,
  currency:'USD',sessionDate:usFillDate,observedAt:usReceiptAt});
const usMarket={sessionDate:usFillDate,sessionOpenedAt:usOpenedAt,
  sessionClosedAt:usClosedAt,providerReceipts:usReceipts};
const usSettleOriginal={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_SOURCE_OBSERVATION',
  signalHash:usSignal.hash,context:usContext,
  contextSha256:sha(JSON.stringify(usContext,null,2)+'\n'),
  marketEvidence:usMarket,providerRaw:usSources.map((source,i)=>({
    providerId:source.providerId,rawBase64:usFillRaws[i].toString('base64')})),
  fxEvidence:usFx,ecbRawBase64:usEcbRaw.toString('base64'),
  sourceRightsIndependentlyCertified:false,liveTradingAllowed:false,
  brokerConnectivityAllowed:false};
const usSettleHash=digest(usSettleOriginal);
observations.set(usSettleHash,{body:Buffer.from(JSON.stringify(usSettleOriginal)+'\n'),
  uploadedAt:'2026-11-18T22:20:00.100Z',uploadedAtSource:'VERCEL_CONTROL_PLANE_HEAD'});
const usLedger=settleOneGlobalEodSignal({previousLedger:usBefore,nowIso:usFillAt,
  signalHash:usSignal.hash,marketEvidence:usMarket,ownerReviewedRights:usRights,
  authority:usAuthority,fxEvidence:usFx,
  settlementEvidenceArchiveSha256:usSettleHash}).ledger;
const usLedgerBody=JSON.stringify(usLedger);
const usStorage={...storage,async read(){return {body:usLedgerBody,etag:'synthetic-us-second'};}};
const usAudit=await audit({storage:usStorage,nowIso:'2026-11-19T00:00:00.000Z',
  policyPins,fillOrdinal:2});
assert.equal(usAudit.state,'FILL_RIGOROUS_REPLAY_VERIFIED',JSON.stringify(usAudit));
assert.equal(usAudit.checks.length,10);
assert.equal(usAudit.accounting.cashBeforeEuro,ledger.cashEuro);
assert.equal(usAudit.certifiedTrades,0);
assert.equal(usAudit.liveTradingAllowed,false);
assert.equal(publicOneGlobalSecondFillForensicSummary(usAudit).checksPassed,10);
assert.equal(publicOneGlobalSecondFillForensicSummary(usAudit).secondFillForensicallyVerified,true);
assert.equal(usLedgerBody,JSON.stringify(usLedger),'original synthetic US journal unchanged');
const usCorruptResearch={...usStorage,
  async readResearchObservation(hash){
    if(hash!==usSignalSnapshot)return observations.get(hash);
    const modified={...usSignalOriginal,alphaRawBase64:Buffer.from('MODIFIED SYNTHETIC VENDOR BYTES').toString('base64')};
    return {...observations.get(hash),body:Buffer.from(JSON.stringify(modified))};
  }};
const usCorrupt=await audit({storage:usCorruptResearch,
  nowIso:'2026-11-19T00:00:00.000Z',policyPins,fillOrdinal:2});
assert.equal(usCorrupt.state,'FILL_INVALID');
assert(usCorrupt.defects.includes('US_SIGNAL_RAW_HASH_MISMATCH'));
const usUntrusted={...usStorage,
  async readResearchObservation(hash){
    return hash===usSettleHash
      ?{...observations.get(hash),uploadedAtSource:'HTTP_LAST_MODIFIED'}
      :observations.get(hash);
  }};
const usUntrustedResult=await audit({storage:usUntrusted,
  nowIso:'2026-11-19T00:00:00.000Z',policyPins,fillOrdinal:2});
assert.equal(usUntrustedResult.state,'FILL_NOT_YET_VERIFIABLE');
assert.equal(usUntrustedResult.missingEvidence[0].code,'PRIVATE_EVIDENCE_ORIGIN_METADATA_REQUIRED');
const usLateStorage={...usStorage,
  async readResearchObservation(hash){
    return hash===usSettleHash
      ?{...observations.get(hash),uploadedAt:'2026-11-18T22:31:00.000Z'}
      :observations.get(hash);
  }};
const usLate=await audit({storage:usLateStorage,
  nowIso:'2026-11-19T00:00:00.000Z',policyPins,fillOrdinal:2});
assert.equal(usLate.state,'FILL_NOT_YET_VERIFIABLE');
assert.equal(usLate.missingEvidence[0].code,'SETTLEMENT_ARCHIVE_PRECOMMIT_TIMESTAMP_NOT_PROVEN');
console.log('PASS synthetic US SECOND FILL forensic: original inline receipts, original research, ECB FX, account replay, safe 10-check classification, corruption and late-archive refusal; no real PAPER credit.');

console.log('PASS read-only original-fill audit: raw evidence replay, exact event/account/hash reproduction, prior-session signal, policies/calendar/discovery, corruption/missing/race/late-archive rejection, owner-only HTTP, no writes or private raw exports. SYNTHETIC ONLY.');
