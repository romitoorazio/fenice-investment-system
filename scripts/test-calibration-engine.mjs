import assert from "node:assert/strict";
import { buildCalibrationSamplesFromLedger, evaluateCalibration } from "../lib/intelligence/calibration-engine.mjs";

const calibratedSamples = Array.from({ length: 40 }, (_, index) => {
  const confidence = index < 28 ? 0.7 : 0.3;
  const outcome = index < 28 ? (index % 10 < 7 ? 1 : 0) : (index % 10 < 3 ? 1 : 0);
  return { confidence, outcome };
});
const calibrated = evaluateCalibration(calibratedSamples, { minSamples: 30 });
assert.notEqual(calibrated.state, "INSUFFICIENT");
assert(calibrated.confidenceMultiplier <= 1);

const overconfident = evaluateCalibration(
  Array.from({ length: 40 }, (_, index) => ({ confidence: 0.9, outcome: index % 4 === 0 ? 1 : 0 })),
  { minSamples: 30 },
);
assert.equal(overconfident.state, "POOR");
assert(overconfident.optimismBias > 0.5);
assert(overconfident.confidenceMultiplier < 1);

const insufficient = evaluateCalibration([{ confidence: 0.8, outcome: 1 }], { minSamples: 30 });
assert.equal(insufficient.state, "INSUFFICIENT");
assert.equal(insufficient.confidenceMultiplier, 0.9);

const ledgerSamples = buildCalibrationSamplesFromLedger([
  { decision: "COMPRA", confidence: 80, checkpoints: { "7d": { returnPercent: 2.5 } } },
  { decision: "COMPRA", confidence: 60, checkpoints: { "7d": { returnPercent: -1.1 } } },
  { decision: "EVITA", confidence: 90, checkpoints: { "7d": { returnPercent: -5 } } },
]);
assert.deepEqual(ledgerSamples, [
  { confidence: 0.8, outcome: 1 },
  { confidence: 0.6, outcome: 0 },
]);

console.log("Fenice forecast calibration tests: PASS");
