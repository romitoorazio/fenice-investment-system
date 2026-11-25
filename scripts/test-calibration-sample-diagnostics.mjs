import assert from "node:assert/strict";
import {calibrationSampleDiagnostics} from "../lib/intelligence/calibration-sample-diagnostics.mjs";
import {buildCalibrationSamplesFromLedger} from "../lib/intelligence/calibration-engine.mjs";

const mark={measuredAt:"2026-11-09T18:00:00.000Z",priceObservedAt:"2026-11-09T08:00:00.000Z",
  priceEvidenceKind:"DAILY_SESSION_BUCKET_RESEARCH_ONLY",price:101,returnPercent:1};
const record={decision:"COMPRA",createdAt:"2026-11-01T19:00:00.000Z",currency:"EUR",
  entryReferencePrice:100,checkpoints:{"7d":mark},positiveReturnForecast:{
    kind:"POSITIVE_RETURN_PROBABILITY",horizon:"7d",modelVersion:"fixture",probability:0.6,
    generatedAt:"2026-11-01T18:00:00.000Z",provenanceVerified:true}};
const opts={checkpoint:"7d",decision:"COMPRA",asOfMs:Date.parse(mark.measuredAt)};
const rows=[record,{...record,decision:"ATTENDI"},{...record,historicalBackfill:true},
  {...record,positiveReturnForecast:null},
  {...record,positiveReturnForecast:{...record.positiveReturnForecast,generatedAt:mark.measuredAt}},
  {...record,positiveReturnForecast:{...record.positiveReturnForecast,horizon:"30d"}},
  {...record,checkpoints:{}},
  {...record,checkpoints:{"7d":{...mark,priceObservedAt:record.createdAt}}}];
const result=calibrationSampleDiagnostics(rows,opts);
assert.equal(result.totalRecords,8);
assert.deepEqual(result.counts,{invalidAsOf:0,otherDecision:1,historicalBackfill:1,missingForecast:1,
  invalidForecast:1,forecastHorizonMismatch:1,missingCheckpoint:1,rejectedOutcomeEvidence:1,admitted:1});
assert.equal(result.counts.admitted,buildCalibrationSamplesFromLedger(rows,opts).length);
assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),rows.length);
assert.equal(calibrationSampleDiagnostics(rows,{...opts,asOfMs:NaN}).counts.invalidAsOf,8);
assert.equal(calibrationSampleDiagnostics([],opts).totalRecords,0);
assert.equal(result.changesEligibility,false);
assert.equal(result.liveTradingAllowed,false);
assert.equal(calibrationSampleDiagnostics([null],opts).counts.otherDecision,1);
assert.equal(calibrationSampleDiagnostics([record],{...opts,asOfMs:Date.parse(record.createdAt)}).counts.rejectedOutcomeEvidence,1);
console.log("PASS calibration sample diagnostics: mutually exclusive blockers, point-in-time, evaluator parity and fail-closed flags");

assert.deepEqual(result.inventory,{matchingDecisionRecords:7,recordsWithForecastField:7,
  recordsWithoutForecastField:1,verifiedForecastAtRecordTime:6,verifiedForecastForHorizon:5});
const noBuys=calibrationSampleDiagnostics([{decision:"ATTENDI"},{decision:"EVITA"},{decision:"OSSERVA"}],opts);
assert.equal(noBuys.counts.otherDecision,3);
assert.equal(noBuys.counts.missingForecast,0);
assert.deepEqual(noBuys.inventory,{matchingDecisionRecords:0,recordsWithForecastField:0,
  recordsWithoutForecastField:3,verifiedForecastAtRecordTime:0,verifiedForecastForHorizon:0});
const beforeRecord=calibrationSampleDiagnostics([record],{...opts,asOfMs:Date.parse(record.createdAt)-1});
assert.equal(beforeRecord.inventory.verifiedForecastAtRecordTime,0);
assert.equal(beforeRecord.inventory.recordsWithForecastField,1);
assert.equal(calibrationSampleDiagnostics(rows,{...opts,asOfMs:NaN}).inventory.verifiedForecastForHorizon,0);
console.log("PASS independent forecast inventory exposes missing producer even when all decisions are excluded");
