import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {auditOneGlobalFirstPrivateFill as audit,handleOneGlobalPrivateForensicRequest as handle} from '../lib/trading/one-global-private-forensic-audit.mjs';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,settleOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {buildOneGlobalEuDualVenueReport,oneGlobalEuReceipt,oneGlobalMilanSession} from '../lib/market/one-global-eu-delayed-eod.mjs';
import {createVercelPrivateEodBlobStore} from '../lib/trading/one-global-vercel-private-blob-store.mjs';

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
function primary(date,close){
  const row=(time,price,id)=>[`${date}T${time}.000000Z`,`${date}T${time}.001000Z`,isin,price,100,'MONE','EUR','1','-','-','-','-','-','-','MTAA','',id,'','-','MTAA'].join(',');
  const rows=Array.from({length:12},(_,i)=>row('08:'+String(i).padStart(2,'0')+':00',9.7+i*.01,'REGULAR'+i));
  rows.push(row('16:29:59',close-.01,'REGULARLAST'),row('16:35:09',close,'AUCTION0001'));
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
const absent=await audit({storage:{...storage,readSourceArtifact:async()=>null},nowIso,policyPins});
assert.equal(absent.state,'FILL_NOT_YET_VERIFIABLE');assert.match(absent.missingEvidence[0].path,/observations\/raw\/[a-f0-9]{64}$/);
const corrupt=await audit({storage:{...storage,readSourceArtifact:async()=>({body:Buffer.from('CORRUPTED ORIGINAL BYTES')})},nowIso,policyPins});
assert.equal(corrupt.state,'FILL_INVALID');assert.deepEqual(corrupt.defects,['ARCHIVED_RAW_BYTES_HASH_MISMATCH']);
const unavailable=await audit({storage:{...storage,readResearchObservation:async()=>{throw Error('DO_NOT_ECHO_SECRET_OR_URL');}},nowIso,policyPins});
assert.equal(unavailable.state,'FILL_NOT_YET_VERIFIABLE');assert(!JSON.stringify(unavailable).includes('DO_NOT_ECHO'));
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
    return {statusCode:200,blob:{size:rawTest.length},stream:new Response(rawTest).body};},
  async put(){assert.fail('read-only evidence read attempted a write');}}});
assert.deepEqual((await adapter.readSourceArtifact(rawHash)).body,rawTest);
await assert.rejects(adapter.readSourceArtifact('../original-ledger.json'),/FORENSIC_HASH_INVALID/);
assert.equal(sdkReads,1,'invalid paths rejected before SDK access');
const route=readFileSync('app/api/paper/one-global-private-forensic/route.js','utf8');
assert.match(route,/verifyFeniceOwnerSession/);assert.match(route,/isOwnerAuthorized/);
assert.match(route,/pinOneGlobalRecoveredOriginalStore/);
assert.doesNotMatch(route,/export async function (?:POST|PUT|PATCH|DELETE)|console\.|\.put\(|\.compareAndSwap\(/);
console.log('PASS read-only original-fill audit: raw evidence replay, exact event/account/hash reproduction, prior-session signal, policies/calendar/discovery, corruption/missing/race/late-archive rejection, owner-only HTTP, no writes or private raw exports. SYNTHETIC ONLY.');
