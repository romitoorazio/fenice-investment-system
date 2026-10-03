import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectMarketDataValidationLab } from "../lib/intelligence/market-data-validation-lab.mjs";
import { computePaperValidationFingerprint, validationFingerprintMatches } from "../lib/trading/validation-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.slice(2).some((arg) => arg !== "--audit-only")) throw new Error("LAB_UNSUPPORTED_ARGUMENT");
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const protectedData = [
  "data/latest-snapshot.json", "data/intelligence-quality.json", "data/global-source-health.json",
  "data/execution-market-evidence.json", "data/execution-market-coverage.json",
  "data/paper-validation-campaign.json", "data/paper-oms-state.json", "data/paper-order-queue.json",
  "data/paper-conditional-state.json", "data/paper-conditional-queue.json",
];
const hashData = async () => {
  const hash = createHash("sha256");
  for (const file of protectedData) hash.update(file).update(await readFile(path.join(root, file))).update("\n");
  return hash.digest("hex");
};
const campaign = await readJson("data/paper-validation-campaign.json");
const before = await computePaperValidationFingerprint(root);
if (!validationFingerprintMatches(campaign.baselineFingerprint, before)) throw new Error("LAB_REQUIRES_UNCHANGED_ACTIVE_PAPER_BASELINE");
const dataBefore = await hashData();
const report = await collectMarketDataValidationLab({
  snapshot: await readJson("data/latest-snapshot.json"), quality: await readJson("data/intelligence-quality.json"),
  auditOnly: process.argv.includes("--audit-only"),
});
const after = await computePaperValidationFingerprint(root);
if (!validationFingerprintMatches(before, after) || dataBefore !== await hashData()) throw new Error("LAB_PAPER_ISOLATION_FAILURE");
report.isolation = { coreFingerprintUnchanged: true, protectedDataUnchanged: true,
  fingerprintedFiles: before.files.length, preservedEvidenceDays: campaign.dailyEvidence.length };
const outputDir = path.join(root, "artifacts");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "market-data-validation-lab.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ generatedAt: report.generatedAt, productionQuality: report.productionQuality,
  primarySnapshotAudit: report.primarySnapshotAudit, collection: report.collection,
  results: report.attempts.map((row) => ({ symbol: row.symbol, state: row.state,
    reason: row.reason, comparison: row.comparison })), isolation: report.isolation, safety: report.safety }, null, 2));
