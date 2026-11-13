/**
 * No live provider, no secrets, no broker: regression of private invalid-BAMI
 * recovery using ephemeral synthetic journal records on private temp disk.
 */
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {
  newOneGlobalEodPaperLedger,recordOneGlobalEodSignal,
  replayOneGlobalEodPaperLedger,
} from "../lib/trading/one-global-eod-paper.mjs";

const ROOT=mkdtempSync(join(tmpdir(),"fenice-private-bami-recovery-"));
const runner="scripts/run-one-global-eod-private.mjs";
const iso="2026-11-12T14:36:22.791Z";
function createSignal(now,refSession,close,published){
 return recordOneGlobalEodSignal({
  previousLedger:newOneGlobalEodPaperLedger(),nowIso:now,
  signal:{signalId:"synthetic-bami-eod-test",key:"XMIL:BAMI",mic:"XMIL",
   side:"BUY",currency:"EUR",decisionAt:now,
   referenceSessionDate:refSession,referenceCloseAt:close,
   referencePublishedAt:published,sourceSnapshotHash:"b".repeat(64),
   maxNotionalEuro:50,strategyReason:"UPTREND_CONFIRMATION"},
 }).ledger;
}
const invalid=createSignal(iso,"2026-11-11",
 "2026-11-11T16:30:00.000Z","2026-11-11T17:00:00.000Z");
const valid=createSignal("2026-11-12T18:10:00.000Z","2026-11-12",
 "2026-11-12T16:30:00.000Z","2026-11-12T17:00:00.000Z");
function run(args){
 return JSON.parse(execFileSync(process.execPath,[runner,...args],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
}
function failure(args,re){
 assert.throws(()=>run(args),re);
}
try{
 const path=join(ROOT,"private-eod-ledger.json");
 writeFileSync(path,JSON.stringify(invalid,null,2)+"\n",{mode:0o600});
 const before=readFileSync(path,"utf8");
 const args=["--cancel-invalid-bami","--ledger="+path];
 const dry=run(args);
 assert.equal(dry.action,"CANCEL");
 assert.equal(dry.autoDetectedInvalidBami,true);
 assert.equal(dry.committedToPrivateDisk,false);
 assert.equal(dry.newJournalEvents,1);
 assert.equal(dry.virtualBuys,0);
 assert.equal(dry.virtualSells,0);
 assert.equal(dry.phase9CertificationCredit,0);
 assert.equal(dry.liveTradingAllowed,false);
 assert.equal(dry.brokerConnectivityAllowed,false);
 assert.equal(readFileSync(path,"utf8"),before,"DRY-RUN cannot mutate original private disk");
 const applied=run([...args,"--commit"]);
 assert.equal(applied.action,"CANCEL");
 assert.equal(applied.committedToPrivateDisk,true);
 assert.equal(applied.newJournalEvents,1);
 const after=JSON.parse(readFileSync(path,"utf8"));
 assert.equal(after.events.length,2);
 assert.equal(after.events[1].kind,"CANCEL");
 assert.equal(after.events[1].reason,"INVALID_PROSPECTIVE_EOD_WINDOW");
 assert.equal(after.cashEuro,1000);
 assert.equal(after.positions["XMIL:BAMI"],undefined);
 assert.equal(replayOneGlobalEodPaperLedger(after).pendingSignals.length,0);
 assert.equal(after.liveTradingAllowed,false);
 failure(args,/EOD_BAMI_NO_PENDING_PRIVATE_SIGNAL/);
 // An owner-provided valid BAMI must NEVER be auto-canceled.
 writeFileSync(path,JSON.stringify(valid,null,2)+"\n");
 failure(args,/EOD_PAPER_INVALID_WINDOW_CANCELLATION_NOT_ALLOWED/);
 assert.equal(JSON.parse(readFileSync(path,"utf8")).events.length,1);
 failure([...args,"--event="+path],/EOD_BAMI_CANCEL_CANNOT_COMBINE_WITH_EVENT_OR_AUTHORITY/);
 const emptyPath=join(ROOT,"empty-private-ledger.json");
 failure(["--cancel-invalid-bami","--ledger="+emptyPath],
  /EOD_BAMI_NO_PENDING_PRIVATE_SIGNAL/);
 const unrelatedPath=join(ROOT,"other-private-ledger.json");
 const other=structuredClone(invalid);
 // Tampered ledger MUST fail chain validation rather than be rewritten.
 other.events[0].key="XMIL:ENEL";
 writeFileSync(unrelatedPath,JSON.stringify(other,null,2)+"\n");
 failure(["--cancel-invalid-bami","--ledger="+unrelatedPath],
  /EOD_PAPER_LEDGER_HASH_OR_CLOCK_INVALID/);
 console.log("PASS private BAMI recovery: hash-free preview, immutable dry-run, single CAS event, no valid-signal cancellation, no Directa.");
}finally{rmSync(ROOT,{recursive:true,force:true});}
