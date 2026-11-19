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
  let originalObservation=null;
  return {privateAccess:true,durable:true,atomicCompareAndSwap:true,
    async read(){return body===null?null:{body,etag};},
    async createResearchObservation({hash,body}){
      const observation=JSON.parse(body);assert.equal(observation.kind,'ONE_GLOBAL_PRIVATE_RESEARCH_SOURCE_OBSERVATION');
      assert.equal(observation.report.paperSettlementEligible,false);
      originalObservation={body,hash};archives++;
      // Original observation key is the digest of the research report, not
      // the complete envelope; preserve the caller hash for exact readback.
      return {created:true};
    },
    async readResearchObservation(hash){
      if(!originalObservation||originalObservation.hash!==hash)return null;
      return {body:Buffer.from(originalObservation.body),uploadedAt:new Date(now),
        uploadedAtSource:'VERCEL_CONTROL_PLANE_HEAD'};
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
// No SIGNAL may be written if the authoritative original archive did not
// exist before the journal timestamp. Test fail-closed readback failures.
for(const mode of ['MISSING_ORIGINAL','TAMPERED_BYTES','HTTP_DATE_ONLY','FUTURE_ORIGIN_CLOCK','INVALID_ORIGIN_CLOCK']){
  const st=store(),read=st.readResearchObservation.bind(st);
  st.readResearchObservation=async hash=>{
    const original=await read(hash);
    if(mode==='MISSING_ORIGINAL')return null;
    if(mode==='TAMPERED_BYTES')return {...original,body:Buffer.from('synthetic changed bytes')};
    if(mode==='HTTP_DATE_ONLY')return {...original,uploadedAtSource:'HTTP_LAST_MODIFIED'};
    if(mode==='FUTURE_ORIGIN_CLOCK')return {...original,uploadedAt:new Date('2026-11-13T21:45:01.000Z')};
    return {...original,uploadedAt:'not-a-date'};
  };
  await assert.rejects(run({storage:st,collect,clock:()=>now}),/CLOUD_SIGNAL_ORIGIN_/);
  assert.equal(st.writes,0,'Never append signal with unproven archive: '+mode);
  assert.equal(st.archives,1,'Untrusted archive remains immutable');
}
const missingHead=store();missingHead.readResearchObservation=undefined;
await assert.rejects(run({storage:missingHead,collect,clock:()=>now}),/PRIVATE_EVIDENCE_AND_CAS_STORE_REQUIRED/);
assert.equal(missingHead.writes,0);
const reversedClock=store();let ticksAfter=0;
const reversed=()=>++ticksAfter<=3?now:'2026-11-13T21:44:59.000Z';
await assert.rejects(run({storage:reversedClock,collect,clock:reversed}),
  /CLOUD_SIGNAL_ORIGIN_ORIGINAL_ARCHIVE_LATER_THAN_SIGNAL_CLOCK/);
assert.equal(reversedClock.writes,0,'CAS clock rollback cannot create SIGNAL');
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
