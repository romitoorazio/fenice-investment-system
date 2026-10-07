import { readFile, writeFile } from "node:fs/promises";
import { buildV7HorizonSplit } from "../lib/intelligence/horizon-split.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const committeePath = String(process.env.FENICE_V7_COMMITTEE_PATH || "data/investment-committee.json").trim();
const outcomesPath = String(process.env.FENICE_V7_OUTCOMES_PATH || "data/v7-decision-outcomes.json").trim();
const regimePath = String(process.env.FENICE_V7_REGIME_PATH || "data/v7-regime-accuracy.json").trim();
const outputPath = String(process.env.FENICE_V7_HORIZON_SPLIT_PATH || "data/v7-horizon-split.json").trim();

const [committee, decisionOutcomes, regimeAccuracy] = await Promise.all([
  readJson(committeePath),
  readJson(outcomesPath),
  readJson(regimePath),
]);

const report = buildV7HorizonSplit({ committee, decisionOutcomes, regimeAccuracy });
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(
  "Fenice V7 horizon split:",
  "candidates=", report.candidateCount,
  "shadow=", report.strategicShadowCount,
  "symbols=", report.strategicShadowSymbols.join(",") || "none",
  "regime=", report.evidence.marketRegime,
  "7dBias=", report.evidence.bias.sevenDay.biasState,
  "30dBias=", report.evidence.bias.thirtyDay.biasState,
  "diagnosticOnly=true; liveTradingAllowed=false.",
);
