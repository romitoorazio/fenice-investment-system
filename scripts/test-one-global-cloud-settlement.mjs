import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,replayOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
import {runOneGlobalCloudSettlementCycle as run,collectOneGlobalSettlementPair} from '../lib/trading/one-global-cloud-settlement.mjs';
import {fetchOneGlobalSettlementSource} from '../lib/market/one-global-cloud-settlement-sources.mjs';
import {selectOneGlobalEcbCurrencyReference} from '../lib/market/one-global-cloud-ecb-reference.mjs';
import {runOneGlobalCloudPaperCycle} from '../lib/trading/one-global-cloud-paper-cycle.mjs';

// Entirely synthetic fixtures; never the owner's journal, prices or approvals.
const sha=x=>createHash('sha256').update(x).digest('hex');
const now='2026-11-13T18:00:00.000Z',sessionDate='2026-11-13';
const consent={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,approvedForVirtualSimulation:true,
  approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},
  executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,strategyPerformanceCertified:false,
  approvedAt:'2026-11-12T20:00:00.000Z',expiresAt:'2026-12-01T00:00:00.000Z'};
function fixture({mic='XMIL',currency='EUR',symbol='FIXTURE',providers=['alpha-vantage','eodhd']}={}){
  const key=mic+':'+symbol,asx=mic==='XASX';
  const ledger=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),
    nowIso:asx?'2026-11-12T06:00:00.000Z':'2026-11-12T18:10:00.000Z',signal:{
      signalId:'synthetic-cloud-settlement-'+mic.toLowerCase(),key,mic,currency,side:'BUY',
      decisionAt:asx?'2026-11-12T06:00:00.000Z':'2026-11-12T18:10:00.000Z',referenceSessionDate:'2026-11-12',
      referenceCloseAt:asx?'2026-11-12T05:11:00.000Z':'2026-11-12T16:30:00.000Z',
      referencePublishedAt:asx?'2026-11-12T05:30:00.000Z':'2026-11-12T17:00:00.000Z',
      sourceSnapshotHash:'b'.repeat(64),maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
  const documents=[];
  const doc=(kind,body)=>{const bytes=Buffer.from(body),hash=sha(bytes);
    documents.push({kind,sha256:hash,bodyBase64:bytes.toString('base64')});return hash;};
  const authority=structuredClone(consent);
  const authorityEvidenceSha256=doc('ORIGINAL_OWNER_PAPER_CONSENT',JSON.stringify(authority));
  const sources=providers.map((providerId,i)=>({providerId,key,mic,currency,
    symbol:providerId==='alpha-vantage'?symbol+'.'+(asx?'AX':'MI'):providerId==='eodhd'?symbol+'.'+(asx?'AU':'MI'):symbol,
    sourceFamily:'synthetic-independent-upstream-'+i,reviewedByOwner:true,reviewedAt:'2026-11-12T20:01:00.000Z',
    independenceEvidenceSha256:doc('PROVIDER_UPSTREAM_PROVENANCE','SYNTHETIC TEST ONLY upstream evidence '+i)}));
  const ownerReviewedRights=providers.map((providerId,i)=>({providerId,mic,currency,
    evidenceSha256:doc('ORIGINAL_PROVIDER_USAGE_RIGHTS','SYNTHETIC TEST ONLY rights document '+i),
    usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',reviewedByOwner:true,automatedUseAllowed:true,
    validUntil:'2027-01-01T00:00:00.000Z'}));
  const sessions=[{mic,sessionDate,sessionOpenedAt:asx?'2026-11-12T22:59:00.000Z':'2026-11-13T08:00:00.000Z',
    sessionClosedAt:asx?'2026-11-13T05:11:00.000Z':'2026-11-13T16:40:00.000Z',
    reviewedByOwner:true,reviewedAt:'2026-11-12T20:01:00.000Z',
    evidenceSha256:doc('ORIGINAL_EXCHANGE_SESSION','SYNTHETIC TEST ONLY exact exchange session document')}];
  return {ledger,signal:ledger.events[0],context:{kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',
    authority,authorityEvidenceSha256,documents,markets:[{key,mic,currency,sources,ownerReviewedRights}],sessions}};
}
function memory(f=fixture(),context=f.context){
  let ledger=JSON.stringify(f.ledger),etag='"ledger-1"',reads=0;
  const store={privateAccess:true,durable:true,atomicCompareAndSwap:true,writes:0,archives:[],
    contextBody:context===null?null:JSON.stringify(context),contextEtag:'"original-context"',
    async read(){reads++;return {body:ledger,etag};},
    async readSettlementContext(){return this.contextBody===null?null:{body:this.contextBody,etag:this.contextEtag};},
    async createResearchObservation(x){assert.equal(sha(JSON.stringify(JSON.parse(x.body))),x.hash);this.archives.push(x);return {created:true};},
    async compareAndSwap(x){assert.equal(x.expectedEtag,etag);this.writes++;ledger=x.body;etag='"ledger-'+(this.writes+1)+'"';return {committed:true,etag};},
    get ledger(){return JSON.parse(ledger);},get reads(){return reads;}};
  return store;
}
const env={ALPHA_VANTAGE_API_KEY:'YOUR_TEST_ALPHA_KEY',EODHD_API_TOKEN:'YOUR_TEST_EOD_KEY',TWELVE_DATA_API_KEY:'YOUR_TEST_TWELVE_KEY'};
const xml=()=>Buffer.from("<?xml version='1.0'?><gesmes:Envelope><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender><Cube xmlns='eurofxref'><Cube time='2026-11-12'><Cube currency='AUD' rate='1.6'/><Cube currency='USD' rate='1.1'/><Cube currency='JPY' rate='170.0'/></Cube></Cube></gesmes:Envelope>");
function network(f,options={}){
  const calls=[];
  const fetcher=async(url,init)=>{
    const u=new URL(url);calls.push(u.hostname);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    if(u.hostname==='www.ecb.europa.eu')return new Response(xml(),{headers:{'Content-Type':'application/xml'}});
    const src=f.context.markets[0].sources.find(s=>s.providerId===
      (u.hostname==='www.alphavantage.co'?'alpha-vantage':u.hostname==='eodhd.com'?'eodhd':'twelve-data'));
    assert.ok(src,'unknown hosts are never contacted');
    if(options.deny===src.providerId)return new Response('not allowed',{status:403});
    const close=options.diverge&&src.providerId==='eodhd'?11:10;
    let body;
    if(src.providerId==='alpha-vantage')body={'Meta Data':{'2. Symbol':options.wrongSymbol?'OTHER':src.symbol},'Time Series (Daily)':{[sessionDate]:{'4. close':String(close)}}};
    else if(src.providerId==='eodhd')body=[{date:sessionDate,close,adjusted_close:1}];
    else{
      assert.equal(u.searchParams.get('adjust'),'none');assert.equal(u.searchParams.get('mic_code'),f.signal.mic);
      body={meta:{symbol:src.symbol,mic_code:f.signal.mic,currency:f.signal.currency,interval:'1day'},values:[{datetime:sessionDate,close:String(close)}]};
    }
    if(options.duplicate&&Array.isArray(body))body.push({...body[0]});
    return Response.json(body);
  };
  return {fetcher,calls};
}
const execute=(store,f=fixture(),opts={})=>{
  const net=network(f,opts);
  return {net,promise:run({storage:store,clock:()=>now,fetcher:net.fetcher,
    collect:args=>collectOneGlobalSettlementPair({...args,env})})};
};
const f=fixture(),store=memory(f),first=execute(store,f);
const result=await first.promise;
assert.equal(result.state,'STRICT_PAPER_FILL_COMMITTED_PRIVATE');assert.equal(result.paperFillsCreated,1);
assert.equal(result.virtualFillCount,1);assert.equal(store.writes,1);assert.equal(store.archives.length,1);
assert.deepEqual(store.ledger.events.slice(0,-1),f.ledger.events);assert.equal(replayOneGlobalEodPaperLedger(store.ledger).virtualBuys,1);
assert.equal(store.ledger.events.at(-1).settlementEvidenceArchiveSha256,store.archives[0].hash);
assert.equal(store.ledger.events.at(-1).providerReceipts[1].close,10,'raw close, never adjusted_close');
const second=await execute(store,f).promise;assert.equal(second.paperFillsCreated,0);assert.equal(second.virtualFillCount,1);assert.equal(store.writes,1);
const missing=memory(f,null),missingRun=execute(missing,f),blocked=await missingRun.promise;
assert.deepEqual(blocked.settlementBlockers,['CLOUD_SETTLEMENT_ORIGINAL_CONTEXT_NOT_CONNECTED']);
assert.equal(missingRun.net.calls.length,0);assert.equal(missing.writes,0);assert.equal(missing.archives.length,0);
for(const change of [
  c=>{c.authority.ownerConsent=false;},c=>{c.authority.expiresAt='2026-11-13T01:00:00.000Z';},
  c=>{c.documents[0].bodyBase64=Buffer.from('forged consent original document').toString('base64');},
  c=>{c.markets[0].sources[1].sourceFamily=c.markets[0].sources[0].sourceFamily;},
  c=>{c.markets[0].sources[1].independenceEvidenceSha256='c'.repeat(64);},
  c=>{c.markets[0].ownerReviewedRights[1].automatedUseAllowed=false;},
  c=>{c.markets[0].ownerReviewedRights[0].evidenceSha256='d'.repeat(64);},
  c=>{c.sessions=[];},c=>{c.sessions[0].reviewedByOwner=false;},
  c=>{c.sessions[0].sessionDate='2026-11-16';},
]){
  const c=structuredClone(f.context);change(c);const s=memory(f,c),r=execute(s,f);const b=await r.promise;
  assert.equal(b.paperFillsCreated,0);assert.equal(b.state,'SETTLEMENT_BLOCKED');assert.equal(s.writes,0);assert.equal(r.net.calls.length,0);
}
for(const opts of [{diverge:true},{wrongSymbol:true},{duplicate:true},{deny:'eodhd'}]){
  const s=memory(f);const b=await execute(s,f,opts).promise;assert.equal(b.paperFillsCreated,0);assert.equal(s.writes,0);
  assert.doesNotMatch(JSON.stringify(b),/YOUR_TEST_|payloadSha256|rawBase64|apikey|unitPrice/);
}
const fallbackFixture=fixture({providers:['alpha-vantage','eodhd','twelve-data']});
const fallbackStore=memory(fallbackFixture);const fallback=await execute(fallbackStore,fallbackFixture,{deny:'eodhd'}).promise;
assert.equal(fallback.paperFillsCreated,1);assert.equal(fallback.settlementSourceRequests,3);
assert.deepEqual(fallbackStore.ledger.events.at(-1).providerReceipts.map(r=>r.providerId),['alpha-vantage','twelve-data']);
assert.equal(fallbackStore.ledger.events.at(-1).ownerReviewedRights.length,2);

// Real interface shape for original ASX signal + official reference conversion.
const audFixture=fixture({mic:'XASX',currency:'AUD'}),audStore=memory(audFixture);
const aud=await execute(audStore,audFixture).promise;assert.equal(aud.paperFillsCreated,1);
const audFill=audStore.ledger.events.at(-1);assert.equal(audFill.fxSeries,'EXR.D.AUD.EUR.SP00.A');
assert.equal(audFill.fxRateToEuro,1/1.6);assert.equal(audFill.fxReferenceDate,'2026-11-12');
assert.equal(network(audFixture).calls.length,0);
for(const currency of ['AUD','USD','JPY']){
  const fx=selectOneGlobalEcbCurrencyReference({raw:xml(),currency,sessionDate,observedAt:now});
  assert.equal(fx.rateToEuro*fx.unitsPerEuro,1);assert.equal(fx.currency,currency);
}
assert.throws(()=>selectOneGlobalEcbCurrencyReference({raw:xml(),currency:'USD',sessionDate:'2026-11-12',observedAt:now}),/PRIOR_SESSION_REFERENCE_MISSING/);
assert.throws(()=>selectOneGlobalEcbCurrencyReference({raw:Buffer.from('<!DOCTYPE '+xml()),currency:'AUD',sessionDate,observedAt:now}),/XML_INVALID/);

let externalRequests=0;
await assert.rejects(fetchOneGlobalSettlementSource({source:{...audFixture.context.markets[0].sources[1],symbol:'CBA.AU'},signal:audFixture.signal,
  sessionDate,env:{},fetcher:async()=>{externalRequests++;throw Error('credential');}}),/EODHD_FREE_KEY_REQUIRED/);
assert.equal(externalRequests,0,'do not burn a request for a known demo entitlement denial');

const conflicting=memory(f);let attempts=0;
conflicting.compareAndSwap=async()=>{attempts++;throw Error('SENSITIVE_STORAGE_ERROR');};
await assert.rejects(execute(conflicting,f).promise,/COMMIT_OUTCOME_UNCONFIRMED/);assert.equal(attempts,1);assert.equal(conflicting.writes,0);
const lost=memory(f),normalCas=lost.compareAndSwap.bind(lost);
lost.compareAndSwap=async x=>{await normalCas(x);throw Error('response lost after commit');};
await assert.rejects(execute(lost,f).promise,/COMMIT_OUTCOME_UNCONFIRMED/);
assert.equal(replayOneGlobalEodPaperLedger(lost.ledger).virtualBuys,1);
assert.equal((await execute(lost,f).promise).paperFillsCreated,0);assert.equal(lost.writes,1,'ambiguous write never duplicated');
const failedReadback=memory(f),normalRead=failedReadback.read.bind(failedReadback);
failedReadback.read=async()=>{if(failedReadback.writes)throw Error('private bytes unavailable');return normalRead();};
await assert.rejects(execute(failedReadback,f).promise,/COMMIT_OUTCOME_UNCONFIRMED/);assert.equal(failedReadback.writes,1);
const changed=memory(f),normalArchive=changed.createResearchObservation.bind(changed);
changed.createResearchObservation=async x=>{const a=await normalArchive(x);changed.contextEtag='"revoked"';return a;};
await assert.rejects(execute(changed,f).promise,/COMMIT_OUTCOME_UNCONFIRMED/);assert.equal(changed.writes,0);

for(const status of [401,403,429,500]){
  await assert.rejects(fetchOneGlobalSettlementSource({source:f.context.markets[0].sources[0],signal:f.signal,
    sessionDate,env,clock:()=>now,fetcher:async()=>new Response('private upstream error',{status})}),
  /^Error: CLOUD_SETTLEMENT_SOURCE_(?:AUTH_OR_PLAN_DENIED|RATE_LIMIT|HTTP_REJECTED)$/);
}
await assert.rejects(fetchOneGlobalSettlementSource({source:f.context.markets[0].sources[0],signal:f.signal,
  sessionDate,env,clock:()=>now,fetcher:async()=>new Response('x'.repeat(500001),{headers:{'Content-Type':'application/json'}})}),/BODY_TOO_LARGE/);
const noArchive=memory(f);noArchive.createResearchObservation=async()=>({created:false});
assert.equal((await execute(noArchive,f).promise).paperFillsCreated,0);assert.equal(noArchive.writes,0);
const late=memory(f);
const lateRun=await run({storage:late,clock:()=>'2026-11-16T18:00:00.000Z',
  collect:async()=>{throw Error('must not fetch after deadline');}});
assert.ok(lateRun.settlementBlockers.includes('CLOUD_SETTLEMENT_STRICT_NEXT_SESSION_48H_WINDOW_ELAPSED'));assert.equal(late.writes,0);

// A block on the older pilot does not prevent a separately admissible market.
const unavailableFirst=fixture({symbol:'UNAVAILABLE'});
const two=recordOneGlobalEodSignal({previousLedger:unavailableFirst.ledger,nowIso:'2026-11-12T18:11:00.000Z',
  signal:{...f.signal,signalId:'synthetic-second-market-signal',decisionAt:'2026-11-12T18:11:00.000Z'}}).ledger;
const twoStore=memory({...f,ledger:two});assert.equal((await execute(twoStore,f).promise).paperFillsCreated,1);
assert.equal(twoStore.ledger.events.length,3);assert.equal(replayOneGlobalEodPaperLedger(twoStore.ledger).pendingSignals.length,1);

const noContext=memory(f,null);let research=0;
const combined=await runOneGlobalCloudPaperCycle({storage:noContext,clock:()=>now,
  collect:async()=>{research++;throw Error('unexpected research outside NY window');}});
assert.equal(combined.settlementState,'SETTLEMENT_BLOCKED');assert.equal(combined.virtualFillCount,0);assert.equal(research,0);
assert.equal(combined.originalEventsPreserved,true);assert.equal(combined.liveTradingAllowed,false);
console.log('PASS cloud settlement: original documents/consent/rights/upstreams/session gates, real-interface raw receipts, third-provider fallback, ECB AUD/USD/JPY, archive before CAS, immutable prefix, duplicates, conflict/lost-response/readback/revocation fail closed. All inputs SYNTHETIC; no real FILL claimed.');
