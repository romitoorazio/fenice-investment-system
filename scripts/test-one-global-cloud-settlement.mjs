import assert from 'node:assert/strict';
import {oneGlobalReviewSubjectSha256} from '../lib/trading/one-global-technical-review.mjs';
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
    // Synthetic representation of the production HEAD-backed private Blob
    // object. These test timestamps are not real trading evidence.
    async readResearchObservation(hash){
      const a=this.archives.find(x=>x.hash===hash);
      return a?{body:Buffer.from(a.body),uploadedAt:new Date('2026-11-13T17:59:59.500Z'),
        uploadedAtSource:'VERCEL_CONTROL_PLANE_HEAD'}:null;
    },
    async compareAndSwap(x){assert.equal(x.expectedEtag,etag);this.writes++;ledger=x.body;etag='"ledger-'+(this.writes+1)+'"';return {committed:true,etag};},
    get ledger(){return JSON.parse(ledger);},get reads(){return reads;}};
  return store;
}
// A session still in progress is a time blocker, not missing data rights.
// The reporting fix must never acquire prices or mutate the original journal.
{
  const f=fixture(),store=memory(f);let requests=0;
  const waiting=await run({storage:store,clock:()=>"2026-11-13T12:00:00.000Z",
    fetcher:async()=>{requests++;throw Error("UNEXPECTED_NETWORK");}});
  assert.deepEqual(waiting.settlementBlockers,["CLOUD_SETTLEMENT_NEXT_SESSION_NOT_COMPLETED"]);
  assert.equal(waiting.sourceRightsEvidenceValidated,true);
  assert.equal(waiting.upstreamEvidenceValidated,true);
  assert.equal(waiting.exchangeSessionEvidenceValidated,true);
  assert.equal(waiting.paperFillsCreated,0);
  assert.equal(waiting.settlementSourceRequests,0);
  assert.equal(requests,0);assert.equal(store.writes,0);
  const denied=fixture();denied.context.markets[0].ownerReviewedRights[0].automatedUseAllowed=false;
  const rejected=await run({storage:memory(denied),clock:()=>"2026-11-13T12:00:00.000Z",
    fetcher:async()=>{throw Error("UNEXPECTED_NETWORK");}});
  assert.equal(rejected.sourceRightsEvidenceValidated,false);
  assert.equal(rejected.paperFillsCreated,0);
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
assert(Date.parse(store.ledger.events.at(-1).recordedAt)>=
  (await store.readResearchObservation(store.archives[0].hash)).uploadedAt.getTime(),
  'An actual future FILL timestamp must never predate its durable source archive');
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


// The private archive must pre-exist the FILL by authoritative control-plane
// time; never compensate for skew by inventing an earlier archive timestamp.
for(const mode of ['MISSING_ORIGIN_READER','MISSING_ORIGIN_OBJECT','UNTRUSTED_HTTP_DATE',
  'CHANGED_BYTES','MISSING_ORIGIN_TIMESTAMP','MALFORMED_ORIGIN_TIMESTAMP']){
  const st=memory(f),orig=st.readResearchObservation.bind(st);
  if(mode==='MISSING_ORIGIN_READER')st.readResearchObservation=undefined;
  else if(mode==='MISSING_ORIGIN_OBJECT')st.readResearchObservation=async()=>null;
  else st.readResearchObservation=async hash=>{
    const original=await orig(hash);
    if(mode==='UNTRUSTED_HTTP_DATE')return {...original,uploadedAtSource:'HTTP_LAST_MODIFIED'};
    if(mode==='CHANGED_BYTES')return {...original,body:Buffer.from('CORRUPTED')};
    if(mode==='MISSING_ORIGIN_TIMESTAMP')return {...original,uploadedAt:null};
    return {...original,uploadedAt:new Date('not-a-valid-time')};
  };
  if(mode==='MISSING_ORIGIN_READER')
    await assert.rejects(execute(st,f).promise,/PRIVATE_CONTEXT_AND_CAS_STORE_REQUIRED/);
  else {
    const res=await execute(st,f).promise;
    assert.equal(res.state,'SETTLEMENT_BLOCKED',mode);
    assert.equal(res.paperFillsCreated,0,mode);
    assert.match(res.settlementBlockers.join(' '),/CLOUD_SETTLEMENT_PRECOMMIT_ARCHIVE_/,mode);
  }
  assert.equal(st.writes,0,'Never write a PAPER FILL with '+mode);
}
const futureClock=memory(f),futureArchive=futureClock.readResearchObservation.bind(futureClock);
futureClock.readResearchObservation=async hash=>({
  ...await futureArchive(hash),uploadedAt:new Date('2026-11-13T18:00:01.000Z'),
});
const futureBlocked=await execute(futureClock,f).promise;
assert.equal(futureBlocked.paperFillsCreated,0);
assert.equal(futureBlocked.state,'SETTLEMENT_BLOCKED');
assert(futureBlocked.settlementBlockers.includes(
  'CLOUD_SETTLEMENT_PRECOMMIT_ARCHIVE_TIMESTAMP_AFTER_FILL_CLOCK'));
assert.equal(futureClock.writes,0,'Clock skew must fail closed, never backdate an original FILL');
const equalClock=memory(f),readEqual=equalClock.readResearchObservation.bind(equalClock);
equalClock.readResearchObservation=async hash=>({...await readEqual(hash),
  uploadedAt:new Date(now)});
const exactEqual=await execute(equalClock,f).promise;
assert.equal(exactEqual.paperFillsCreated,1,'Exact provider/server timestamp equality is admissible');
assert.equal(equalClock.ledger.events.at(-1).recordedAt,now);
// If the local clock regresses after the first precommit comparison, reject
// again INSIDE the mutation callback. A failed callback must not write CAS.
const clockRollback=memory(f),originalRead=clockRollback.readResearchObservation.bind(clockRollback);
let originalWasVerified=false,afterProofClockCalls=0;
clockRollback.readResearchObservation=async hash=>{
  const evidence=await originalRead(hash);originalWasVerified=true;return evidence;
};
const rollbackClock=()=>{
  if(!originalWasVerified)return now;
  afterProofClockCalls++;
  return afterProofClockCalls===1?now:'2026-11-13T17:59:58.000Z';
};
await assert.rejects(run({storage:clockRollback,clock:rollbackClock,
  fetcher:network(f).fetcher,
  collect:args=>collectOneGlobalSettlementPair({...args,env})}),
  /COMMIT_OUTCOME_UNCONFIRMED_RELOAD_REQUIRED/);
assert.equal(clockRollback.writes,0,'Clock rollback inside CAS callback must not create a FILL');
assert.equal(clockRollback.archives.length,1,'Already committed evidence remains immutable');
console.log('PASS original settlement future-FILL origin chronology: source HEAD, byte match, clock skew, missing metadata, no CAS on failure. SYNTHETIC ONLY.');

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

// A fully reviewed, but unavailable, earlier provider pair must NOT starve a
// separately admissible next market. Only the no-pair precommit path may skip;
// the original journal remains append-only and no synthetic price becomes real.
const mergedContext={...f.context,markets:[
  unavailableFirst.context.markets[0],f.context.markets[0]]};
const pairMissingStore=memory({...f,ledger:two},mergedContext);
const reached=[];
const realFixtureNet=network(f);
const recovered=await run({storage:pairMissingStore,clock:()=>now,fetcher:realFixtureNet.fetcher,
  collect:async args=>{
    reached.push(args.signal.key);
    if(args.signal.key===unavailableFirst.signal.key)return {pair:null,outcomes:[
      {providerId:'alpha-vantage',state:'SOURCE_UNAVAILABLE'},
      {providerId:'eodhd',state:'SOURCE_UNAVAILABLE'}]};
    return collectOneGlobalSettlementPair({...args,env});
  }});
assert.deepEqual(reached,[unavailableFirst.signal.key,f.signal.key]);
assert.equal(recovered.paperFillsCreated,1);
assert.equal(recovered.state,'STRICT_PAPER_FILL_COMMITTED_PRIVATE');
assert.equal(recovered.settlementSourceRequests,4);
assert(recovered.settlementBlockers.includes('CLOUD_SETTLEMENT_TWO_ADMISSIBLE_PROVIDER_RECEIPTS_UNAVAILABLE'));
assert.equal(pairMissingStore.writes,1);
assert.equal(pairMissingStore.archives.length,1);
assert.deepEqual(pairMissingStore.ledger.events.slice(0,2),two.events);
assert.equal(pairMissingStore.ledger.events.at(-1).signalHash,two.events[1].hash);
assert.equal(replayOneGlobalEodPaperLedger(pairMissingStore.ledger).pendingSignals.length,1);
const noPairStore=memory({...f,ledger:two},mergedContext);
const noPairs=await run({storage:noPairStore,clock:()=>now,
  collect:async args=>({pair:null,outcomes:args.sources.map(s=>({
    providerId:s.providerId,state:'SOURCE_UNAVAILABLE'}))})});
assert.equal(noPairs.paperFillsCreated,0);
assert.equal(noPairs.state,'SETTLEMENT_BLOCKED');
assert.equal(noPairs.settlementSourceRequests,4);
assert.equal(noPairStore.writes,0);
assert.equal(noPairStore.archives.length,0);
assert.deepEqual(noPairStore.ledger.events,two.events);

// Two real-interface rows can both exist but disagree. Rejection is still
// entirely before persistence and must not starve a different valid signal.
// These are isolated SYNTHETIC regression fixtures, never original events.
const divergentStore=memory({...f,ledger:two},mergedContext),divergentReached=[];
const divergentFirstNet=network(unavailableFirst,{diverge:true});
const afterDivergence=await run({storage:divergentStore,clock:()=>now,
  collect:async args=>{
    divergentReached.push(args.signal.key);
    return collectOneGlobalSettlementPair({...args,env,fetcher:
      args.signal.key===unavailableFirst.signal.key?divergentFirstNet.fetcher:network(f).fetcher});
  }});
assert.deepEqual(divergentReached,[unavailableFirst.signal.key,f.signal.key]);
assert.equal(afterDivergence.paperFillsCreated,1);
assert(afterDivergence.settlementBlockers.includes('EOD_PAPER_INDEPENDENT_CLOSE_DIVERGENCE'));
assert.equal(divergentStore.writes,1);
assert.equal(divergentStore.archives.length,1,'Rejected first pair must not be archived as admissible');
assert.equal(divergentStore.ledger.events.at(-1).signalHash,two.events[1].hash);
assert.deepEqual(divergentStore.ledger.events.slice(0,2),two.events);

// Collection and original-byte rejection happen before all persistence too.
for(const mode of ['COLLECTION_THROW','RAW_RECEIPT_TAMPER']){
  const st=memory({...f,ledger:two},mergedContext),reached=[];
  const result=await run({storage:st,clock:()=>now,collect:async args=>{
    reached.push(args.signal.key);
    if(args.signal.key!==unavailableFirst.signal.key)
      return collectOneGlobalSettlementPair({...args,env,fetcher:network(f).fetcher});
    if(mode==='COLLECTION_THROW')throw Error('PRIVATE_PROVIDER_FAILURE_TOKEN');
    const pair=await collectOneGlobalSettlementPair({...args,env,fetcher:network(unavailableFirst).fetcher});
    pair.pair[0].receipt.payloadSha256='f'.repeat(64);return pair;
  }});
  assert.equal(result.paperFillsCreated,1);
  assert.deepEqual(reached,[unavailableFirst.signal.key,f.signal.key]);
  assert.equal(st.writes,1);assert.equal(st.archives.length,1);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_FAILURE_TOKEN/);
}
// Once ANY evidence write has started, do not skip to another market on an
// ambiguous archive/CAS/readback. A possibly committed event is terminal.
for(const mode of ['ARCHIVE','CAS']){
  const st=memory({...f,ledger:two},mergedContext),reached=[];
  if(mode==='ARCHIVE')st.createResearchObservation=async()=>{throw Error('lost archive response');};
  else st.compareAndSwap=async()=>{throw Error('lost conditional-write response');};
  const attempt=run({storage:st,clock:()=>now,collect:async args=>{
    reached.push(args.signal.key);
    return collectOneGlobalSettlementPair({...args,env,fetcher:network(unavailableFirst).fetcher});
  }});
  if(mode==='CAS')await assert.rejects(attempt,/COMMIT_OUTCOME_UNCONFIRMED/);
  else assert.equal((await attempt).paperFillsCreated,0);
  assert.deepEqual(reached,[unavailableFirst.signal.key]);
  assert.equal(st.writes,0);
}


const noContext=memory(f,null);let research=0;
const combined=await runOneGlobalCloudPaperCycle({storage:noContext,clock:()=>now,
  collect:async()=>{research++;throw Error('unexpected research outside NY window');}});
assert.equal(combined.settlementState,'SETTLEMENT_BLOCKED');assert.equal(combined.virtualFillCount,0);assert.equal(research,0);
assert.equal(combined.originalEventsPreserved,true);assert.equal(combined.liveTradingAllowed,false);
console.log('PASS cloud settlement: original documents/consent/rights/upstreams/session gates, real-interface raw receipts, third-provider fallback, ECB AUD/USD/JPY, archive before CAS, immutable prefix, duplicates, conflict/lost-response/readback/revocation fail closed. All inputs SYNTHETIC; no real FILL claimed.');
// Complete strict settlement through the new SIP adapter, with SYNTHETIC
// original rights/provenance/session proofs. Real source access does not grant these.
{
 const f=fixture({mic:'XNAS',currency:'USD',symbol:'AAPL',providers:['alpha-vantage','alpaca-sip']});
 f.context.markets[0].sources.forEach(s=>{s.symbol='AAPL';});
 const storage=memory(f);
 const fetcher=async(url,init)=>{
  const u=new URL(url);assert.equal(init.redirect,'error');
  if(u.hostname==='www.ecb.europa.eu')return new Response(xml(),{headers:{'Content-Type':'application/xml'}});
  if(u.hostname==='www.alphavantage.co')return Response.json({'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':{[sessionDate]:{'4. close':'10'}}});
  assert.equal(u.origin,'https://data.alpaca.markets');assert.equal(u.searchParams.get('feed'),'sip');
  return Response.json({symbol:'AAPL',next_page_token:null,bars:[{t:'2026-11-13T05:00:00Z',o:10,h:11,l:9,c:10,v:100,n:10}]});
 };
 const report=await run({storage,clock:()=> '2026-11-14T20:00:00.000Z',fetcher,
  collect:args=>collectOneGlobalSettlementPair({...args,env:{...env,APCA_API_KEY_ID:'SYNTHETIC_SIP_KEY',APCA_API_SECRET_KEY:'SYNTHETIC_SIP_SECRET'}})});
 assert.equal(report.paperFillsCreated,1);assert.equal(storage.writes,1);assert.equal(report.virtualFillCount,1);
 assert.equal(report.ownerPaperAuthorityValidated,true);assert.equal(report.sourceRightsEvidenceValidated,true);
 assert.equal(storage.ledger.events.at(-1).kind,'FILL');assert.equal(storage.archives.length,1);
}
console.log('PASS SYNTHETIC full Alpha + Alpaca SIP strict settlement: original gates, raw reparse, official-interface ECB, archive, one CAS append. No real journal/network.');

// IEX is a single venue, never a consolidated SIP quote. This test uses
// SYNTHETIC original provider rights, provenance and owner review ONLY.
// Real Alpaca Basic access or 200 HTTP status can never instantiate these.
{
 const f=fixture({mic:'XNAS',currency:'USD',symbol:'AAPL',providers:['alpha-vantage','alpaca-iex']});
 f.context.markets[0].sources.forEach(source=>{source.symbol='AAPL';});
 const storage=memory(f);
 const fetcher=async(url,init)=>{
   const u=new URL(url);assert.equal(init.redirect,'error');
   if(u.hostname==='www.ecb.europa.eu')return new Response(xml(),{headers:{'Content-Type':'application/xml'}});
   if(u.hostname==='www.alphavantage.co')return Response.json({'Meta Data':{'2. Symbol':'AAPL'},
     'Time Series (Daily)':{[sessionDate]:{'4. close':'10'}}});
   assert.equal(u.origin,'https://data.alpaca.markets');
   assert.equal(u.searchParams.get('feed'),'iex','paper-only settlement must not query SIP');
   return Response.json({symbol:'AAPL',feed:'iex',next_page_token:null,bars:[
     {t:'2026-11-13T05:00:00Z',o:10,h:11,l:9,c:10,v:100,n:10}]});
 };
 const options={storage,clock:()=> '2026-11-14T20:00:00.000Z',fetcher,
   collect:args=>collectOneGlobalSettlementPair({...args,env:{...env,
     APCA_API_KEY_ID:'SYNTHETIC_IEX_KEY',APCA_API_SECRET_KEY:'SYNTHETIC_IEX_SECRET'}})};
 const done=await run(options);
 assert.equal(done.paperFillsCreated,1,'synthetic rights + raw IEX/Alpha receipts may settle in an isolated fixture');
 assert.equal(storage.writes,1);assert.equal(storage.archives.length,1);
 assert.deepEqual(storage.ledger.events.at(-1).providerReceipts.map(q=>q.providerId),['alpha-vantage','alpaca-iex']);
 const denied=structuredClone(f.context);denied.markets[0].ownerReviewedRights[1].automatedUseAllowed=false;
 const blockedStore=memory(f,denied);let calls=0;
 const refused=await run({...options,storage:blockedStore,fetcher:async()=>{calls++;throw Error('UNEXPECTED_HTTP');}});
 assert.equal(refused.paperFillsCreated,0);assert.equal(calls,0);assert.equal(blockedStore.writes,0);
}
console.log('PASS SYNTHETIC Alpha + Alpaca IEX strict settlement only with original provider rights, independent provenance and session; no real permission inferred.');

// Delegated review is distinct from owner consent; SYNTHETIC documents only.
const delegatedFixture=fixture();
function delegate(subject,scope,evidenceSha256){
  subject.reviewedByOwner=false;
  subject.technicalReview={kind:'DELEGATED_PROJECT_TECHNICAL_REVIEW',
    reviewer:{role:'DELEGATED_PROJECT_OPERATOR',name:'Synthetic Test'},scope,
    outcome:'APPROVED_FOR_DOCUMENTED_SCOPE',evidenceSha256,
    authoritySnapshotHash:sha(JSON.stringify(delegatedFixture.context.authority)),
    reviewedAt:subject.reviewedAt??'2026-11-12T20:01:00.000Z',reviewedCommit:'c'.repeat(40),
    basis:'SYNTHETIC TEST ONLY: this exact fixture evidence supports this specific scope.',
    subjectSha256:oneGlobalReviewSubjectSha256(subject)};
}
for(const source of delegatedFixture.context.markets[0].sources)delegate(source,'SOURCE_MAPPING',source.independenceEvidenceSha256);
for(const rights of delegatedFixture.context.markets[0].ownerReviewedRights)delegate(rights,'PROVIDER_USAGE_RIGHTS',rights.evidenceSha256);
for(const session of delegatedFixture.context.sessions)delegate(session,'EXCHANGE_SESSION',session.evidenceSha256);
const delegatedStore=memory(delegatedFixture);
assert.equal((await execute(delegatedStore,delegatedFixture).promise).paperFillsCreated,1);
assert.equal(replayOneGlobalEodPaperLedger(delegatedStore.ledger).virtualBuys,1);
assert(delegatedStore.ledger.events.at(-1).ownerReviewedRights.every(x=>x.reviewedByOwner===false));
for(const mutate of [
  c=>{c.markets[0].sources[0].symbol='OTHER';},
  c=>{c.markets[0].ownerReviewedRights[0].technicalReview.authoritySnapshotHash='0'.repeat(64);},
  c=>{c.markets[0].ownerReviewedRights[0].technicalReview.outcome='ACCOUNT_SCOPE_UNRESOLVED';},
  c=>{c.sessions[0].sessionClosedAt='2026-11-13T16:41:00.000Z';},
  c=>{c.markets[0].sources[0].reviewedByOwner=true;},
]){
  const c=structuredClone(delegatedFixture.context);mutate(c);
  const st=memory(delegatedFixture,c),attempt=execute(st,delegatedFixture);
  assert.equal((await attempt.promise).paperFillsCreated,0);assert.equal(st.writes,0);assert.equal(attempt.net.calls.length,0);
}
// Rehashing a modified FILL cannot transplant a review from another consent.
const transplanted=structuredClone(delegatedStore.ledger),event=transplanted.events.at(-1);
event.authoritySnapshotHash='d'.repeat(64);
const unhashed=Object.fromEntries(Object.entries(event).filter(([key])=>key!=='hash'));event.hash=sha(JSON.stringify(unhashed));
assert.throws(()=>replayOneGlobalEodPaperLedger(transplanted));
console.log('PASS delegated settlement: synthetic original evidence supports attributed source/rights/session review, strict replay and CAS preserved; edits and consent transplantation fail closed.');
