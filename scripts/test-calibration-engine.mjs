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

const checkpoint = {measuredAt:"2026-11-09T18:00:00.000Z",priceObservedAt:"2026-11-09T08:00:00.000Z",
  priceEvidenceKind:"DAILY_SESSION_BUCKET_RESEARCH_ONLY",price:101,returnPercent:1};
const vintage = {decision:"COMPRA",createdAt:"2026-11-01T19:00:00.000Z",confidence:99,
  currency:"EUR",entryReferencePrice:100,checkpoints:{"7d":checkpoint},
  positiveReturnForecast:{kind:"POSITIVE_RETURN_PROBABILITY",horizon:"7d",modelVersion:"fixture",
    probability:0.6,generatedAt:"2026-11-01T18:00:00.000Z",provenanceVerified:true}};
const samples=records=>buildCalibrationSamplesFromLedger(records,{asOfMs:Date.parse(checkpoint.measuredAt)});
assert.deepEqual(samples([vintage]),[{confidence:0.6,outcome:1}]);
for(const change of [{positiveReturnForecast:null},{decision:"ATTENDI"},{historicalBackfill:true},
  {positiveReturnForecast:{...vintage.positiveReturnForecast,generatedAt:checkpoint.measuredAt}},
  {checkpoints:{"7d":{...checkpoint,priceObservedAt:vintage.createdAt}}},
  {checkpoints:{"7d":{...checkpoint,returnPercent:null}}}])assert.deepEqual(samples([{...vintage,...change}]),[]);
assert.deepEqual(buildCalibrationSamplesFromLedger([vintage],{asOfMs:Date.parse(vintage.createdAt)}),[]);
assert.equal(evaluateCalibration([{confidence:null,outcome:1},{confidence:0.5,outcome:null},
  {confidence:1.2,outcome:1},{confidence:0.7,outcome:0.5}]).sampleSize,0);
console.log("PASS calibration admits only explicit point-in-time forecast probabilities and matured finite outcomes");

// A plausible timestamp and price do not authenticate an inconsistent outcome.
for (const [price, returnPercent] of [[101,-1],[99,1],[101,20]]) {
  assert.deepEqual(samples([{...vintage,checkpoints:{"7d":{...checkpoint,price,returnPercent}}}]),[]);
}
// The writer independently rounds the stored price and percentage.
assert.deepEqual(samples([{...vintage,entryReferencePrice:3,checkpoints:{"7d":{...checkpoint,price:3.01,returnPercent:0.17}}}]),[{confidence:0.6,outcome:1}]);
console.log("PASS inconsistent outcome rejection with independent rounding tolerance");
