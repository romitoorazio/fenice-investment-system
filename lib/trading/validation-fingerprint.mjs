import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Any change to these files after a paper campaign starts invalidates further
// evidence recording until a new baseline is explicitly selected. The list is
// intentionally broader than the OMS alone: persistence, audit, risk, market
// data, baseline eligibility, certification and the workflow that records the
// evidence are all part of the claim being validated.
export const PAPER_VALIDATION_CORE_FILES = [
  ".github/workflows/paper-validation.yml",
  "lib/brokers/safety.ts",
  "lib/trading/atomic-state-store.ts",
  "lib/trading/audit-chain.ts",
  "lib/trading/broker-reconciliation.ts",
  "lib/trading/conditional-orders.ts",
  "lib/trading/drawdown-engine.ts",
  "lib/trading/durable-journal.ts",
  "lib/trading/event-risk-gate.ts",
  "lib/trading/execution-market-data.ts",
  "lib/trading/execution-quality.ts",
  "lib/trading/execution-safety.ts",
  "lib/trading/factor-exposure.ts",
  "lib/trading/fx-exposure.ts",
  "lib/trading/institutional-readiness.ts",
  "lib/trading/kill-switch.ts",
  "lib/trading/market-data-quorum.ts",
  "lib/trading/market-session.ts",
  "lib/trading/operational-gates.ts",
  "lib/trading/order-lifecycle.ts",
  "lib/trading/paper-baseline.mjs",
  "lib/trading/paper-conditional-book.ts",
  "lib/trading/paper-oms.ts",
  "lib/trading/paper-validation.mjs",
  "lib/trading/portfolio-risk.ts",
  "lib/trading/portfolio-stress.ts",
  "lib/trading/position-sizing.ts",
  "lib/trading/readiness-evidence.ts",
  "lib/trading/reconciliation.ts",
  "lib/trading/recovery.ts",
  "lib/trading/risk-engine.ts",
  "lib/trading/risk-of-ruin.ts",
  "lib/trading/shadow-execution.ts",
  "lib/trading/tca.ts",
  "lib/trading/types.ts",
  "lib/trading/validation-fingerprint.mjs",
  "lib/trading/watchdog.ts",
  "package.json",
  "scripts/check-certification-readiness.mjs",
  "scripts/check-execution-market-coverage.mjs",
  "scripts/check-paper-baseline-eligibility.mjs",
  "scripts/check-paper-validation-campaign.mjs",
  "scripts/record-paper-validation-evidence.mjs",
  "scripts/run-execution-market-data.mjs",
  "scripts/run-paper-conditional-oms.mjs",
  "scripts/run-paper-oms.mjs",
  "scripts/start-paper-validation-campaign.mjs",
].sort();

function normalizeForHash(content) {
  return String(content).replace(/\r\n/g, "\n");
}

export async function computePaperValidationFingerprint(root, files = PAPER_VALIDATION_CORE_FILES) {
  const normalizedFiles = [...new Set((Array.isArray(files) ? files : [])
    .map((value) => String(value || "").replaceAll("\\", "/").replace(/^\.\//, ""))
    .filter(Boolean))].sort();
  const hash = createHash("sha256");
  const missingFiles = [];

  hash.update("FENICE_PAPER_VALIDATION_CORE_V1\n");
  for (const relativePath of normalizedFiles) {
    const absolutePath = path.resolve(root, relativePath);
    const expectedRoot = `${path.resolve(root)}${path.sep}`;
    if (absolutePath !== path.resolve(root) && !absolutePath.startsWith(expectedRoot)) {
      throw new Error(`VALIDATION_FINGERPRINT_PATH_ESCAPE: ${relativePath}`);
    }
    hash.update(`FILE:${relativePath}\n`);
    try {
      const content = await readFile(absolutePath, "utf8");
      hash.update(normalizeForHash(content));
      hash.update("\nEND_FILE\n");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      missingFiles.push(relativePath);
      hash.update("<MISSING>\nEND_FILE\n");
    }
  }

  return {
    version: 1,
    algorithm: "sha256",
    digest: hash.digest("hex"),
    files: normalizedFiles,
    missingFiles,
    complete: missingFiles.length === 0,
  };
}

export function validationFingerprintMatches(expected, observed) {
  if (!expected || !observed) return false;
  if (expected.algorithm !== "sha256" || observed.algorithm !== "sha256") return false;
  if (expected.version !== 1 || observed.version !== 1) return false;
  if (expected.complete !== true || observed.complete !== true) return false;
  const expectedDigest = String(expected.digest || "").toLowerCase();
  const observedDigest = String(observed.digest || "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(expectedDigest)
    && expectedDigest === observedDigest;
}
