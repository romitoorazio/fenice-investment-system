import assert from "node:assert/strict";
import {
  selectForwardShadowCandidates,
  stagedReturnPercent,
  summarizeForwardShadowLedger,
  updateForwardShadowLedger,
} from "../lib/intelligence/horizon-shadow-evaluator.mjs";

function committee(generatedAt, price = 100) {
  return {
    generatedAt,
    marketRegime: "ATTENDERE",
    allDecisions: [
      {
        symbol: "SPY",
        name: "S&P 500 ETF",
        currentPrice: price,
        currency: "USD",
        priceEvidence: {observedAt: generatedAt,source: "fixture-official-quote",price,
          evidenceType: "TERMINAL_TECHNICAL_RESEARCH_ONLY",executionEligible: false},
        committeeScore: 70,
        confidence: 88,
        rawConfidenceBeforeCalibration: 98,
        riskScore: 30,
        decision: "OSSERVA",
        terminalDecision: "ACCUMULA",
        positionType: "CORE",
      },
      {
        symbol: "NVDA",
        name: "NVIDIA",
        currentPrice: price * 2,
        currency: "USD",
        priceEvidence: {observedAt: generatedAt,source: "fixture-official-quote",price: price*2,
          evidenceType: "TERMINAL_TECHNICAL_RESEARCH_ONLY",executionEligible: false},
        committeeScore: 68,
        rawConfidenceBeforeCalibration: 98,
        riskScore: 50,
        decision: "OSSERVA",
        terminalDecision: "ATTENDI",
        positionType: "CORE",
      },
    ],
  };
}

function horizon(generatedAt, spyState = "ACCUMULA_A_TRANCHE_SHADOW") {
  return {
    generatedAt,
    rows: [
      { symbol: "SPY", strategic: { state: spyState } },
      { symbol: "NVDA", strategic: { state: "NESSUNA_AZIONE_STRATEGICA" } },
    ],
  };
}

const t0 = new Date("2026-10-07T20:00:00Z");
const selected = selectForwardShadowCandidates(
  horizon("2026-10-07T19:50:00Z"),
  committee("2026-10-07T19:55:00Z"),
  t0,
);
assert.deepEqual(selected.map((item) => item.symbol), ["SPY"]);

const stale = selectForwardShadowCandidates(
  horizon("2026-10-05T19:50:00Z"),
  committee("2026-10-05T19:55:00Z"),
  t0,
);
assert.equal(stale.length, 0);

let ledger = updateForwardShadowLedger(
  { records: [] },
  {
    horizonReport: horizon("2026-10-07T19:50:00Z"),
    committee: committee("2026-10-07T19:55:00Z", 100),
  },
  { now: t0 },
);
assert.equal(ledger.recordCount, 1);
assert.equal(ledger.records[0].tranches[0].status, "EXECUTED");
assert.equal(ledger.records[0].tranches[1].status, "PENDING");
assert.equal(ledger.isolation.liveTradingAllowed, false);
assert.equal(ledger.methodology.historicalBackfillAllowed, false);

// Day 7: still eligible, tranche 2 executes and 7d checkpoint is measured.
const t7 = new Date("2026-10-14T20:00:00Z");
ledger = updateForwardShadowLedger(
  ledger,
  {
    horizonReport: horizon("2026-10-14T19:50:00Z"),
    committee: committee("2026-10-14T19:55:00Z", 110),
  },
  { now: t7 },
);
assert.equal(ledger.recordCount, 2, "a new verified entry date may form another prospective cohort");
assert.equal(ledger.records[1].id, "2026-10-14:SPY");
assert.equal(ledger.records[1].source.initialQuoteObservedAt, "2026-10-14T19:55:00Z");
assert.equal(ledger.methodology.maximumConcurrentRecordsPerSymbol, 32);
const r7 = ledger.records[0];
assert.equal(r7.tranches[1].status, "EXECUTED");
assert.equal(r7.tranches[1].price, 110);
assert.equal(r7.checkpoints["7d"].status, "MEASURED");
assert.equal(r7.checkpoints["7d"].quoteObservedAt, "2026-10-14T19:55:00Z");
assert.equal(r7.lastQuoteObservedAt,"2026-10-14T19:55:00Z");
assert.equal(r7.checkpoints["7d"].resultVsWait, "BEATS_WAIT");
assert.equal(r7.checkpoints["7d"].executedTrancheCount, 2);
assert.equal(stagedReturnPercent(r7.tranches, 110), 5);

// Day 14: signal invalidated, third tranche remains pending while inside grace.
const t14 = new Date("2026-10-21T20:00:00Z");
ledger = updateForwardShadowLedger(
  ledger,
  {
    horizonReport: horizon("2026-10-21T19:50:00Z", "NESSUNA_AZIONE_STRATEGICA"),
    committee: committee("2026-10-21T19:55:00Z", 105),
  },
  { now: t14 },
);
assert.equal(ledger.records[0].tranches[2].status, "PENDING");

// Day 19: invalidation persisted beyond grace, third tranche is skipped.
const t19 = new Date("2026-10-26T20:00:00Z");
ledger = updateForwardShadowLedger(
  ledger,
  {
    horizonReport: horizon("2026-10-26T19:50:00Z", "NESSUNA_AZIONE_STRATEGICA"),
    committee: committee("2026-10-26T19:55:00Z", 103),
  },
  { now: t19 },
);
assert.equal(ledger.records[0].tranches[2].status, "SKIPPED_SIGNAL_INVALIDATED");

// Day 30: checkpoint is measured from actually executed tranches only.
const t30 = new Date("2026-11-06T20:00:00Z");
ledger = updateForwardShadowLedger(
  ledger,
  {
    horizonReport: horizon("2026-11-06T19:50:00Z", "NESSUNA_AZIONE_STRATEGICA"),
    committee: committee("2026-11-06T19:55:00Z", 120),
  },
  { now: t30 },
);
const r30 = ledger.records[0];
assert.equal(r30.checkpoints["30d"].status, "MEASURED");
assert.equal(r30.checkpoints["30d"].executedTrancheCount, 2);
assert.equal(r30.checkpoints["30d"].resultVsWait, "BEATS_WAIT");

const summary7 = summarizeForwardShadowLedger(ledger.records, "7d");
const summary30 = summarizeForwardShadowLedger(ledger.records, "30d");
assert.equal(summary7.sampleSize, 2, "both October 7 and October 14 independent cohorts mature at 7d");
assert.equal(summary30.sampleSize, 1);
assert.equal(summary7.maturity, "INSUFFICIENT");
assert.equal(summary30.maturity, "INSUFFICIENT");

// A new calculation must not treat the newer Committee publication time as a
// fresh PRICE when its source quote still belongs to the prior market day.
const t1 = new Date("2026-10-08T20:00:00Z");
for (const [label, mutate] of [
  ["unknown quote time",row => { delete row.priceEvidence.observedAt; }],
  ["prior-day quote",row => { row.priceEvidence.observedAt = "2026-10-07T19:55:00Z"; }],
  ["future quote",row => { row.priceEvidence.observedAt = "2026-10-09T20:00:00Z"; }],
  ["impossible quote",row => { row.priceEvidence.observedAt = "2026-02-30T20:00:00Z"; }],
  ["price divergence",row => { row.priceEvidence.price = 1; }],
  ["unidentified provider",row => { row.priceEvidence.source = ""; }],
  ["execution-capable quote",row => { row.priceEvidence.executionEligible = true; }],
]) {
  const input = committee("2026-10-08T19:55:00Z", 108);
  mutate(input.allDecisions[0]);
  const output = updateForwardShadowLedger({records:[]},{
    horizonReport:horizon("2026-10-08T19:50:00Z"),committee:input,
  },{now:t1});
  assert.equal(output.recordCount, 0, label+" must not create an unverified forward entry");
  assert.equal(output.sourceState.selectedNow.length,0,label+" must not be admissible");
}
const validDay = updateForwardShadowLedger({records:[]},{
  horizonReport:horizon("2026-10-08T19:50:00Z"),
  committee:committee("2026-10-08T19:55:00Z",108),
},{now:t1});
assert.equal(validDay.recordCount,1);
assert.equal(validDay.records[0].source.initialQuoteObservedAt,"2026-10-08T19:55:00Z");
const rerun = updateForwardShadowLedger(validDay,{
  horizonReport:horizon("2026-10-08T19:50:00Z"),
  committee:committee("2026-10-08T19:55:00Z",108),
},{now:new Date("2026-10-08T20:03:00Z")});
assert.equal(rerun.recordCount,1,"one observation per symbol per UTC date");
assert.equal(rerun.records[0].lastQuoteObservedAt, validDay.records[0].lastQuoteObservedAt,
  "replaying the same quote must not re-mark synthetic prices");
const oldPrice = committee("2026-10-09T19:59:00Z", 990);
oldPrice.allDecisions[0].priceEvidence.observedAt = "2026-10-08T19:55:00Z";
const noStaleMutation = updateForwardShadowLedger(validDay,{
  horizonReport:horizon("2026-10-09T19:50:00Z"),committee:oldPrice,
},{now:new Date("2026-10-09T20:00:00Z")});
assert.equal(JSON.stringify(noStaleMutation.records), JSON.stringify(validDay.records),
  "stale committee quotes must not reprice old experiments");


// Forward-only: stale sources must not create new observations or mutate the record.
const before = JSON.stringify(ledger.records);
const staleRun = updateForwardShadowLedger(
  ledger,
  {
    horizonReport: horizon("2026-10-01T00:00:00Z"),
    committee: committee("2026-10-01T00:00:00Z", 999),
  },
  { now: new Date("2026-11-07T20:00:00Z") },
);
assert.equal(staleRun.recordCount, ledger.recordCount);
assert.equal(JSON.stringify(staleRun.records), before);

console.log("Fenice V7 forward shadow strategy evaluator: PASS");
