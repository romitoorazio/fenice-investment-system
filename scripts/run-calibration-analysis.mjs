import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCalibrationSamplesFromLedger, evaluateCalibration } from "../lib/intelligence/calibration-engine.mjs";
import { calibrationSampleDiagnostics } from "../lib/intelligence/calibration-sample-diagnostics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const ledger = JSON.parse(await readFile(path.join(dataDir, "decision-ledger.json"), "utf8"));
const records = Array.isArray(ledger?.records) ? ledger.records : [];

function analyse(checkpoint) {
  const samples = buildCalibrationSamplesFromLedger(records, { checkpoint, decision: "COMPRA", asOfMs:Date.parse(ledger.generatedAt) });
  const diagnostics = calibrationSampleDiagnostics(records, { checkpoint, decision: "COMPRA", asOfMs: Date.parse(ledger.generatedAt) });
  const evaluation = evaluateCalibration(samples, { bins: 10, minSamples: 30 });
  return { ...evaluation, sampleDiagnostics: { ...diagnostics, matchesEvaluator: diagnostics.counts.admitted === evaluation.sampleSize } };
}

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  purpose: "Measure explicit point-in-time BUY probability forecasts against matured research outcomes. Diagnostic only; never increases execution permission.",
  policy: {
    decisionClass: "COMPRA",
    positiveOutcomeDefinition: "checkpoint returnPercent > 0",
    minimumSamples: 30,
    confidenceCanOnlyBeReducedByCalibration: true,
    liveTradingAllowed: false,
  },
  horizons: {
    "7d": analyse("7d"),
    "30d": analyse("30d"),
    "90d": analyse("90d"),
  },
};

await writeFile(path.join(dataDir, "calibration-analysis.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Fenice calibration: 7d=${report.horizons["7d"].state}/${report.horizons["7d"].sampleSize}, 30d=${report.horizons["30d"].state}/${report.horizons["30d"].sampleSize}.`);
