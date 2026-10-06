import assert from "node:assert/strict";
import {
  buildShadowOutcomeSamples,
  selectShadowCalibrationCandidates,
  updateShadowCalibrationLedger,
} from "../lib/intelligence/shadow-calibration.mjs";

const candidates = selectShadowCalibrationCandidates([
  {
    symbol: "SPY",
    decision: "OSSERVA",
    terminalDecision: "ACCUMULA",
    committeeScore: 70,
    rawConfidenceBeforeCalibration: 98,
    confidence: 88,
    riskScore: 30,
    currentPrice: 780,
    currency: "USD",
    scorecard: { valuation: 50 },
    valuation: { status: "non applicabile" },
  },
  {
    symbol: "QQQ",
    decision: "OSSERVA",
    terminalDecision: "ACCUMULA",
    committeeScore: 70,
    rawConfidenceBeforeCalibration: 98,
    confidence: 88,
    riskScore: 33,
    currentPrice: 760,
    currency: "USD",
    scorecard: { valuation: 50 },
    valuation: { status: "non applicabile" },
  },
  {
    symbol: "BAD",
    decision: "COMPRA",
    terminalDecision: "ACCUMULA",
    committeeScore: 90,
    rawConfidenceBeforeCalibration: 99,
    confidence: 90,
    riskScore: 20,
    currentPrice: 10,
    currency: "USD",
    scorecard: { valuation: 80 },
  },
  {
    symbol: "NOACC",
    decision: "OSSERVA",
    terminalDecision: "ATTENDI",
    committeeScore: 80,
    rawConfidenceBeforeCalibration: 99,
    confidence: 89,
    riskScore: 20,
    currentPrice: 10,
    currency: "USD",
    scorecard: { valuation: 80 },
  },
  {
    symbol: "RISK",
    decision: "OSSERVA",
    terminalDecision: "ACCUMULA",
    committeeScore: 80,
    rawConfidenceBeforeCalibration: 99,
    confidence: 89,
    riskScore: 90,
    currentPrice: 10,
    currency: "USD",
    scorecard: { valuation: 80 },
  },
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

const day8 = updateShadowCalibrationLedger(
  sameDay,
  [],
  new Map([["SPY", 800], ["QQQ", 750]]),
  { cycleId: "cycle-3", now: new Date("2026-10-09T22:00:00Z") },
);
assert(day8.records.every((record) => record.checkpoints["1d"]));
assert(day8.records.every((record) => record.checkpoints["7d"]));
assert.equal(buildShadowOutcomeSamples(day8.records, "7d").length, 2);

console.log("Fenice V7 shadow calibration longitudinal guards: PASS");
