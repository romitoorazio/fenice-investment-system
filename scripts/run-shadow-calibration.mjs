import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectShadowCalibrationCandidates } from "../lib/intelligence/shadow-calibration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const committee = JSON.parse(await readFile(path.join(dataDir, "investment-committee.json"), "utf8"));
const now = new Date();
const candidates = selectShadowCalibrationCandidates(committee.allDecisions || []);
const output = {
  version: 1,
  generatedAt: now.toISOString(),
  purpose: "V7 research-only shadow predictions for future calibration evidence.",
  isolation: {
    modifiesV6DecisionLedger: false,
    executionEligible: false,
    paperCertificationEligible: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
  },
  candidateCount: candidates.length,
  candidates,
};
await writeFile(path.join(dataDir, "shadow-calibration.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Fenice V7 shadow calibration: ${candidates.length} research-only candidates.`);
