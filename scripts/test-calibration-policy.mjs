import assert from "node:assert/strict";
import { applyCalibrationToConfidence, selectCalibrationPolicy } from "../lib/intelligence/calibration-policy.mjs";

const poor30d = selectCalibrationPolicy({
  horizons: {
    "30d": { state: "POOR", sampleSize: 60, confidenceMultiplier: 0.8, reasons: ["optimism bias"] },
    "7d": { state: "CALIBRATED", sampleSize: 120, confidenceMultiplier: 1 },
  },
});
assert.equal(poor30d.horizon, "30d");
assert.equal(poor30d.multiplier, 0.8);
assert.equal(poor30d.evidenceMature, true);
assert.equal(applyCalibrationToConfidence(80, poor30d), 64);

const fallbackTo7d = selectCalibrationPolicy({
  horizons: {
    "30d": { state: "INSUFFICIENT", sampleSize: 12, confidenceMultiplier: 0.9 },
    "7d": { state: "WATCH", sampleSize: 80, confidenceMultiplier: 0.9 },
  },
});
assert.equal(fallbackTo7d.horizon, "7d");
assert.equal(fallbackTo7d.evidenceMature, true);
assert.equal(applyCalibrationToConfidence(90, fallbackTo7d), 81);

const insufficient = selectCalibrationPolicy({ horizons: {} });
assert.equal(insufficient.state, "INSUFFICIENT");
assert.equal(insufficient.multiplier, 0.9);
assert.equal(insufficient.evidenceMature, false);
assert.equal(applyCalibrationToConfidence(100, insufficient), 90);

const invalidBoost = selectCalibrationPolicy({
  horizons: { "30d": { state: "CALIBRATED", sampleSize: 100, confidenceMultiplier: 1.25 } },
});
assert.equal(invalidBoost.multiplier, 1);
assert.equal(applyCalibrationToConfidence(73, invalidBoost), 73);

assert.equal(applyCalibrationToConfidence(Number.NaN, invalidBoost), 0);
console.log("Fenice calibration policy tests: PASS");
