import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluatePaperBaselineEligibility } from "../lib/trading/paper-baseline.mjs";
import { computePaperValidationFingerprint } from "../lib/trading/validation-fingerprint.mjs";

const requireEligible = process.argv.includes("--require-eligible");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const [sources, intelligence, executionMarket, executionCoverage, governance, fingerprint] = await Promise.all([
  readJson("data/global-source-health.json"),
  readJson("data/intelligence-quality.json"),
  readJson("data/execution-market-evidence.json"),
  readJson("data/execution-market-coverage.json"),
  readJson("data/decision-governance.json"),
  computePaperValidationFingerprint(root),
]);

const status = evaluatePaperBaselineEligibility({
  sources,
  intelligence,
  executionMarket,
  executionCoverage,
  governance,
  fingerprint,
});

console.log(`Fenice paper baseline: ${status.eligible ? "ELIGIBLE" : "NOT_ELIGIBLE"}`);
console.log(JSON.stringify(status, null, 2));

if (requireEligible && !status.eligible) {
  console.error("Paper baseline gate failed: do not start the 30-day campaign yet.");
  process.exitCode = 2;
}
