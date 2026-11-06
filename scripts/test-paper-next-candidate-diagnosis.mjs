import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const output = JSON.parse(execFileSync(process.execPath,
  ["scripts/diagnose-paper-next-candidates.mjs"], {encoding:"utf8"}));
assert.equal(output.mode, "PAPER_GLOBAL_READ_ONLY");
assert.equal(output.actionableNow, false);
assert.equal(output.liveTradingAllowed, false);
assert.equal(output.brokerConnectivityAllowed, false);
assert.equal(output.approvalGranted, false);
assert.ok(Array.isArray(output.decisions));
assert.ok(output.decisions.every(row => Array.isArray(row.reasons)));
assert.ok(output.decisions.every(row =>
  row.reasons.length > 0 || output.candidatesPassingStaticGates.includes(row.symbol)));
assert.ok(Object.hasOwn(output.evidenceAge, "sessionMinutes"));
assert.ok(Object.hasOwn(output, "sessionVenue"));
console.log("PAPER-next global candidate diagnosis: PASS (read-only, non-actionable)");
