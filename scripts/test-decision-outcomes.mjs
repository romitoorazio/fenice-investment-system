import assert from "node:assert/strict";
import {
  buildHistoricalDecisionOutcomeBackfill,
  classifyDecisionOutcome,
  classifyRestraintBias,
  selectDecisionOutcomeCandidates,
  summarizeDecisionOutcomes,
  updateDecisionOutcomeLedger,
} from "../lib/intelligence/decision-outcomes.mjs";

function decision(symbol, currentPrice, overrides = {}) {
  return {
    symbol,
    decision: "OSSERVA",
    terminalDecision: "ACCUMULA",
    committeeScore: 70,
    rawConfidenceBeforeCalibration: 98,
    confidence: 88,
    riskScore: 30,
    currentPrice,
    currency: "USD",
    ...overrides,
  };
}

assert.equal(classifyDecisionOutcome("COMPRA", 2).favorable, true);
assert.equal(classifyDecisionOutcome("COMPRA", -2).favorable, false);
assert.equal(classifyDecisionOutcome("EVITA", -2).favorable, true);
assert.equal(classifyDecisionOutcome("EVITA", 2).class, "SFAVOREVOLE");
assert.equal(classifyDecisionOutcome("ATTENDI", 2).class, "OPPORTUNITA_PERSA");
assert.equal(classifyDecisionOutcome("OSSERVA", -2).class, "PERDITA_EVITATA");
assert.equal(classifyDecisionOutcome("OSSERVA", 0.5).class, "NEUTRALE");
assert.equal(classifyRestraintBias({ sampleSize: 20, missedUpsidePercent: 20, avoidedLossPercent: 4 }), "TOO_CAUTIOUS");
assert.equal(classifyRestraintBias({ sampleSize: 20, missedUpsidePercent: 4, avoidedLossPercent: 20 }), "PROTECTION_VALUE");
assert.equal(classifyRestraintBias({ sampleSize: 20, missedUpsidePercent: 10, avoidedLossPercent: 12 }), "BALANCED");
assert.equal(classifyRestraintBias({ sampleSize: 5, missedUpsidePercent: 10, avoidedLossPercent: 0 }), "INSUFFICIENT");

const selected = selectDecisionOutcomeCandidates([
  decision("SPY", 100),
  decision("QQQ", 200, { decision: "ATTENDI" }),
  decision("NVDA", 300, { decision: "COMPRA" }),
  decision("BTC", 400, { decision: "EVITA" }),
  decision("BAD", 0),
  decision("OTHER", 10, { decision: "IGNORA" }),
]);
assert.deepEqual(selected.map((x) => x.symbol), ["SPY", "QQQ", "NVDA", "BTC"]);
assert(selected.every((x) => x.liveTradingAllowed === false && x.executionEligible === false));

const history = buildHistoricalDecisionOutcomeBackfill([
  { generatedAt: "2026-09-24T20:00:00Z", marketRegime: "ATTENDERE", allDecisions: [decision("SPY", 100)] },
  { generatedAt: "2026-09-24T22:00:00Z", marketRegime: "ATTENDERE", allDecisions: [decision("SPY", 101)] },
  { generatedAt: "2026-09-25T22:00:00Z", marketRegime: "ATTENDERE", allDecisions: [decision("SPY", 99)] },
  { generatedAt: "2026-09-26T22:00:00Z", marketRegime: "ATTENDERE", allDecisions: [decision("SPY", 999)] },
  { generatedAt: "2026-10-01T22:00:00Z", marketRegime: "ATTENDERE", allDecisions: [decision("SPY", 105)] },
], { maxCheckpointDelayDays: 4 });

assert.equal(history.records.some((r) => r.observationDate === "2026-09-26"), false);
const sep24 = history.records.find((r) => r.id === "2026-09-24:SPY:OSSERVA");
assert(sep24);
assert.equal(sep24.referencePrice, 101);
assert.equal(sep24.checkpoints["1d"].price, 99);
assert.equal(sep24.checkpoints["1d"].outcome.class, "PERDITA_EVITATA");
assert.equal(sep24.checkpoints["7d"].price, 105);

const start = new Date("2026-10-01T22:00:00Z");
const first = updateDecisionOutcomeLedger(
  { records: [] },
  selectDecisionOutcomeCandidates([
    decision("SPY", 100, { decision: "ATTENDI" }),
    decision("NVDA", 50, { decision: "COMPRA" }),
    decision("BTC", 25, { decision: "EVITA" }),
  ]),
  new Map([["SPY", 100], ["NVDA", 50], ["BTC", 25]]),
  { cycleId: "c1", marketRegime: "ATTENDERE", now: start },
);
assert.equal(first.recordCount, 3);

const sameDay = updateDecisionOutcomeLedger(
  first,
  selectDecisionOutcomeCandidates([decision("SPY", 101, { decision: "ATTENDI" })]),
  new Map([["SPY", 101], ["NVDA", 50], ["BTC", 25]]),
  { cycleId: "c2", marketRegime: "ATTENDERE", now: new Date("2026-10-01T23:00:00Z") },
);
assert.equal(sameDay.recordCount, 3, "same decision/symbol/day must not duplicate");

const day2 = updateDecisionOutcomeLedger(
  sameDay,
  [],
  new Map([["SPY", 97], ["NVDA", 55], ["BTC", 28]]),
  { cycleId: "c3", marketRegime: "ATTENDERE", now: new Date("2026-10-03T22:00:00Z") },
);
assert(day2.records.every((r) => r.checkpoints["1d"]));
// Delayed/out-of-order collection must never overwrite more recent as-of
// research evidence or reset checkpoint outcomes to an older quotation.
const reversed = updateDecisionOutcomeLedger(
  day2, [],
  new Map([["SPY", 150], ["NVDA", 2], ["BTC", 60]]),
  { cycleId: "delayed-replay", now: new Date("2026-10-02T22:00:00Z") },
);
for (const symbol of ["SPY", "NVDA", "BTC"]) {
  const recent = day2.records.find(r => r.symbol === symbol);
  const delayed = reversed.records.find(r => r.symbol === symbol);
  assert.equal(delayed.lastPrice, recent.lastPrice, symbol + " must keep newest verified price");
  assert.equal(delayed.lastMarkedAt, recent.lastMarkedAt, symbol + " mark cannot travel backwards");
  assert.equal(delayed.markToMarketPercent, recent.markToMarketPercent);
  assert.deepEqual(delayed.checkpoints, recent.checkpoints, "earned checkpoints must remain immutable");
}
const duplicateInstant = updateDecisionOutcomeLedger(
  day2, [], new Map([["SPY", 900]]),
  { cycleId: "same-instant", now: new Date("2026-10-03T22:00:00Z") },
);
assert.equal(duplicateInstant.records.find(r=>r.symbol==="SPY").lastPrice, 97,
  "same-timestamp rival quotation must never rewrite an existing mark");
const futureBorn = structuredClone(first);
futureBorn.records[0].createdAt = "2026-10-12T22:00:00.000Z";
futureBorn.records[0].lastMarkedAt = null;
const preBirth = updateDecisionOutcomeLedger(
  futureBorn, [], new Map([["SPY", 450]]),
  { cycleId: "pre-birth", now: new Date("2026-10-03T22:00:00Z") },
);
assert.equal(preBirth.records[0].lastPrice, 100,
  "a quote that predates the decision must not create a manufactured return");
const invalidPriorClock = structuredClone(first);
invalidPriorClock.records[0].lastMarkedAt = "not-a-timestamp";
const failedChronology = updateDecisionOutcomeLedger(
  invalidPriorClock, [], new Map([["SPY", 450]]),
  { cycleId: "invalid-prior-clock", now: new Date("2026-10-03T22:00:00Z") },
);
assert.equal(failedChronology.records[0].lastPrice, 100,
  "invalid chronology cannot silently become valid research evidence");
assert.throws(() => updateDecisionOutcomeLedger(first, [], new Map(), {now: new Date(NaN)}),
  /INVALID_V7_LEDGER_CLOCK/);

const summary = summarizeDecisionOutcomes(day2.records, "1d");
assert.equal(summary.sampleSize, 3);
assert.equal(summary.decisions.COMPRA.favorableRatePercent, 100);
assert.equal(summary.decisions.EVITA.favorableRatePercent, 0);
assert(summary.restraintTradeoff.avoidedLossPercent > 0);
assert.equal(summary.restraintTradeoff.biasState, "INSUFFICIENT");
assert(Number.isFinite(summary.restraintTradeoff.netProtectionMinusMissedPerDecisionPercent));

const late = updateDecisionOutcomeLedger(
  sameDay,
  [],
  new Map([["SPY", 110], ["NVDA", 60], ["BTC", 20]]),
  { cycleId: "late", marketRegime: "ATTENDERE", now: new Date("2026-10-09T22:00:00Z") },
);
assert(late.records.every((r) => !r.checkpoints["1d"]), "late marks cannot be mislabeled as 1d");
assert(late.records.every((r) => r.checkpoints["7d"]), "7d mark may use grace window");


// Money-making evaluations must not convert missing price evidence into a
// fabricated zero quote or into a winning/losing trading outcome.
for (const absent of [null, undefined, "", "   ", "N/D", Number.NaN, Infinity, -Infinity]) {
  assert.equal(classifyDecisionOutcome("COMPRA", absent), null, "missing return must remain unclassified");
}
const missingCandidates = selectDecisionOutcomeCandidates([
  decision("NULL", null),
  decision("EMPTY", ""),
  decision("SPACES", "   "),
  decision("ZERO", 0),
  decision("NEGATIVE", -4),
  decision("VALID", "101.25", { confidence: null, committeeScore: "", riskScore: undefined }),
]);
assert.deepEqual(missingCandidates.map(item => item.symbol), ["VALID"]);
assert.equal(missingCandidates[0].confidence, null);
assert.equal(missingCandidates[0].committeeScore, null);
assert.equal(missingCandidates[0].riskScore, null);

const badHistoricPrice = buildHistoricalDecisionOutcomeBackfill([
  { generatedAt: "2026-09-24T20:00:00Z", allDecisions: [decision("SPY", 100)] },
  { generatedAt: "2026-09-25T20:00:00Z", allDecisions: [decision("SPY", null)] },
  { generatedAt: "2026-09-28T20:00:00Z", allDecisions: [decision("QQQ", 100)] },
]);
const initialSpy = badHistoricPrice.records.find(r => r.symbol === "SPY");
assert(initialSpy, "historical reference remains preserved");
assert.equal(initialSpy.checkpoints["1d"], undefined,
  "missing next-day quote must not create an artificial 100 percent loss");
assert.equal(initialSpy.checkpoints["7d"], undefined);
assert.equal(badHistoricPrice.records.some(r => r.symbol === "SPY" && r.referencePrice === 0), false);

for (const invalidPrice of [null, undefined, 0, "", "   ", -3, Number.NaN]) {
  const marked = updateDecisionOutcomeLedger(first, [], new Map([["SPY", invalidPrice]]), {
    cycleId: "missing-prices",
    now: new Date("2026-10-03T22:00:00Z"),
  });
  const spy = marked.records.find(r => r.symbol === "SPY");
  assert.equal(spy.checkpoints["1d"], undefined, "invalid quotes cannot become 1d outcomes");
  assert.equal(spy.lastPrice, 100, "invalid quotes cannot change stored last valid price");
  assert.equal(spy.lastMarkedAt, "2026-10-01T22:00:00.000Z",
    "invalid quotes cannot advance the last-verified timestamp");
}
const malformedSummary = summarizeDecisionOutcomes([
  {
    symbol: "SPY", decision: "EVITA", referencePrice: 100,
    checkpoints: { "1d": { price: null, measuredAt: "2026-10-02T22:00:00Z", source: "committee-history", returnPercent: -100 } },
  },
  {
    symbol: "QQQ", decision: "COMPRA", referencePrice: 100,
    checkpoints: { "1d": { price: 120, measuredAt: "2026-10-02T22:00:00Z", source: "committee-history", returnPercent: null } },
  },
  {
    symbol: "SPY-FAKE", decision: "COMPRA", referencePrice: 100,
    checkpoints: { "1d": { price: 120, measuredAt: "2026-10-02T22:00:00Z", source: "committee-history", returnPercent: 9999 } },
  },
  {
    symbol: "TSM", decision: "COMPRA", referencePrice: 100,
    checkpoints: { "1d": { price: 120, measuredAt: "2026-10-02T22:00:00Z", source: "committee-history", returnPercent: 20 } },
  },
], "1d");
assert.equal(malformedSummary.sampleSize, 1, "only complete evidence should count towards profitability");
assert.equal(malformedSummary.decisions.COMPRA.sampleSize, 1);
assert.equal(malformedSummary.decisions.COMPRA.favorableRatePercent, 100);
assert.equal(malformedSummary.decisions.EVITA.sampleSize, 0);
assert.equal(malformedSummary.decisions.EVITA.favorableRatePercent, null);

const forgedCandidate = updateDecisionOutcomeLedger(first, [
  { symbol: "ZERO", decision: "COMPRA", referencePrice: 0 },
  { symbol: "MISSING", decision: "EVITA", referencePrice: null },
], new Map(), { now: new Date("2026-10-04T22:00:00Z") });
assert.equal(forgedCandidate.recordCount, 3, "unverified new decision entries must not enter the scorecard");

console.log("Fenice V7 decision outcome engine: PASS");
