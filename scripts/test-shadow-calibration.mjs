import assert from "node:assert/strict";
import {
  buildHistoricalShadowBackfill,
  buildShadowOutcomeSamples,
  selectShadowCalibrationCandidates,
  updateShadowCalibrationLedger,
} from "../lib/intelligence/shadow-calibration.mjs";

function candidateDecision(symbol, currentPrice, overrides = {}) {
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
    scorecard: { valuation: 50 },
    valuation: { status: "non applicabile" },
    ...overrides,
  };
}

const candidates = selectShadowCalibrationCandidates([
  candidateDecision("SPY", 780),
  candidateDecision("QQQ", 760, { riskScore: 33 }),
  candidateDecision("BAD", 10, { decision: "COMPRA", committeeScore: 90, rawConfidenceBeforeCalibration: 99, confidence: 90, riskScore: 20, scorecard: { valuation: 80 } }),
  candidateDecision("NOACC", 10, { terminalDecision: "ATTENDI", committeeScore: 80, rawConfidenceBeforeCalibration: 99, confidence: 89, riskScore: 20, scorecard: { valuation: 80 } }),
  candidateDecision("RISK", 10, { committeeScore: 80, rawConfidenceBeforeCalibration: 99, confidence: 89, riskScore: 90, scorecard: { valuation: 80 } }),
]);

assert.deepEqual(candidates.map((item) => item.symbol), ["SPY", "QQQ"]);
for (const item of candidates) {
  assert.equal(item.researchOnly, true);
  assert.equal(item.calibrationOnly, false);
  assert.equal(item.executionEligible, false);
  assert.equal(item.paperCertificationEligible, false);
  assert.equal(item.brokerSubmissionAllowed, false);
  assert.equal(item.liveTradingAllowed, false);
}
assert.equal(candidates[0].readiness.blockedOnlyByCalibration, false);
assert(candidates[0].readiness.scoreGap > 0);
assert(candidates[0].readiness.valuationGap > 0);

const historical = buildHistoricalShadowBackfill([
  {
    generatedAt: "2026-09-24T20:00:00Z",
    allDecisions: [
      candidateDecision("SPY", 100),
      candidateDecision("LEGACY", 50, { rawConfidenceBeforeCalibration: undefined }),
    ],
  },
  {
    generatedAt: "2026-09-24T22:00:00Z",
    allDecisions: [candidateDecision("SPY", 101)],
  },
  {
    generatedAt: "2026-09-25T22:00:00Z",
    allDecisions: [candidateDecision("SPY", 102)],
  },
  {
    generatedAt: "2026-09-26T22:00:00Z",
    allDecisions: [candidateDecision("SPY", 999)],
  },
  {
    generatedAt: "2026-10-01T22:00:00Z",
    allDecisions: [candidateDecision("SPY", 110)],
  },
], { maxCheckpointDelayDays: 4 });

assert.equal(historical.isolation.liveTradingAllowed, false);
assert.equal(historical.methodology.requiresRawConfidenceBeforeCalibration, true);
assert.equal(historical.records.some((record) => record.symbol === "LEGACY"), false, "legacy non-comparable confidence must be excluded");
assert.equal(historical.records.some((record) => record.observationDate === "2026-09-26"), false, "weekend must not create a research observation");
const sep24 = historical.records.find((record) => record.id === "2026-09-24:SPY");
assert(sep24, "latest comparable snapshot for the weekday must seed SPY");
assert.equal(sep24.referencePrice, 101, "latest snapshot of the UTC weekday must be used");
assert.equal(sep24.checkpoints["1d"].price, 102);
assert.equal(sep24.checkpoints["7d"].price, 110);
assert.equal(sep24.checkpoints["7d"].source, "committee-history");

const day0 = new Date("2026-10-01T22:00:00Z");
const first = updateShadowCalibrationLedger(
  { records: [] },
  candidates,
  new Map([["SPY", 780], ["QQQ", 760]]),
  { cycleId: "cycle-1", now: day0 },
);
assert.equal(first.recordCount, 2);

const sameDay = updateShadowCalibrationLedger(
  first,
  candidates,
  new Map([["SPY", 782], ["QQQ", 758]]),
  { cycleId: "cycle-2", now: new Date("2026-10-01T23:00:00Z") },
);
assert.equal(sameDay.recordCount, 2, "must not oversample the same symbol more than once per UTC day");

const lateOnly = updateShadowCalibrationLedger(
  sameDay,
  [],
  new Map([["SPY", 800], ["QQQ", 750]]),
  { cycleId: "cycle-late", now: new Date("2026-10-09T22:00:00Z") },
);
assert(lateOnly.records.every((record) => !record.checkpoints["1d"]), "a late price must never be mislabeled as a 1d checkpoint");
assert(lateOnly.records.every((record) => record.checkpoints["7d"]), "7d checkpoint may be recorded inside its grace window");

const day2 = updateShadowCalibrationLedger(
  sameDay,
  [],
  new Map([["SPY", 790], ["QQQ", 755]]),
  { cycleId: "cycle-2d", now: new Date("2026-10-03T22:00:00Z") },
);
assert(day2.records.every((record) => record.checkpoints["1d"]));

const day8 = updateShadowCalibrationLedger(
  day2,
  [],
  new Map([["SPY", 800], ["QQQ", 750]]),
  { cycleId: "cycle-8d", now: new Date("2026-10-09T22:00:00Z") },
);
assert(day8.records.every((record) => record.checkpoints["1d"]));
assert(day8.records.every((record) => record.checkpoints["7d"]));
assert.equal(buildShadowOutcomeSamples(day8.records, "7d").length, 2);

console.log("Fenice V7 shadow calibration historical + longitudinal guards: PASS");
