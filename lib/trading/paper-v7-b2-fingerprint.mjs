import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

// Independent prospective B2 campaign. All previous V6 and V7 Phase B
// fingerprinted files and ledgers remain untouched.
export const V7_B2_CORE_FILES = [
  ".github/workflows/v7-b2-forward-paper.yml",
  "lib/trading/decision-data-gate.mjs",
  "lib/trading/paper-fx-evidence.mjs",
  "lib/trading/paper-v7-phase-b-v6-parity.mjs",
  "lib/trading/paper-v7-b2-fingerprint.mjs",
  "scripts/paper-validation-stager.mjs",
  "scripts/check-v7-b2-preflight.mjs",
  "scripts/run-execution-market-data.mjs",
  "scripts/refresh-twelve-data-batch-evidence.mjs",
  "scripts/refresh-paper-fx-evidence.mjs",
  "scripts/check-execution-market-coverage.mjs",
  "scripts/check-paper-market-session.mjs",
  "scripts/run-v7-b2-forward-cycle.mjs",
  "scripts/test-v7-b2-baseline.mjs",
].sort();

export async function computeV7B2Fingerprint(root) {
  const folder = resolve(root);
  const hash = createHash("sha256");
  hash.update("FENICE_V7_B2_FORWARD_CORE_V1\n");
  const missingFiles = [];
  for (const relative of V7_B2_CORE_FILES) {
    const absolute = resolve(folder, relative);
    if (!absolute.startsWith(folder + sep)) throw Error("V7_B2_FINGERPRINT_PATH_ESCAPE");
    hash.update("FILE:" + relative + "\n");
    try { hash.update((await readFile(absolute, "utf8")).replace(/\r\n/g, "\n")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      missingFiles.push(relative);
      hash.update("<MISSING>");
    }
    hash.update("\nEND_FILE\n");
  }
  return {
    algorithm: "sha256", domain: "FENICE_V7_B2_FORWARD_CORE_V1",
    digest: hash.digest("hex"), complete: missingFiles.length === 0,
    missingFiles, files: V7_B2_CORE_FILES,
  };
}
