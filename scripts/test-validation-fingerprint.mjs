import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  computePaperValidationFingerprint,
  validationFingerprintMatches,
} from "../lib/trading/validation-fingerprint.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "fenice-validation-fingerprint-"));
try {
  await mkdir(path.join(root, "lib", "trading"), { recursive: true });
  await writeFile(path.join(root, "lib", "trading", "a.ts"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, "lib", "trading", "b.ts"), "export const b = 2;\n", "utf8");
  const files = ["lib/trading/a.ts", "lib/trading/b.ts"];

  const first = await computePaperValidationFingerprint(root, files);
  const second = await computePaperValidationFingerprint(root, [...files].reverse());
  assert.equal(first.complete, true);
  assert.equal(validationFingerprintMatches(first, second), true, "file order must not change fingerprint");

  await writeFile(path.join(root, "lib", "trading", "b.ts"), "export const b = 3;\n", "utf8");
  const changed = await computePaperValidationFingerprint(root, files);
  assert.equal(validationFingerprintMatches(first, changed), false, "critical code change must change fingerprint");

  const missing = await computePaperValidationFingerprint(root, [...files, "lib/trading/missing.ts"]);
  assert.equal(missing.complete, false);
  assert.deepEqual(missing.missingFiles, ["lib/trading/missing.ts"]);
  assert.equal(validationFingerprintMatches(missing, missing), false, "incomplete fingerprints must never validate");

  await assert.rejects(
    computePaperValidationFingerprint(root, ["../escape.ts"]),
    /VALIDATION_FINGERPRINT_PATH_ESCAPE/,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Fenice validation fingerprint tests: PASS");
