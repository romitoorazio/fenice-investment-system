import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  mkdtempSync,readFileSync,writeFileSync,unlinkSync,
  readdirSync,statSync,rmSync,
} from "node:fs";
import {
  newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
  replayOneGlobalEodPaperLedger,
} from "../lib/trading/one-global-eod-paper.mjs";
import {commitOneGlobalPrivateEodLedger as commit}
  from "../lib/trading/one-global-eod-private-store.mjs";

// Strictly synthetic test records; not actual quotes or investable signals.
const stamp="2026-11-12T18:10:00.000Z";
function signal(key,id,referenceCloseAt="2026-11-12T16:30:00.000Z"){
  const mic=key.split(":")[0];
  return {signalId:id,key,mic,side:"BUY",currency:"EUR",
    decisionAt:stamp,referenceSessionDate:"2026-11-12",
    referenceCloseAt,referencePublishedAt:"2026-11-12T17:00:00.000Z",
    sourceSnapshotHash:"a".repeat(64),
    maxNotionalEuro:50,strategyReason:"UPTREND_CONFIRMATION"};
}
const root=mkdtempSync(join(tmpdir(),"fenice-private-eod-store-"));
const ledgerPath=join(root,"first-paper-ledger.json");
const initial=newOneGlobalEodPaperLedger();
const cbaStyle=recordOneGlobalEodSignal({
  previousLedger:initial,nowIso:stamp,
  signal:signal("XMIL:BAMI","private-fixture-bami-001"),
}).ledger;
const alternate=recordOneGlobalEodSignal({
  previousLedger:initial,nowIso:stamp,
  signal:signal("XETR:DTE","private-fixture-xetra-002"),
}).ledger;
try{
  const first=commit({ledgerPath,expectedLedger:initial,nextLedger:cbaStyle});
  assert.equal(first.committed,true);
  assert.equal(first.newEvents,1);
  assert.equal(first.phase9Credit,0);
  assert.equal(first.liveTradingAllowed,false);
  assert.equal(first.brokerConnectivityAllowed,false);
  assert.equal(readdirSync(root).length,1,"lock and tmp must be cleaned");
  const firstOnDisk=readFileSync(ledgerPath,"utf8");
  assert.deepEqual(JSON.parse(firstOnDisk),cbaStyle);
  if(process.platform!=="win32")
    assert.equal(statSync(ledgerPath).mode & 0o777,0o600,
      "private PAPER ledger is readable only by owner on POSIX");

  // Second provider/process read the same initial snapshot. Even a fully
  // replay-valid different journal MUST NOT replace the first's fill/signal.
  assert.throws(()=>commit({
    ledgerPath,expectedLedger:initial,nextLedger:alternate,
  }),/EOD_PRIVATE_LEDGER_STALE_RELOAD_AND_RECHECK/);
  assert.equal(readFileSync(ledgerPath,"utf8"),firstOnDisk);
  assert.equal(readdirSync(root).length,1);

  // Following the actual reload-and-rebase path, append the other signal.
  const current=JSON.parse(readFileSync(ledgerPath,"utf8"));
  const second=recordOneGlobalEodSignal({
    previousLedger:current,nowIso:stamp,
    signal:signal("XETR:DTE","private-fixture-xetra-002"),
  }).ledger;
  const r=commit({ledgerPath,expectedLedger:current,nextLedger:second});
  assert.equal(r.lastHash,second.lastHash);
  const replay=replayOneGlobalEodPaperLedger(
    JSON.parse(readFileSync(ledgerPath,"utf8")));
  assert.equal(replay.valid,true);
  assert.deepEqual(replay.pendingSignals,["XETR:DTE","XMIL:BAMI"]);
  assert.equal(replay.cashEuro,1000);
  assert.equal(replay.virtualBuys,0);

  // If another private write holds the lock, refusing is safer than silently
  // discarding either result. The actual lock owner clears it.
  const expected=JSON.parse(readFileSync(ledgerPath,"utf8"));
  const third=recordOneGlobalEodSignal({
    previousLedger:expected,nowIso:stamp,
    signal:signal("XPAR:SAN","private-fixture-paris-003"),
  }).ledger;
  writeFileSync(ledgerPath+".lock","owned by simulated writer",{mode:0o600});
  assert.throws(()=>commit({ledgerPath,expectedLedger:expected,nextLedger:third}),
    /EOD_PRIVATE_LEDGER_LOCK_BUSY/);
  assert.equal(JSON.parse(readFileSync(ledgerPath,"utf8")).events.length,2);
  unlinkSync(ledgerPath+".lock");

  const reduced=structuredClone(expected);
  assert.throws(()=>commit({
    ledgerPath,expectedLedger:expected,nextLedger:reduced,
  }),/EOD_PRIVATE_NOT_EXACTLY_ONE_FORWARD_EVENT/);

  const modified=structuredClone(third);
  modified.cashEuro=999999;
  assert.throws(()=>commit({
    ledgerPath,expectedLedger:expected,nextLedger:modified,
  }),/EOD_PAPER_LEDGER_REPLAY_ACCOUNT_MISMATCH/);

  // Under a fresh expected parent the same verified append succeeds once,
  // and attempting exactly the same update again is idempotently rejected.
  commit({ledgerPath,expectedLedger:expected,nextLedger:third});
  assert.throws(()=>commit({
    ledgerPath,expectedLedger:expected,nextLedger:third,
  }),/EOD_PRIVATE_LEDGER_STALE_RELOAD_AND_RECHECK/);
  assert.equal(JSON.parse(readFileSync(ledgerPath,"utf8")).events.length,3);
  assert.equal(readdirSync(root).length,1);
  console.log("PASS private EOD PAPER CAS: no overwritten concurrent CBA/BAMI events; lock, durability, permissions, fresh replay, no Directa or Phase9");
}finally{
  rmSync(root,{recursive:true,force:true});
}
