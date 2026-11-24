import {buildCalibrationSamplesFromLedger} from "./calibration-engine.mjs";
import {verifiedReturnForecast} from "./shadow-calibration.mjs";

// Diagnostic only: a mutually exclusive first-blocker count, not a new
// eligibility policy. The existing evaluator remains the source of truth.
export function calibrationSampleDiagnostics(records, {checkpoint, decision = "COMPRA", asOfMs} = {}) {
  const source = Array.isArray(records) ? records : [];
  const counts = {
    invalidAsOf: 0,
    otherDecision: 0,
    historicalBackfill: 0,
    missingForecast: 0,
    invalidForecast: 0,
    forecastHorizonMismatch: 0,
    missingCheckpoint: 0,
    rejectedOutcomeEvidence: 0,
    admitted: 0,
  };
  for (const record of source) {
    if (!Number.isSafeInteger(asOfMs)) counts.invalidAsOf++;
    else if (decision && String(record?.decision ?? "").toUpperCase() !== decision.toUpperCase()) counts.otherDecision++;
    else if (record?.historicalBackfill === true) counts.historicalBackfill++;
    else if (record?.positiveReturnForecast == null) counts.missingForecast++;
    else {
      const forecast = verifiedReturnForecast(record.positiveReturnForecast, record.createdAt);
      if (!forecast) counts.invalidForecast++;
      else if (forecast.horizon !== checkpoint) counts.forecastHorizonMismatch++;
      else if (!record.checkpoints?.[checkpoint]) counts.missingCheckpoint++;
      else if (buildCalibrationSamplesFromLedger([record], {checkpoint, decision, asOfMs}).length === 1) counts.admitted++;
      else counts.rejectedOutcomeEvidence++;
    }
  }
  return {totalRecords: source.length, counts, classification: "FIRST_BLOCKER_ONLY",
    researchOnly: true, changesEligibility: false, liveTradingAllowed: false};
}
