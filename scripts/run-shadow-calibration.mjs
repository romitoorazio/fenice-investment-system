import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCalibration } from "../lib/intelligence/calibration-engine.mjs";
import {
  buildShadowOutcomeSamples,
  selectShadowCalibrationCandidates,
  updateShadowCalibrationLedger,
} from "../lib/intelligence/shadow-calibration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
  } catch {
    return fallback;
  }
}

const committee = await readJson("investment-committee.json", { allDecisions: [], generatedAt: null });
const previousLedger = await readJson("shadow-calibration-ledger.json", { version: 1, records: [] });
const now = new Date();
const candidates = selectShadowCalibrationCandidates(committee.allDecisions || []);
const priceBySymbol = new Map(
  (committee.allDecisions || [])
    .filter((item) => Number.isFinite(Number(item.currentPrice)))
    .map((item) => [String(item.symbol || "").toUpperCase(), Number(item.currentPrice)]),
);

const ledger = updateShadowCalibrationLedger(previousLedger, candidates, priceBySymbol, {
  cycleId: committee.generatedAt || now.toISOString(),
  now,
});

const horizons = {};
for (const checkpoint of ["1d", "7d", "30d", "90d"]) {
  horizons[checkpoint] = evaluateCalibration(
    buildShadowOutcomeSamples(ledger.records, checkpoint),
    { bins: 10, minSamples: 30 },
  );
}

const output = {
  version: 2,
  generatedAt: now.toISOString(),
  purpose: "V7 research-only shadow predictions and directional outcome calibration. Never grants execution permission.",
  methodology: {
    signal: "terminal ACCUMULA observed as committee OSSERVA/ATTENDI with strong raw data confidence",
    positiveOutcomeDefinition: "checkpoint returnPercent > 0",
    deDuplication: "maximum one observation per symbol per UTC day",
    minimumCalibrationSamples: 30,
    feedsV6CalibrationPolicy: false,
  },
  isolation: {
    modifiesV6DecisionLedger: false,
    executionEligible: false,
    paperCertificationEligible: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
  },
  candidateCount: candidates.length,
  candidates,
  ledgerRecordCount: ledger.recordCount,
  researchCalibration: horizons,
};

await writeFile(path.join(dataDir, "shadow-calibration-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, "shadow-calibration.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `Fenice V7 shadow calibration: candidates=${candidates.length}; ledger=${ledger.recordCount}; 7d=${horizons["7d"].state}/${horizons["7d"].sampleSize}; 30d=${horizons["30d"].state}/${horizons["30d"].sampleSize}; researchOnly=true; liveTradingAllowed=false.`,
);
