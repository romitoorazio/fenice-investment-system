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

console.log("Fenice V7 decision outcome engine: PASS");
