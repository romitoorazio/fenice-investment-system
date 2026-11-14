import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,replayOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
import {runOneGlobalCloudProspectiveCycle as run,pinOneGlobalRecoveredOriginalStore as pin} from '../lib/trading/one-global-cloud-prospective-cycle.mjs';
import {buildFirstPaperFreeEodEvidence} from '../lib/market/one-global-first-paper-dual-eod.mjs';
const now='2026-11-13T21:45:00.000Z',date='2026-11-13';
// Explicitly synthetic pre-existing journal, never the user's private bytes.
const initial=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),
  nowIso:'2026-11-12T06:00:00.000Z',signal:{signalId:'synthetic-existing-asx-research',
    key:'XASX:FIXTURE',mic:'XASX',currency:'AUD',side:'BUY',
    decisionAt:'2026-11-12T06:00:00.000Z',referenceSessionDate:'2026-11-12',
    referenceCloseAt:'2026-11-12T05:11:00.000Z',referencePublishedAt:'2026-11-12T05:30:00.000Z',
    sourceSnapshotHash:'f'.repeat(64),maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
function evidence(symbol='AAPL',close=180){
  const bars={};for(let i=0;i<30;i++)bars[new Date(Date.parse(date+'T00:00:00Z')-i*86400000).toISOString().slice(0,10)]={'4. close':String(180-i)};
  const alphaRaw=Buffer.from(JSON.stringify({'Meta Data':{'2. Symbol':symbol},'Time Series (Daily)':bars}));
  const eodhdRaw=Buffer.from(JSON.stringify([{date,close}]));
  return {alphaRaw,eodhdRaw,report:buildFirstPaperFreeEodEvidence({alphaRaw,eodhdRaw,symbol,sessionDate:date,observedAt:now})};
}
function store(ledger=initial){
  let body=ledger===null?null:JSON.stringify(ledger),etag='"fixture-1"',writes=0,archives=0;
  return {privateAccess:true,durable:true,atomicCompareAndSwap:true,
    async read(){return body===null?null:{body,etag};},
    async createResearchObservation({body}){
      const observation=JSON.parse(body);assert.equal(observation.kind,'ONE_GLOBAL_PRIVATE_RESEARCH_SOURCE_OBSERVATION');
      assert.equal(observation.report.paperSettlementEligible,false);archives++;return {created:true};
    },
    async compareAndSwap(x){assert.equal(x.expectedEtag,etag);body=x.body;etag='"fixture-2"';writes++;return {committed:true,etag};},
    get body(){return body;},get writes(){return writes;},get archives(){return archives;}};
}
let collections=0;
const collect=async({symbol})=>{collections++;return evidence(symbol);};
const b=store();const result=await run({storage:b,collect,clock:()=>now});
assert.equal(result.state,'PROSPECTIVE_SIGNAL_COMMITTED_PRIVATE');
assert.equal(result.newSignals,1);assert.equal(result.paperFillsCreated,0);
assert.equal(result.sourceEvidenceArchived,true);assert.equal(b.writes,1);assert.equal(b.archives,1);
const after=JSON.parse(b.body);
assert.deepEqual(after.events.slice(0,1),initial.events,'preserve all prior event objects and hashes');
assert.equal(after.cashEuro,initial.cashEuro);assert.deepEqual(after.positions,initial.positions);
assert.equal(replayOneGlobalEodPaperLedger(after).virtualBuys,0);
assert.equal(after.events.at(-1).kind,'SIGNAL');
assert.equal(after.events.at(-1).sourceRightsIndependentlyCertified,false);
assert.equal(result.liveTradingAllowed,false);assert.equal(result.brokerConnectivityAllowed,false);
assert.equal((await run({storage:b,collect,clock:()=>now})).state,'SESSION_SIGNAL_ALREADY_COMMITTED');
assert.equal(collections,1,'repeat never burns provider quota or writes another daily signal');
assert.equal(b.writes,1);assert.equal(b.archives,1);
const weekend=store();
assert.equal((await run({storage:weekend,collect,clock:()=>'2026-11-14T21:45:00.000Z'})).state,'ORIGINAL_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW');
assert.equal(weekend.writes,0);assert.equal(collections,1);
for(const empty of [null,newOneGlobalEodPaperLedger()]){
  const no=store(empty);await assert.rejects(run({storage:no,collect,clock:()=>now}),/ORIGINAL/);assert.equal(no.writes,0);
}
const forged=store();
const rejected=await run({storage:forged,clock:()=>now,collect:async({symbol})=>{
  const x=evidence(symbol);x.report.sma5=999;return x;}});
assert.equal(rejected.newSignals,0);assert.equal(forged.writes,0);assert.equal(forged.archives,0);
const provider=store();
const unavailable=await run({storage:provider,clock:()=>now,collect:async()=>{throw Error('apikey=SECRET');}});
assert.equal(unavailable.newSignals,0);assert(!JSON.stringify(unavailable).includes('SECRET'));assert.equal(provider.archives,0);
const failedArchive=store();failedArchive.createResearchObservation=async()=>{throw Error('private-storage-error');};
await assert.rejects(run({storage:failedArchive,collect,clock:()=>now}));assert.equal(failedArchive.writes,0);
const conflict=store();let casAttempts=0;
conflict.compareAndSwap=async()=>{casAttempts++;throw Error('PRECONDITION_FAILED');};
await assert.rejects(run({storage:conflict,collect,clock:()=>now}),/ATOMIC_WRITE_REJECTED_RELOAD_REQUIRED/);
assert.equal(casAttempts,1);assert.equal(conflict.writes,0);
const boundary=store();let ticks=0;
const elapsed=await run({storage:boundary,collect,clock:()=>++ticks===1?now:'2026-11-14T00:00:00.000Z'});
assert.equal(elapsed.state,'WINDOW_ELAPSED_DURING_COLLECTION');assert.equal(boundary.writes,0);
await assert.rejects(pin(store()).read(),/RECOVERED_ORIGINAL_PREFIX_MISMATCH/);
await assert.rejects(pin(store(null)).read(),/ORIGINAL_JOURNAL_REQUIRED/);
const route=readFileSync(new URL('../app/api/paper/one-global-private-signal-cycle/route.js',import.meta.url),'utf8');
assert.match(route,/authorizeOneGlobalCloudWorkflow/);assert.match(route,/pinOneGlobalRecoveredOriginalStore/);
assert.doesNotMatch(route,/export async function GET|newOneGlobalEodPaperLedger|settleOneGlobal|Directa|execFile/);
const safe=JSON.stringify(result);
assert.doesNotMatch(safe,/payloadSha256|sourceSnapshotHash|RawBase64|unitPrice|lastHash|grossEuro/);
console.log('PASS cloud SIGNAL: private raw evidence before original CAS, full replay/readback, one/day idempotency, weekends, missing original, forged data, archive/race/window failures; zero FILL/LIVE.');
