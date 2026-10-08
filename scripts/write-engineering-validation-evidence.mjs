import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  buildEngineeringValidationRecord,
  validateEngineeringCiContract,
} from "../lib/ui/engineering-validation-evidence.ts";

const requiredFiles = [
  ".github/workflows/ci.yml",
  "scripts/test-chaos-resilience.mjs",
  "scripts/test-state-persistence.mjs",
  "scripts/test-trading-ops.mjs",
  "scripts/test-institutional-controls.mjs",
  "lib/trading/recovery.ts",
  "lib/trading/audit-chain.ts",
  "lib/trading/reconciliation.ts",
];

const contents = new Map();
for (const path of requiredFiles) contents.set(path, await readFile(path, "utf8"));

const ciText = contents.get(".github/workflows/ci.yml") || "";
const contract = validateEngineeringCiContract(ciText);
if (!contract.valid) {
  throw new Error(`ENGINEERING_CI_CONTRACT_MISSING: ${contract.missing.join(" | ")}`);
}

const digest = createHash("sha256");
for (const path of [...requiredFiles].sort()) {
  digest.update(path);
  digest.update("\0");
  digest.update(contents.get(path) || "");
  digest.update("\0");
}
const contractDigest = digest.digest("hex");

const record = buildEngineeringValidationRecord({
  generatedAt: process.env.CI_VALIDATED_AT || "",
  workflowRunId: Number(process.env.CI_WORKFLOW_RUN_ID),
  workflowUrl: process.env.CI_WORKFLOW_URL || "",
  validatedCommit: process.env.CI_TESTED_SHA || "",
  branch: process.env.CI_HEAD_BRANCH || "",
  event: process.env.CI_WORKFLOW_EVENT || "",
  conclusion: process.env.CI_WORKFLOW_CONCLUSION || "",
  contractDigest,
});

await writeFile(
  "data/engineering-validation-evidence.json",
  `${JSON.stringify(record, null, 2)}\n`,
  "utf8",
);
console.log(`Fenice engineering validation evidence: VERIFIED run ${record.source.workflowRunId} @ ${record.source.validatedCommit.slice(0, 12)}`);
