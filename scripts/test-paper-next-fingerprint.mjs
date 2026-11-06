import assert from "node:assert/strict";
import { computePaperNextFingerprint, PAPER_NEXT_CORE_FILES } from "./paper-next-fingerprint.mjs";

const fp = await computePaperNextFingerprint(".");
assert.equal(fp.complete, true, JSON.stringify(fp.missingFiles));
assert.match(fp.digest, /^[a-f0-9]{64}$/);
assert.equal(fp.domain, "FENICE_PAPER_NEXT_ISOLATED_CORE_V1");
assert.equal(new Set(fp.files).size, fp.files.length);
assert.deepEqual(fp.files, [...fp.files].sort());
assert(fp.files.includes("scripts/paper-next-activation-preflight.mjs"));
assert(fp.files.includes(".github/workflows/paper-next-activation-safety.yml"));
assert(fp.files.includes("scripts/test-paper-next-activation-preflight.mjs"));
assert.deepEqual(fp.files, [...PAPER_NEXT_CORE_FILES]);
for (const file of fp.files) {
  assert(!file.includes("v7-b2-forward-ledger"));
  assert(!file.includes("paper-v7-b2-approval"));
}
const second = await computePaperNextFingerprint(".");
assert.equal(second.digest, fp.digest, "deterministic fingerprint");
console.log("PAPER-next independent SHA256 fingerprint: PASS (" + fp.files.length + " core files)");
