import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

// New campaign fingerprint; never reads or mutates V6/V7/V8 approvals or ledgers.
export const PAPER_NEXT_CORE_FILES = Object.freeze([
  ".github/workflows/paper-next-activation-safety.yml",
  "scripts/paper-next-activation-preflight.mjs",
  "scripts/test-paper-next-activation-preflight.mjs",
  "scripts/paper-next-fingerprint.mjs",
  "scripts/test-paper-next-fingerprint.mjs",
].sort());

export async function computePaperNextFingerprint(root) {
  const folder = resolve(root);
  const hash = createHash("sha256");
  hash.update("FENICE_PAPER_NEXT_ISOLATED_CORE_V1\n");
  const missingFiles = [];
  for (const relative of PAPER_NEXT_CORE_FILES) {
    const absolute = resolve(folder, relative);
    if (!absolute.startsWith(folder + sep)) throw Error("PAPER_NEXT_PATH_ESCAPE");
    hash.update("FILE:" + relative + "\n");
    try {
      hash.update((await readFile(absolute, "utf8")).replace(/\r\n/g, "\n"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missingFiles.push(relative);
      hash.update("<MISSING>");
    }
    hash.update("\nEND_FILE\n");
  }
  return {
    algorithm: "sha256", domain: "FENICE_PAPER_NEXT_ISOLATED_CORE_V1",
    digest: hash.digest("hex"), complete: missingFiles.length === 0,
    missingFiles, files: [...PAPER_NEXT_CORE_FILES],
  };
}
