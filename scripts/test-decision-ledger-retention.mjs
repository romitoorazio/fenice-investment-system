import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MAX_DECISION_LEDGER_RECORDS,REQUIRED_CHECKPOINT_DAYS,retainDecisionLedgerRecords}
  from "../lib/intelligence/decision-ledger-retention.mjs";

const now="2026-11-15T18:00:00.000Z";
const pending={createdAt:"2026-11-01T00:00:00.000Z",entryReferencePrice:100,
  lastPrice:101,checkpoints:{},decision:"OSSERVA"};
const mature={createdAt:"2026-10-01T00:00:00.000Z",entryReferencePrice:100,
  lastPrice:102,checkpoints:{"30d":{measuredAt:"2026-11-02T00:00:00.000Z",
    price:102,returnPercent:2}},decision:"OSSERVA"};
assert.equal(MAX_DECISION_LEDGER_RECORDS,12000);
assert.equal(REQUIRED_CHECKPOINT_DAYS,30);
const first=Array.from({length:6200},()=>structuredClone(pending));
const ordinary=retainDecisionLedgerRecords(first,{nowIso:now});
assert.equal(ordinary.records.length,6200);
assert.equal(ordinary.pending30dRecords,6200);
assert.equal(ordinary.safelyEvictedRecords,0);
assert.equal(ordinary.noSyntheticCheckpoints,true);
assert(ordinary.records.every(row=>!row.checkpoints["30d"]));
assert.deepEqual(first[0],pending,"retention must not mutate original research rows");

const tooMany=[...Array.from({length:3},()=>structuredClone(pending)),
  ...Array.from({length:12000},()=>structuredClone(pending))];
assert.throws(()=>retainDecisionLedgerRecords(tooMany,{nowIso:now}),
  /DECISION_LEDGER_PENDING_30D_RETENTION_REQUIRED:3/,
  "the exact bug: silent slice(-5000) would delete pending 30d proof");

const good=[...Array.from({length:3},()=>structuredClone(mature)),
  ...Array.from({length:12000},()=>structuredClone(pending))];
const saved=retainDecisionLedgerRecords(good,{nowIso:now});
assert.equal(saved.records.length,12000);
assert.equal(saved.safelyEvictedRecords,3);
assert.equal(saved.pending30dRecords,12000);
assert.equal(good.length,12003);
assert.equal(saved.noPaperMutations,true);
assert.equal(saved.liveTradingAllowed,false);
assert.equal(saved.brokerConnectivityAllowed,false);

const invalidCheckpoint=structuredClone(mature);
invalidCheckpoint.checkpoints["30d"].measuredAt="2026-10-25T00:00:00.000Z";
assert.throws(()=>retainDecisionLedgerRecords([invalidCheckpoint,...good.slice(3)],{nowIso:now}),
  /PENDING_30D/,"backdated or fabricated 30d measurement cannot permit eviction");
const futureCheckpoint=structuredClone(mature);
futureCheckpoint.checkpoints["30d"].measuredAt="2026-11-18T00:00:00.000Z";
assert.throws(()=>retainDecisionLedgerRecords([futureCheckpoint,...good.slice(3)],{nowIso:now}),/PENDING_30D/);
const missingCheckpoint=structuredClone(mature);
missingCheckpoint.checkpoints={};
assert.throws(()=>retainDecisionLedgerRecords([missingCheckpoint,...good.slice(3)],{nowIso:now}),/PENDING_30D/);
const unpricedOld={createdAt:mature.createdAt,entryReferencePrice:null,lastPrice:null,checkpoints:{}};
assert.equal(retainDecisionLedgerRecords([unpricedOld,...good.slice(3)],{nowIso:now}).safelyEvictedRecords,1,
  "record with no initial price can never certify a 30d return");
const unknownDate={createdAt:"yesterday",entryReferencePrice:100,checkpoints:{}};
assert.throws(()=>retainDecisionLedgerRecords([unknownDate,...good.slice(3)],{nowIso:now}),/PENDING_30D/);
for(const bad of ["bad-date",null,undefined]){
  assert.throws(()=>retainDecisionLedgerRecords([pending],{nowIso:bad}),/RETENTION_CLOCK_INVALID/);
}
assert.throws(()=>retainDecisionLedgerRecords(null,{nowIso:now}),/RECORDS_INVALID/);
assert.throws(()=>retainDecisionLedgerRecords(good,{nowIso:now,maxRecords:5000}),/RETENTION_LIMIT_INVALID/);

// Real repository witness: 5,000 stored records on 19 October, zero 30d
// checkpoints. Do not change historical rows or retroactively add any.
const ledger=JSON.parse(readFileSync("data/decision-ledger.json","utf8"));
const existing=Array.isArray(ledger.records)?ledger.records:[];
const current=retainDecisionLedgerRecords(existing,{nowIso:new Date().toISOString()});
assert.equal(current.records.length,existing.length);
assert.equal(current.safelyEvictedRecords,0);
assert.equal(current.records.filter(x=>x.checkpoints?.["30d"]?.measuredAt).length,
  existing.filter(x=>x.checkpoints?.["30d"]?.measuredAt).length);
console.log("Decision ledger 30-day retention: PASS; pending checkpoints preserved, silent eviction rejected, no PAPER/LIVE changes.");
