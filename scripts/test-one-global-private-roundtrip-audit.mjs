import assert from 'node:assert/strict';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
  settleOneGlobalEodSignal,replayOneGlobalEodPaperLedger}
  from '../lib/trading/one-global-eod-paper.mjs';
import {findOneGlobalPrivateClosedRoundTrips,auditOneGlobalLatestPrivateRoundTrip}
  from '../lib/trading/one-global-private-roundtrip-audit.mjs';
import {oneGlobalMilanForensicName} from '../lib/trading/one-global-private-forensic-audit.mjs';
import {ONE_GLOBAL_MILAN_INSTRUMENTS} from '../lib/market/one-global-eu-delayed-eod.mjs';
import {readFileSync} from 'node:fs';

const expectedTitles={ENEL:'Enel',BAMI:'Banco BPM',UCG:'UniCredit',
  ENI:'Eni',ISP:'Intesa Sanpaolo',TRN:'Terna'};
assert.deepEqual(Object.keys(ONE_GLOBAL_MILAN_INSTRUMENTS).sort(),
  Object.keys(expectedTitles).sort(),'forensic titles cover every configured Milan security');
for(const [symbol,name] of Object.entries(expectedTitles))
  assert.equal(oneGlobalMilanForensicName(symbol),name);
assert.throws(()=>oneGlobalMilanForensicName('UNKNOWN'),/TITLE_NOT_REVIEWED/);
const forensicSource=readFileSync(new URL('../lib/trading/one-global-private-forensic-audit.mjs',import.meta.url),'utf8');
assert(forensicSource.includes('title:oneGlobalMilanForensicName(instrument.symbol)'));
const ownerRoute=readFileSync(new URL('../app/api/paper/one-global-private-roundtrip/route.js',import.meta.url),'utf8');
assert(ownerRoute.includes('verifyFeniceOwnerSession'));
assert(ownerRoute.includes('pinOneGlobalRecoveredOriginalStore'));
assert(ownerRoute.includes('auditOneGlobalLatestPrivateRoundTrip'));
assert(!/export async function (?:POST|PUT|PATCH|DELETE)/.test(ownerRoute));
assert(!/submitDirectaOrder|connectDirectaNetwork|marketDataRightsIndependentlyCertified:true/.test(ownerRoute));

// ALL source receipts, owner reviews, values, dates and original events below
// are synthetic regression fixtures. This test never accesses Vercel Blob,
// broker APIs, external prices, production credentials or a real PAPER journal.
const h=n=>n.toString(16).padStart(64,'0');
const authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,
  approvedForVirtualSimulation:true,approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},
  executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,
  liveTradingAllowed:false,brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,
  strategyPerformanceCertified:false,approvedAt:'2026-11-12T18:15:00.000Z',
  expiresAt:'2026-12-12T00:00:00.000Z'};
const rights=()=>['synthetic-primary','synthetic-independent'].map((id,i)=>({
  providerId:id,mic:'XMIL',currency:'EUR',evidenceSha256:h(i+1),
  usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',reviewedByOwner:true,
  automatedUseAllowed:true,validUntil:'2027-01-01T00:00:00.000Z'}));
const dates={
  '2026-11-13':['2026-11-13T08:00:00.000Z','2026-11-13T16:30:00.000Z','2026-11-13T16:40:00.000Z'],
  '2026-11-16':['2026-11-16T08:00:00.000Z','2026-11-16T16:30:00.000Z','2026-11-16T16:40:00.000Z'],
};
function market(key,day,price){
  const [sessionOpenedAt,sessionClosedAt,publishedAt]=dates[day];
  return {sessionDate:day,sessionOpenedAt,sessionClosedAt,
    providerReceipts:['synthetic-primary','synthetic-independent'].map((id,i)=>({
      providerId:id,sourceFamily:id,key,mic:'XMIL',currency:'EUR',
      sessionDate:day,close:price+i*0.002,publishedAt,payloadSha256:h(i+4),
      simulatedOrSynthetic:false,
    }))};
}
function signal(ledger,side,key,now,ref,identity){
  const res=recordOneGlobalEodSignal({previousLedger:ledger,nowIso:now,
    signal:{signalId:'synthetic-roundtrip-'+identity,key,mic:'XMIL',side,
      currency:'EUR',decisionAt:now,referenceSessionDate:ref,
      referenceCloseAt:ref+'T16:30:00.000Z',referencePublishedAt:ref+'T17:00:00.000Z',
      sourceSnapshotHash:h(23),maxNotionalEuro:50,
      strategyReason:side==='BUY'?'UPTREND_CONFIRMATION':'DOWNTREND_EXIT'}});
  return res;
}
function fill(ledger,signalHash,key,day,now,price){
  return settleOneGlobalEodSignal({previousLedger:ledger,nowIso:now,signalHash,
    marketEvidence:market(key,day,price),ownerReviewedRights:rights(),authority}).ledger;
}
const original=newOneGlobalEodPaperLedger();
const buyA=signal(original,'BUY','XMIL:ENEL','2026-11-12T18:10:00.000Z','2026-11-12','entry-enel');
const first=fill(buyA.ledger,buyA.signalHash,'XMIL:ENEL','2026-11-13','2026-11-13T17:45:00.000Z',10);
assert.equal(findOneGlobalPrivateClosedRoundTrips(first).closed.length,0);
const foreignSignal=signal(first,'BUY','XMIL:BAMI','2026-11-13T18:02:00.000Z','2026-11-13','entry-bami');
const exitSignal=signal(foreignSignal.ledger,'SELL','XMIL:ENEL',
  '2026-11-13T18:10:00.000Z','2026-11-13','exit-enel');
const interleaved=fill(exitSignal.ledger,foreignSignal.signalHash,'XMIL:BAMI',
  '2026-11-16','2026-11-16T17:10:00.000Z',11);
const closed=fill(interleaved,exitSignal.signalHash,'XMIL:ENEL',
  '2026-11-16','2026-11-16T17:30:00.000Z',8);
const replay=replayOneGlobalEodPaperLedger(closed);
assert.equal(replay.virtualBuys,2);
assert.equal(replay.virtualSells,1);
assert.equal(replay.closedVirtualRoundTrips,1);
assert(replay.realizedNetEuro<0,'a genuine loss must be recorded, never hidden');
const matches=findOneGlobalPrivateClosedRoundTrips(closed);
assert.equal(matches.closed.length,1);
assert.equal(matches.closed[0].buyOrdinal,1);
assert.equal(matches.closed[0].sellOrdinal,3);
assert.equal(matches.closed[0].netEuro,replay.realizedNetEuro);
assert.equal(matches.closed[0].buy.hash,first.events.at(-1).hash);
assert.equal(matches.closed[0].sell.hash,closed.events.at(-1).hash);

const body=JSON.stringify(closed);
let reads=0,writes=0,forensicCalls=0;
const store={privateAccess:true,durable:true,async read(){reads++;return {body,etag:'synthetic-revision'};},
  async readResearchObservation(){return null;},async readSourceArtifact(){return null;},
  async compareAndSwap(){writes++;throw Error('READ_ONLY_AUDIT_MUST_NEVER_COMMIT');}};
const auditedFills=closed.events.filter(e=>e.kind==='FILL');
const syntheticTenCheckAudit=async({fillOrdinal})=>{
  forensicCalls++;
  const f=auditedFills[fillOrdinal-1];
  return {state:'FILL_RIGOROUS_REPLAY_VERIFIED',fillOrdinal,
    identity:{fillHash:f.hash,key:f.key,side:f.side},
    accounting:{quantity:f.quantity,feeEuro:f.feeEuro,notionalEuro:f.notionalEuro},
    checks:Array.from({length:10},(_,i)=>({name:'synthetic-'+i,verified:true})),
    missingEvidence:[],defects:[],journalMutationAllowed:false,
    paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false};
};
const nowIso='2026-11-17T19:00:00.000Z';
const checked=await auditOneGlobalLatestPrivateRoundTrip({
  storage:store,nowIso,auditFill:syntheticTenCheckAudit});
assert.equal(checked.state,'VIRTUAL_ROUNDTRIP_FORENSIC_10_OF_10');
assert.equal(checked.roundTripForensicallyVerified,true);
assert.equal(checked.lastRoundTripDirection,'LOSS');
assert.equal(checked.lastRoundTripNetEuro,replay.realizedNetEuro);
assert.equal(checked.realizedTotalNetEuro,replay.realizedNetEuro);
assert.equal(checked.virtualPerformanceCertified,false);
assert.equal(checked.strategyPerformanceCertified,false);
assert.equal(checked.certifiedTrades,0);
assert.equal(checked.phase9Credit,0);
assert.equal(forensicCalls,2);
assert.equal(writes,0);
assert.equal(reads,2,'outer auditor reads the original before and after the two isolated synthetic attestations');
const noExitStore={...store,async read(){return {body:JSON.stringify(first),etag:'only-buy'};}};
const none=await auditOneGlobalLatestPrivateRoundTrip({storage:noExitStore,nowIso,auditFill:syntheticTenCheckAudit});
assert.equal(none.state,'NO_CLOSED_VIRTUAL_ROUNDTRIP');
assert.equal(none.roundTripForensicallyVerified,false);
const forged=await auditOneGlobalLatestPrivateRoundTrip({storage:store,nowIso,
  auditFill:async args=>({...await syntheticTenCheckAudit(args),identity:{fillHash:'f'.repeat(64),
    key:'XMIL:ENEL',side:'SELL'}})});
assert.equal(forged.state,'ROUNDTRIP_FORENSIC_EVIDENCE_INCOMPLETE');
assert.equal(forged.lastRoundTripNetEuro,undefined);
const partial=await auditOneGlobalLatestPrivateRoundTrip({storage:store,nowIso,
  auditFill:async args=>({...await syntheticTenCheckAudit(args),checks:[{name:'only-1',verified:true}]})});
assert.equal(partial.state,'ROUNDTRIP_FORENSIC_EVIDENCE_INCOMPLETE');
assert.equal(partial.roundTripForensicallyVerified,false);
let revision=0;
const moved={...store,async read(){return {body,etag:'rev-'+(++revision)};}};
const concurrent=await auditOneGlobalLatestPrivateRoundTrip({storage:moved,nowIso,
  auditFill:syntheticTenCheckAudit});
assert.equal(concurrent.state,'ORIGINAL_JOURNAL_CHANGED_DURING_ROUNDTRIP_AUDIT');
const noAuth=await auditOneGlobalLatestPrivateRoundTrip({storage:{},nowIso});
assert.equal(noAuth.state,'PRIVATE_READ_ONLY_EVIDENCE_ACCESS_REQUIRED');
const denied=await auditOneGlobalLatestPrivateRoundTrip({storage:store,nowIso:'invalid'});
assert.equal(denied.state,'ROUNDTRIP_AUDIT_INPUT_INVALID');
assert.equal(writes,0);
assert(!JSON.stringify(checked).includes('XMIL:'));
assert(!JSON.stringify(checked).includes('synthetic-primary'));
console.log('PASS SYNTHETIC ONLY: interleaved BUY/FILL/BUY/SELL/FILL, loss-inclusive EUR fee/slippage P&L, both independent 10-check audit identities, race/missing/forged fail-closed; no original Blob writes, no LIVE or certification claim.');
