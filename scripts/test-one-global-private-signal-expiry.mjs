import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
  expireOneGlobalEodSignal,replayOneGlobalEodPaperLedger,
} from '../lib/trading/one-global-eod-paper.mjs';
import {
  oneGlobalRegularNextSessionCutoff,
} from '../lib/trading/one-global-eod-pilot-time-audit.mjs';
import {
  assessOneGlobalPrivatePendingWindows as assess,
  ORIGINAL_CBA_SIGNAL_HASH,
} from '../lib/trading/one-global-private-pending-windows.mjs';
import {commitOneGlobalCloudPrivateLedger} from '../lib/trading/one-global-cloud-private-ledger.mjs';

const cba=oneGlobalRegularNextSessionCutoff({
  mic:'XASX',referenceSessionDate:'2026-11-12',
});
assert.equal(cba.targetSessionDate,'2026-11-13');
assert.equal(cba.nextSessionRegularCloseAt,'2026-11-13T05:11:00.000Z');
assert.equal(cba.evidenceDeadlineAt,'2026-11-15T05:11:00.000Z');
assert.equal(cba.independentExchangeCalendarVerified,false);
const milan=oneGlobalRegularNextSessionCutoff({
  mic:'XMIL',referenceSessionDate:'2026-11-13',
});
assert.equal(milan.targetSessionDate,'2026-11-16');
assert.equal(milan.nextSessionRegularCloseAt,'2026-11-16T16:40:00.000Z');
assert.equal(milan.evidenceDeadlineAt,'2026-11-18T16:40:00.000Z');
const milanDst=oneGlobalRegularNextSessionCutoff({
  mic:'XMIL',referenceSessionDate:'2026-03-27',
});
assert.equal(milanDst.targetSessionDate,'2026-03-30');
assert.equal(milanDst.nextSessionRegularCloseAt,'2026-03-30T15:40:00.000Z');
assert.equal(oneGlobalRegularNextSessionCutoff({
  mic:'XNAS',referenceSessionDate:'2026-11-12',
}),null);
const witness=JSON.parse(readFileSync('data/one-global-first-paper-cba-signal-witness.json','utf8'));
const {ledger,signalHash}=recordOneGlobalEodSignal({
  previousLedger:newOneGlobalEodPaperLedger(),nowIso:witness.decisionRecordedAt,
  signal:{
    signalId:witness.signalId,key:witness.instrumentKey,
    mic:witness.exchangeMic,side:witness.side,currency:witness.currency,
    decisionAt:witness.decisionRecordedAt,
    referenceSessionDate:witness.researchBarSession,
    referenceCloseAt:witness.researchCloseAt,
    referencePublishedAt:witness.researchPublishedAt,
    sourceSnapshotHash:witness.sourceSnapshotHash,
    maxNotionalEuro:witness.entryLimitEuro,
    strategyReason:witness.strategyReason,
  },
});
assert.equal(signalHash,ORIGINAL_CBA_SIGNAL_HASH,'public witness must pin the EXACT historic CBA hash');
assert.equal(ledger.events.length,1);
const before=assess({ledger,nowIso:'2026-11-14T13:02:00.000Z'});
assert.equal(before.pendingSignalCount,1);
assert.equal(before.withinRegularWindowCount,1);
assert.equal(before.elapsedRegularWindowCount,0);
assert.equal(before.pendingCbaPilot?.ownerManualRetirementAvailable,false);
assert.equal(before.pendingCbaPilot?.evidenceDeadlineAt,'2026-11-15T05:11:00.000Z');
assert.equal(before.anyAutomaticJournalChange,false);
assert.equal(before.phase9Credit,0);
assert.equal(before.liveTradingAllowed,false);
assert.equal(ledger.events.length,1);
const elapsed=assess({ledger,nowIso:'2026-11-15T05:11:00.001Z'});
assert.equal(elapsed.elapsedRegularWindowCount,1);
assert.equal(elapsed.pendingCbaPilot?.ownerManualRetirementAvailable,true);
assert.equal(elapsed.pendingCbaPilot?.state,'REGULAR_48H_EVIDENCE_WINDOW_ELAPSED');
assert.throws(()=>expireOneGlobalEodSignal({
  previousLedger:ledger,nowIso:'2026-11-15T05:11:00.000Z',signalHash,
}),/EOD_PAPER_EXPIRY_WINDOW_STILL_OPEN/);
const result=expireOneGlobalEodSignal({
  previousLedger:ledger,nowIso:'2026-11-15T05:11:00.001Z',signalHash,
});
assert.equal(result.ledger.events.length,2);
assert.equal(result.ledger.events.at(-1).kind,'EXPIRE');
assert.equal(result.ledger.events[0].hash,signalHash);
assert.equal(result.ledger.cashEuro,1000);
assert.deepEqual(result.ledger.positions,{});
assert.deepEqual(result.pendingSignals,[]);
assert.equal(result.virtualFillsCreated,0);
assert.equal(replayOneGlobalEodPaperLedger(result.ledger).virtualBuys,0);
const after=assess({ledger:result.ledger,nowIso:'2026-11-16T10:00:00.000Z'});
assert.equal(after.pendingSignalCount,0);
assert.equal(after.pendingCbaPilot,null);
assert.equal(ledger.events.length,1);
assert.throws(()=>expireOneGlobalEodSignal({
  previousLedger:result.ledger,nowIso:'2026-11-16T10:00:00.000Z',signalHash,
}),/EOD_PAPER_EXPIRY_SIGNAL_NOT_OPEN/);
const corrupt=structuredClone(result.ledger);
corrupt.events[1].reason='OPERATOR_OVERRIDE';
assert.throws(()=>replayOneGlobalEodPaperLedger(corrupt),
 /EOD_PAPER_LEDGER_HASH_OR_CLOCK_INVALID/);

let original=JSON.stringify(ledger),etag='"e1"',writes=0;
const storage={
  privateAccess:true,durable:true,atomicCompareAndSwap:true,
  async read(){return {etag,body:original};},
  async compareAndSwap({expectedEtag,body,contentType}){
    if(expectedEtag!==etag)throw Error('CONCURRENT_MODIFICATION');
    assert.equal(contentType,'application/json');
    const next=JSON.parse(body);
    assert.deepEqual(next.events.slice(0,1),ledger.events);
    assert.equal(next.events.length,2);
    assert.equal(next.events.at(-1).kind,'EXPIRE');
    original=body;etag='"e2"';writes++;
    return {committed:true,etag};
  },
};
const committed=await commitOneGlobalCloudPrivateLedger({
  storage,
  makeNext:previousLedger=>expireOneGlobalEodSignal({
    previousLedger,nowIso:'2026-11-15T05:11:00.001Z',signalHash,
  }),
});
assert.equal(committed.committed,true);
assert.equal(committed.eventKind,'EXPIRE');
assert.equal(committed.newEvents,1);
assert.equal(committed.virtualBuys,0);
assert.equal(committed.virtualSells,0);
assert.equal(committed.phase9Credit,0);
assert.equal(committed.liveTradingAllowed,false);
assert.equal(writes,1);
await assert.rejects(
  commitOneGlobalCloudPrivateLedger({
    storage,
    makeNext:previousLedger=>expireOneGlobalEodSignal({
      previousLedger,nowIso:'2026-11-15T06:00:00.000Z',signalHash,
    }),
  }),/EOD_PAPER_EXPIRY_SIGNAL_NOT_OPEN/,
);
assert.equal(writes,1);
const route=readFileSync('app/api/paper/one-global-private-expire-cba/route.js','utf8');
assert.match(route,/feniceSameOrigin\(request\)/);
assert.match(route,/verifyFeniceOwnerSession/);
assert.match(route,/RETIRE_EXPIRED_CBA_ORIGINAL_PAPER_PILOT/);
assert.match(route,/commitOneGlobalCloudPrivateLedger/);
assert.match(route,/ORIGINAL_CBA_SIGNAL_HASH/);
assert.doesNotMatch(route,/export\s+(?:async\s+)?function\s+(?:GET|PUT|PATCH|DELETE)/);
assert.doesNotMatch(route,/console\.(?:log|error)|newOneGlobalEodPaperLedger|\bsettleOneGlobalEodSignal\b/);
const page=readFileSync('app/recupero-paper/page.tsx','utf8');
assert.match(page,/ownerManualRetirementAvailable/);
assert.match(page,/RETIRE_EXPIRED_CBA_ORIGINAL_PAPER_PILOT/);
assert.match(page,/credentials:"same-origin"/);
assert.match(page,/Archivia segnale CBA scaduto/);
console.log('PASS FENICE original CBA pilot: real public signal hash, DST cutoff, too-early blocked, single append-only EXPIRE via CAS, no fills or Directa.');
