import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {
  buildOneGlobalEuDualVenueReport,
  CBOE_POLICY_URL,
  ONE_GLOBAL_EU_RIGHTS_DOCUMENTS,
  discoverOneGlobalCboeCeuxMinute,
  extractOneGlobalEuronextCsv,
  fetchOneGlobalCboeCeuxFile,
  fetchOneGlobalEuronextMilanFile,
  oneGlobalEuReceipt,
  oneGlobalMilanSession,
  parseOneGlobalCboeCeux,
  parseOneGlobalEuronextMilan,
} from '../lib/market/one-global-eu-delayed-eod.mjs';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,replayOneGlobalEodPaperLedger,
  settleOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {inspectOneGlobalEuSourceAccess,runOneGlobalCloudEuProspectiveCycle} from '../lib/trading/one-global-cloud-eu-prospective-cycle.mjs';
import {refreshExistingEuRights} from '../lib/trading/one-global-eu-evidence-context.mjs';
import {oneGlobalReviewSubjectSha256,validOneGlobalEvidenceReview} from '../lib/trading/one-global-technical-review.mjs';

// Every value in this file is synthetic. The test validates the strict parser
// and official-interface contract; it does not claim a real market observation.
const sessionDate='2026-11-13',isin='IT0003128367';
const HEADER=['TradingDateTime','PublicationDateTime','MifidInstrumentID','MifidPrice','MifidQuantity',
  'MifidPriceNotation','MifidCurrency','MmtMarketMechanism','MmtNegotiationIndicator','MmtModificationIndicator',
  'MmtBenchMarkIndicator','MmtContributionToPrice','MmtAlgorithmicIndicator','MmtPublicationMode','Venue',
  'ThirdCountryTradingVenueExecution','TradeUniqueIdentifier','MissingPrice','MmtContingentTransactionIndicator','VenueOfPublication'];

let crcTable;
function crc32(bytes){
  crcTable??=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
function zipCsv(csv){
  const name=Buffer.from('Trades_Equities.csv'),data=Buffer.from(csv),compressed=deflateRawSync(data),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(0,42);
  const offset=local.length+name.length+compressed.length,eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50);
  eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(central.length+name.length,12);eocd.writeUInt32LE(offset,16);
  return Buffer.concat([local,name,compressed,central,name,eocd]);
}
const q=value=>'"'+String(value).replaceAll('"','""')+'"';
function euronextRow({tradeAt,price,quantity=100,id,venue='MTAA'}){
  return [tradeAt,tradeAt.replace('000000Z','001000Z'),isin,price,quantity,'MONE','EUR','1','-','-','-','-','-','-',venue,'',id,'','-',venue].map(q).join(',');
}
function euronextCsv({auctionPrices=['10.0000000'],venue='MTAA'}={}){
  const rows=[];
  for(let i=0;i<12;i++)rows.push(euronextRow({tradeAt:`2026-11-13T${String(8+i<16?8+i:16).padStart(2,'0')}:${i<8?'00':String(20+i).padStart(2,'0')}:00.000000Z`,
    price:(9.70+i*.02).toFixed(7),quantity:100+i,id:'REGULAR'+String(i).padStart(3,'0'),venue}));
  rows.push(euronextRow({tradeAt:'2026-11-13T16:29:59.000000Z',price:'9.9600000',quantity:500,id:'REGULAR999',venue}));
  auctionPrices.forEach((price,i)=>rows.push(euronextRow({tradeAt:`2026-11-13T16:35:${String(i).padStart(2,'0')}.000000Z`,price,quantity:1000,id:'AUCTION'+i,venue})));
  return '(c) 2026 Euronext N.V. All Rights Reserved.\n'+HEADER.join(',')+'\n'+rows.join('\n')+'\n';
}
function cboeCsv({venue='CEUX',condition='',price='9.9900'}={}){
  return [
    `2026-11-13 16:28:59.000000,${isin},1.0000,EUR,MONE,1,${venue},CLOB,2026-11-13 16:28:59.001000,${venue},EARLY01,\"${condition}\"`,
    `2026-11-13 16:29:20.000000,${isin},9.9800,EUR,MONE,10,${venue},CLOB,2026-11-13 16:29:20.001000,${venue},ELIGIBLE01,\"${condition}\"`,
    `2026-11-13 16:29:59.000000,${isin},${price},EUR,MONE,20,${venue},CLOB,2026-11-13 16:29:59.001000,${venue},ELIGIBLE02,\"${condition}\"`,
  ].join('\n')+'\n';
}

const csv=euronextCsv(),zip=zipCsv(csv),cboe=Buffer.from(cboeCsv());
assert.equal(extractOneGlobalEuronextCsv(zip).toString(),csv);
assert.deepEqual(oneGlobalMilanSession(sessionDate),{
  sessionDate,sessionOpenedAt:'2026-11-13T08:00:00.000Z',continuousEndedAt:'2026-11-13T16:30:00.000Z',
  closingAuctionNominalAt:'2026-11-13T16:35:00.000Z',sessionClosedAt:'2026-11-13T16:35:30.000Z',
  cboeSessionClosedAt:'2026-11-13T16:30:00.000Z',
});
const primary=parseOneGlobalEuronextMilan({raw:zip,isin,sessionDate});
assert.equal(primary.close,10);assert.equal(primary.open,9.7);assert.equal(primary.observedVenueMic,'MTAA');
assert.equal(primary.priceSemantics,'PRIMARY_CLOSING_AUCTION');assert(primary.vwap>9.7&&primary.vwap<9.96);
const secondary=parseOneGlobalCboeCeux({raw:cboe,isin,sessionDate});
assert.equal(secondary.close,9.99);assert.equal(secondary.tradeAt,'2026-11-13T16:29:59.000Z');
assert.equal(secondary.priceSemantics,'INDEPENDENT_VENUE_LAST_REGULAR_TRADE');
const report=buildOneGlobalEuDualVenueReport({euronextRaw:zip,cboeRaw:cboe,symbol:'ENEL',sessionDate,
  observedAt:'2026-11-13T17:00:00.000Z'});
assert.equal(report.researchIndicator,'UPTREND_RESEARCH_ONLY');assert(report.closeDifferencePct<.5);
assert.equal(report.paperSettlementEligible,false);assert.equal(report.certifiedVirtualFills,0);
const signal={key:'XMIL:ENEL',mic:'XMIL',currency:'EUR'};
const primaryReceipt=oneGlobalEuReceipt({source:{providerId:'euronext-mifir',sourceFamily:'euronext-mtaa-primary',symbol:isin},
  signal,sessionDate,raw:zip,observedAt:'2026-11-13T17:00:00.000Z'});
const secondaryReceipt=oneGlobalEuReceipt({source:{providerId:'cboe-eu-mifir',sourceFamily:'cboe-ceux-orderbook',symbol:isin},
  signal,sessionDate,raw:cboe,observedAt:'2026-11-13T17:00:00.000Z'});
assert.equal(primaryReceipt.observedVenueMic,'MTAA');assert.equal(secondaryReceipt.observedVenueMic,'CEUX');
assert.notEqual(primaryReceipt.payloadSha256,secondaryReceipt.payloadSha256);

const euSignal=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),nowIso:'2026-11-12T17:15:00.000Z',signal:{
  signalId:'synthetic-xmil-enel-eu-settlement',key:'XMIL:ENEL',mic:'XMIL',currency:'EUR',side:'BUY',
  decisionAt:'2026-11-12T17:15:00.000Z',referenceSessionDate:'2026-11-12',referenceCloseAt:'2026-11-12T16:35:00.000Z',
  referencePublishedAt:'2026-11-12T17:00:00.000Z',sourceSnapshotHash:'e'.repeat(64),maxNotionalEuro:50,
  strategyReason:'UPTREND_CONFIRMATION',researchSignalOnly:true,sourceRightsIndependentlyCertified:false,
}});
const authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,approvedForVirtualSimulation:true,
  approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',
  allowBackfill:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,
  strategyPerformanceCertified:false,approvedAt:'2026-11-11T18:00:00.000Z',expiresAt:'2026-12-01T00:00:00.000Z'};
const syntheticRights=['euronext-mifir','cboe-eu-mifir'].map((providerId,i)=>({providerId,mic:'XMIL',currency:'EUR',
  evidenceSha256:String(i+1).repeat(64),usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',reviewedByOwner:true,
  automatedUseAllowed:true,validUntil:'2026-12-31T23:59:59.000Z'}));
const euMarketEvidence={...oneGlobalMilanSession(sessionDate),providerReceipts:[primaryReceipt,secondaryReceipt]};
const settled=settleOneGlobalEodSignal({previousLedger:euSignal.ledger,nowIso:'2026-11-13T17:10:00.000Z',
  signalHash:euSignal.signalHash,marketEvidence:euMarketEvidence,ownerReviewedRights:syntheticRights,authority});
assert.equal(settled.ledger.events.at(-1).kind,'FILL');assert.equal(replayOneGlobalEodPaperLedger(settled.ledger).virtualBuys,1);
const forgedSemantics=structuredClone(euMarketEvidence);forgedSemantics.providerReceipts[1].priceSemantics='PRIMARY_CLOSING_AUCTION';
assert.throws(()=>settleOneGlobalEodSignal({previousLedger:euSignal.ledger,nowIso:'2026-11-13T17:10:00.000Z',
  signalHash:euSignal.signalHash,marketEvidence:forgedSemantics,ownerReviewedRights:syntheticRights,authority}),
  /EU_VENUE_INDEPENDENCE_OR_PRICE_SEMANTICS_INVALID/);

const discoveryUrl='https://cdn.cboe.com/data/europe/equities/delayed_data/eqt_trade_CEUX/0123456789/minute/eqt_trade_CEUX_20261113_1629.csv';
const discovery=Buffer.from(JSON.stringify({daily:[],minute:[{filename:'eqt_trade_CEUX_20261113_1629.csv',serveUrl:discoveryUrl}]}));
assert.equal(discoverOneGlobalCboeCeuxMinute({apiRaw:discovery,sessionDate}),discoveryUrl);
const ambiguous=Buffer.from(JSON.stringify({daily:[],minute:[
  {filename:'eqt_trade_CEUX_20261113_1629.csv',serveUrl:discoveryUrl},
  {filename:'eqt_trade_CEUX_20261113_1629.csv',serveUrl:discoveryUrl.replace('0123456789','abcdef0123')},
]}));
assert.throws(()=>discoverOneGlobalCboeCeuxMinute({apiRaw:ambiguous,sessionDate}),
  /CBOE_EXACT_MINUTE_LINK_MISSING_OR_AMBIGUOUS/);

const calls=[];
const fetcher=async(url,init)=>{
  const href=String(url);calls.push(href);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
  if(href.includes('marketdata.euronext.com'))return new Response(zip);
  if(href.startsWith('https://www-api.cboe.com/europe/equities/transparency_data/get_file_map?')){
    const u=new URL(href);assert.deepEqual(Object.fromEntries(u.searchParams),
      {category:'equities',venue:'dxe',trade_type:'trade',date:sessionDate});return new Response(discovery);
  }
  if(href===discoveryUrl)return new Response(cboe);
  throw Error('unexpected synthetic URL');
};
assert.equal((await fetchOneGlobalEuronextMilanFile({fetcher})).raw.equals(zip),true);
assert.equal((await fetchOneGlobalCboeCeuxFile({sessionDate,fetcher})).raw.equals(cboe),true);
assert.equal(calls.length,3);

let accessArtifacts=0,accessObservations=0,accessContexts=0;
const accessStore={
  async createSourceArtifact({hash,body,contentType}){assert.equal(createHash('sha256').update(body).digest('hex'),hash);
    assert(['application/zip','text/csv','application/json'].includes(contentType));accessArtifacts++;return {created:true,verified:true};},
  async createResearchObservation({hash,body}){const value=JSON.parse(body);assert.equal(value.kind,'ONE_GLOBAL_PRIVATE_EU_SOURCE_ACCESS_OBSERVATION');
    assert.match(hash,/^[a-f0-9]{64}$/);accessObservations++;return {created:true};},
};
const access=await inspectOneGlobalEuSourceAccess({storage:accessStore,clock:()=>'2026-11-14T17:15:00.000Z',fetcher,
  ensureEvidenceContext:async input=>{assert.equal(input.rawEvidence.sessionDate,sessionDate);accessContexts++;return {changed:true};}});
assert.equal(access.state,'EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED');assert.equal(access.sourcePairsReceived,1);
assert.equal(access.rawArtifactsVerified,true);assert.equal(access.rightsEvidenceConnected,true);
assert.equal(accessArtifacts,3);assert.equal(accessObservations,1);assert.equal(accessContexts,1);
const blockedAccess=await inspectOneGlobalEuSourceAccess({storage:accessStore,clock:()=>'2026-11-14T17:15:00.000Z',
  fetcher:async()=>{throw Error('synthetic network failure');}});
assert.equal(blockedAccess.state,'EU_SOURCE_ACCESS_NOT_CONFIRMED');
assert.equal(blockedAccess.blocker,'EU_DELAYED_EOD_TRANSPORT_UNAVAILABLE');

const damaged=Buffer.from(zip);damaged[60]^=1;
assert.throws(()=>extractOneGlobalEuronextCsv(damaged),/EU_DELAYED_EOD_ZIP_(?:INFLATE_INVALID|INTEGRITY_MISMATCH)/);
assert.throws(()=>parseOneGlobalEuronextMilan({raw:Buffer.from(euronextCsv({venue:'XPAR'})),isin,sessionDate}),/EURONEXT_SESSION_INCOMPLETE/);
assert.throws(()=>parseOneGlobalEuronextMilan({raw:Buffer.from(euronextCsv({auctionPrices:['10.0','10.1']})),isin,sessionDate}),
  /EURONEXT_AUCTION_PRICE_AMBIGUOUS/);
assert.throws(()=>parseOneGlobalCboeCeux({raw:Buffer.from(cboeCsv({venue:'BATE'})),isin,sessionDate}),/CBOE_EXACT_PRECLOSE_TRADE_MISSING/);
assert.throws(()=>parseOneGlobalCboeCeux({raw:Buffer.from(cboeCsv({condition:'CANC'})),isin,sessionDate}),/CBOE_EXACT_PRECLOSE_TRADE_MISSING/);
assert.throws(()=>buildOneGlobalEuDualVenueReport({euronextRaw:zip,cboeRaw:Buffer.from(cboeCsv({price:'9.0000'})),
  symbol:'ENEL',sessionDate,observedAt:'2026-11-13T17:00:00.000Z'}).closeDifferencePct>.5?(()=>{throw Error('divergent');})():null,/divergent/);

// Full synthetic cloud path: private raw archive -> exact evidence callback ->
// one forward SIGNAL CAS. It must never manufacture a same-day or test FILL.
const existing=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),nowIso:'2026-11-12T06:00:00.000Z',signal:{
  signalId:'synthetic-existing-asx-eu-cycle',key:'XASX:FIXTURE',mic:'XASX',currency:'AUD',side:'BUY',
  decisionAt:'2026-11-12T06:00:00.000Z',referenceSessionDate:'2026-11-12',referenceCloseAt:'2026-11-12T05:11:00.000Z',
  referencePublishedAt:'2026-11-12T05:30:00.000Z',sourceSnapshotHash:'f'.repeat(64),maxNotionalEuro:50,
  strategyReason:'UPTREND_CONFIRMATION',researchSignalOnly:true,sourceRightsIndependentlyCertified:false,
}}).ledger;
function memory(ledger=existing){
  let body=ledger===null?null:JSON.stringify(ledger),etag='"eu-1"',writes=0,observations=0,artifacts=0;
  return {privateAccess:true,durable:true,atomicCompareAndSwap:true,
    async read(){return body===null?null:{body,etag};},
    async createSourceArtifact({hash,body:raw,contentType}){assert.equal(createHash('sha256').update(raw).digest('hex'),hash);
      assert(['application/zip','text/csv','application/json'].includes(contentType));artifacts++;return {created:true,verified:true};},
    async createResearchObservation({hash,body:observation}){const parsed=JSON.parse(observation);
      assert.equal(createHash('sha256').update(JSON.stringify(parsed.report)).digest('hex'),hash);observations++;return {created:true};},
    async compareAndSwap(input){assert.equal(input.expectedEtag,etag);body=input.body;etag='"eu-2"';writes++;return {committed:true,etag};},
    get ledger(){return body===null?null:JSON.parse(body);},get writes(){return writes;},get observations(){return observations;},get artifacts(){return artifacts;},
  };
}
const cycleNow='2026-11-13T17:15:00.000Z';let evidenceCalls=0;
const ensureEvidenceContext=async input=>{evidenceCalls++;assert.equal(input.sessionDate,'2026-11-16');
  assert.equal(input.rawEvidence.sessionDate,sessionDate);assert.match(input.rawEvidence.euronextHash,/^[a-f0-9]{64}$/);return {changed:true};};
const cycleStore=memory();
const cycle=await runOneGlobalCloudEuProspectiveCycle({storage:cycleStore,clock:()=>cycleNow,fetcher,ensureEvidenceContext});
assert.equal(cycle.state,'EU_PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE');assert.equal(cycle.newSignals,1);
assert.equal(cycle.paperFillsCreated,0);assert.equal(cycleStore.writes,1);assert.equal(cycleStore.observations,1);
assert.equal(cycleStore.artifacts,3);assert.equal(evidenceCalls,1);
assert.deepEqual(cycleStore.ledger.events.slice(0,existing.events.length),existing.events);
assert.equal(cycleStore.ledger.events.at(-1).kind,'SIGNAL');assert.equal(cycleStore.ledger.events.at(-1).key,'XMIL:ENEL');
assert.equal(replayOneGlobalEodPaperLedger(cycleStore.ledger).virtualBuys,0);
const repeated=await runOneGlobalCloudEuProspectiveCycle({storage:cycleStore,clock:()=>cycleNow,fetcher,ensureEvidenceContext});
assert.equal(repeated.state,'EU_SESSION_SIGNAL_ALREADY_COMMITTED');assert.equal(cycleStore.writes,1);assert.equal(evidenceCalls,1);
const weekendStore=memory();
const weekend=await runOneGlobalCloudEuProspectiveCycle({storage:weekendStore,clock:()=>'2026-11-14T17:15:00.000Z',
  fetcher:async()=>{throw Error('weekend must not fetch');},ensureEvidenceContext});
assert.equal(weekend.state,'EU_OUTSIDE_POSTCLOSE_WINDOW');assert.equal(weekendStore.artifacts,0);assert.equal(weekendStore.writes,0);
await assert.rejects(runOneGlobalCloudEuProspectiveCycle({storage:memory(null),clock:()=>cycleNow,fetcher,ensureEvidenceContext}),/ORIGINAL_JOURNAL_REQUIRED/);

// Policy rollover is a precise, document-hash-bound technical review.
assert.equal(CBOE_POLICY_URL,ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.cboe.url);
assert.equal(ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.cboe.sha256,
  'f7b94db1c37c79cb9deb63dca855907ff0f30db08ce40bc20f6c093b1a59929a');
assert.match(CBOE_POLICY_URL,/Cboe_Europe_Data_Policy_August_2026\\.pdf$/);
const digest=x=>createHash('sha256').update(x).digest('hex');
function fixtureDocument(kind,value){
  const raw=Buffer.from(JSON.stringify(value));return {kind,sha256:digest(raw),bodyBase64:raw.toString('base64')};
}
const authHash='a'.repeat(64), reviewedAt='2026-11-14T23:20:00.000Z',
  revisionNow='2026-11-15T10:30:00.000Z';
function fixtureReview(subject,scope,proof){
  const x={...subject,reviewedByOwner:false,reviewedAt};
  x.technicalReview={kind:'DELEGATED_PROJECT_TECHNICAL_REVIEW',
    reviewer:{role:'DELEGATED_PROJECT_OPERATOR',name:'Codex'},scope,
    outcome:'APPROVED_FOR_DOCUMENTED_SCOPE',evidenceSha256:proof,
    authoritySnapshotHash:authHash,reviewedAt,
    reviewedCommit:'4611b2d31fa4a7c45a45cabd5fb531f79a639fc8',
    basis:'Synthetic historical public document review with exact verified original hash',
    subjectSha256:oneGlobalReviewSubjectSha256(x)};
  return x;
}
const pIds=['euronext-mifir','cboe-eu-mifir'];
const provenance=pIds.map(providerId=>fixtureDocument('OFFICIAL_PROVIDER_UPSTREAM_PROVENANCE_CAPTURE',
  {providerId,proof:'SYNTHETIC_MIC_SEPARATE_VENUE'}));
const rightCurrentEuronext=fixtureDocument('OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE',
  {version:1,providerId:pIds[0],usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',
    originalDocumentSha256:ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.euronext.sha256});
const rightOldCboe=fixtureDocument('OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE',
  {version:1,providerId:pIds[1],usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',
    originalDocumentSha256:'9319ca470aa4cf8fb243b0ae3139f87a7936ea7c2ddf1c0c9e78e8743c2fd228'});
const rightNewCboe=fixtureDocument('OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE',
  {version:1,providerId:pIds[1],usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',
    originalDocumentSha256:ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.cboe.sha256});
const fixtureDocuments=[...provenance,rightCurrentEuronext,rightOldCboe,rightNewCboe];
const fixtureSources=pIds.map((providerId,i)=>fixtureReview({
  providerId,key:'XMIL:ENEL',mic:'XMIL',currency:'EUR',symbol:isin,
  sourceFamily:i?'cboe-ceux-orderbook':'euronext-mtaa-primary',
  independenceEvidenceSha256:provenance[i].sha256},'SOURCE_MAPPING',provenance[i].sha256));
const fixtureRights=[rightCurrentEuronext,rightOldCboe].map((doc,i)=>fixtureReview({
  providerId:pIds[i],mic:'XMIL',currency:'EUR',evidenceSha256:doc.sha256,
  usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedUseAllowed:true,
  validUntil:'2026-12-31T23:59:59.000Z'},'PROVIDER_USAGE_RIGHTS',doc.sha256));
const existingMarket={key:'XMIL:ENEL',mic:'XMIL',currency:'EUR',
  sources:fixtureSources,ownerReviewedRights:fixtureRights};
const reviewArgs={existing:existingMarket,instrument:{key:'XMIL:ENEL',isin},
  documents:fixtureDocuments,euronextRights:rightCurrentEuronext.sha256,
  cboeRights:rightNewCboe.sha256,authoritySnapshotHash:authHash,nowIso:revisionNow};
const upgraded=refreshExistingEuRights(reviewArgs);
assert.equal(upgraded.changed,true);
assert.deepEqual(existingMarket.ownerReviewedRights,fixtureRights,'Never mutate original review');
assert.deepEqual(upgraded.market.sources,fixtureSources,'Never rewrite source provenance');
assert.equal(upgraded.market.ownerReviewedRights[0],fixtureRights[0],
  'No re-review for unchanged Euronext policy');
const refreshed=upgraded.market.ownerReviewedRights[1];
assert.equal(refreshed.reviewedByOwner,false,'Never forge owner approval');
assert.equal(refreshed.evidenceSha256,rightNewCboe.sha256);
assert.equal(refreshed.technicalReview.reviewedCommit,
  'd47aa43e0baa2c61803b75c70393b07601b28012');
assert.equal(validOneGlobalEvidenceReview({subject:refreshed,scope:'PROVIDER_USAGE_RIGHTS',
  evidenceSha256:rightNewCboe.sha256,authoritySnapshotHash:authHash,nowIso:revisionNow}),true);
const stable=refreshExistingEuRights({...reviewArgs,existing:upgraded.market});
assert.equal(stable.changed,false,'Idempotent repeated policy review');
assert.equal(stable.market,upgraded.market);
assert.throws(()=>refreshExistingEuRights({...reviewArgs,
  documents:fixtureDocuments.filter(d=>d.sha256!==rightNewCboe.sha256)}),
  /CURRENT_POLICY_REVIEW_REQUIRED/,'Never upgrade without new official capture');
const wrongOld=fixtureDocument('OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE',{
  version:1,providerId:pIds[1],usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',
  originalDocumentSha256:'f'.repeat(64)});
const wrongMarket={...existingMarket,ownerReviewedRights:[fixtureRights[0],
  fixtureReview({...fixtureRights[1],evidenceSha256:wrongOld.sha256,
    technicalReview:undefined},'PROVIDER_USAGE_RIGHTS',wrongOld.sha256)]};
assert.throws(()=>refreshExistingEuRights({...reviewArgs,existing:wrongMarket,
  documents:[...fixtureDocuments,wrongOld]}),/CURRENT_POLICY_REVIEW_REQUIRED/,
  'Unknown historical rights original must never be silently reclassified');
const ownerRight={...fixtureRights[1],reviewedByOwner:true};delete ownerRight.technicalReview;
assert.throws(()=>refreshExistingEuRights({...reviewArgs,existing:{
  ...existingMarket,ownerReviewedRights:[fixtureRights[0],ownerRight]}}),
  /CURRENT_POLICY_REVIEW_REQUIRED/,'Do not replace a personally approved document with delegated review');

console.log('PASS EU delayed EOD: strict bounded ZIP/CSV, MTAA closing auction, independent CEUX pre-close trade, exact semantics, official API discovery, corruption/ambiguity/venue/condition rejection. SYNTHETIC fixtures only; no FILL claimed.');
