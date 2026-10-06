import assert from "node:assert/strict";
import { selectShadowCalibrationCandidates } from "../lib/intelligence/shadow-calibration.mjs";

const candidates = selectShadowCalibrationCandidates([
  { symbol: "SPY", decision: "OSSERVA", committeeScore: 70, rawConfidenceBeforeCalibration: 98, confidence: 88, riskScore: 30, currentPrice: 780, currency: "USD" },
  { symbol: "QQQ", decision: "OSSERVA", committeeScore: 70, rawConfidenceBeforeCalibration: 98, confidence: 88, riskScore: 33, currentPrice: 760, currency: "USD" },
  { symbol: "BAD", decision: "COMPRA", committeeScore: 90, rawConfidenceBeforeCalibration: 99, confidence: 90, riskScore: 20, currentPrice: 10, currency: "USD" },
  { symbol: "RISK", decision: "OSSERVA", committeeScore: 80, rawConfidenceBeforeCalibration: 99, confidence: 89, riskScore: 90, currentPrice: 10, currency: "USD" },
]);

assert.deepEqual(candidates.map((item) => item.symbol), ["SPY", "QQQ"]);
for (const item of candidates) {
  assert.equal(item.calibrationOnly, true);
  assert.equal(item.executionEligible, false);
  assert.equal(item.paperCertificationEligible, false);
  assert.equal(item.brokerSubmissionAllowed, false);
  assert.equal(item.liveTradingAllowed, false);
}
console.log("Fenice V7 shadow calibration selector: PASS");
