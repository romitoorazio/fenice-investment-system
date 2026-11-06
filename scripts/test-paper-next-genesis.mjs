import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => JSON.parse(readFileSync("data/" + name, "utf8"));
const ledger = read("paper-next-forward-ledger.json");
const days = read("paper-next-forward-days.json");
const oldLedger = read("paper-v7-b2-forward-ledger.json");
const oldDays = read("paper-v7-b2-forward-days.json");
assert.equal(ledger.mode, "PAPER");
assert.equal(days.mode, "PAPER");
assert.equal(ledger.status, "DRAFT_NOT_APPROVED");
assert.equal(days.status, "DRAFT_NOT_APPROVED");
assert.equal(ledger.campaignId, days.campaignId);
assert.notEqual(ledger.campaignId, oldDays.campaignId);
assert.deepEqual(ledger.attempts, []);
assert.deepEqual(ledger.positions, {});
assert.equal(ledger.tip, "GENESIS");
assert.equal(ledger.cashEuro, ledger.virtualSeedEuro);
assert.deepEqual(days.days, []);
for (const item of [ledger, days]) {
  assert.equal(item.liveTradingAllowed, false);
  assert.equal(item.brokerConnectivityAllowed, false);
}
assert.equal(oldLedger.mode, "V7_PHASE_B_FORWARD_PAPER");
assert.equal(oldDays.mode, "V7_PHASE_B_FORWARD_DAYS");
console.log("PAPER-next independent DRAFT genesis: PASS (zero attempts, zero imported fills)");
