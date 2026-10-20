import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MAX_DECISION_LEDGER_RECORDS,REQUIRED_CHECKPOINT_DAYS,retainDecisionLedgerRecords}
  from "../lib/intelligence/decision-ledger-retention.mjs";
import {dailyResearchMark, eligibleDecisionCheckpoint, eligibleDecisionMark}
  from "../lib/intelligence/decision-ledger-price-evidence.mjs";

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
const runner=readFileSync("scripts/run-decision-ledger.mjs","utf8");
assert.match(runner,/JSON\.parse\(await readFile\(ledgerPath, 'utf8'\)\)/,
  "historical ledger must be read strictly, not fall back to empty on error");
assert.doesNotMatch(runner,/readJson\('decision-ledger\.json'/,
  "JSON corruption must not reset 30-day evidence");
assert.match(runner,/rename\(tmpPath,ledgerPath\)/,
  "store decision history using atomic replace");
assert.match(runner,/records:preservedRecords/,
  "publication must contain the full protected history, not slice(-5000)");
assert.doesNotMatch(runner,/records\.slice\(-5000\)/);

const observationClock = Date.parse('2026-10-20T18:00:00.000Z');
const sampleAsset = {
  symbol: 'SPY', currency: 'USD', price: 700,
  technical: {currency: 'USD', observedAt: '2026-10-20T13:30:00.000Z',
    timestampSemantics: 'DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE'},
};
const mark = dailyResearchMark(sampleAsset, observationClock);
assert.equal(mark.evidenceKind, 'DAILY_SESSION_BUCKET_RESEARCH_ONLY');
assert.equal(mark.executionEligible, false);
assert.equal(mark.price, 700);
assert.equal(dailyResearchMark({...sampleAsset, price:0},observationClock),null);
assert.equal(dailyResearchMark({...sampleAsset, price:NaN},observationClock),null);
assert.equal(dailyResearchMark({...sampleAsset, currency:'EUR'},observationClock),null);
assert.equal(dailyResearchMark({...sampleAsset, technical:{...sampleAsset.technical,observedAt:'2026-10-21T13:30:00.000Z'}},observationClock),null);
assert.equal(dailyResearchMark({...sampleAsset, technical:{...sampleAsset.technical,observedAt:'2026-10-01T13:30:00.000Z'}},observationClock),null);
assert.equal(dailyResearchMark({...sampleAsset, technical:{...sampleAsset.technical,timestampSemantics:'LIVE_LAST_TRADE'}},observationClock),null);
const recordAfterQuote = {currency:'USD',entryReferencePrice:680,createdAt:'2026-10-20T14:00:00.000Z'};
assert.equal(eligibleDecisionMark(recordAfterQuote,mark,observationClock),false,
  'Same-day candle predating a decision must not mark its performance');
const previousRecord = {currency:'USD',entryReferencePrice:680,createdAt:'2026-10-19T13:00:00.000Z'};
assert.equal(eligibleDecisionMark(previousRecord,mark,observationClock),true);
assert.equal(eligibleDecisionCheckpoint(previousRecord,mark,1,observationClock),true);
assert.equal(eligibleDecisionCheckpoint({...previousRecord,currency:'EUR'},mark,1,observationClock),false);
assert.equal(eligibleDecisionMark({...previousRecord,currency:'EUR'},mark,observationClock),false);
assert.equal(eligibleDecisionCheckpoint(previousRecord,mark,7,observationClock),false);
assert.equal(eligibleDecisionCheckpoint({entryReferencePrice:0,createdAt:previousRecord.createdAt},mark,1,observationClock),false);
assert.equal(eligibleDecisionCheckpoint({...previousRecord,createdAt:'2026-10-19T15:00:00.000Z'},mark,1,observationClock),false);
assert.equal(eligibleDecisionCheckpoint({...previousRecord,createdAt:'2026-11-01T00:00:00.000Z'},mark,1,observationClock),false);
assert.equal(eligibleDecisionCheckpoint({...previousRecord,createdAt:'2026-02-30T00:00:00.000Z'},mark,1,observationClock),false);
assert.equal(eligibleDecisionCheckpoint(previousRecord,mark,1,Date.parse('2026-10-20T12:00:00.000Z')),false);
const ledgerRunnerText=readFileSync('scripts/run-decision-ledger.mjs','utf8');
assert.match(ledgerRunnerText,/dailyResearchMark\(asset, now\.getTime\(\)\)/);
assert.match(ledgerRunnerText,/eligibleDecisionCheckpoint\(record, mark, minimumDays, now\.getTime\(\)\)/);
assert.match(ledgerRunnerText,/lastPriceObservedAt/);
assert.match(ledgerRunnerText,/markToMarketPercent: null/);
assert.match(ledgerRunnerText,/typeof value !== 'number'/);

console.log("Decision ledger as-of provenance + retention: PASS; no fake horizon evidence, PAPER/LIVE untouched.");
