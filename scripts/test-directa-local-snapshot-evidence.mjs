import assert from "node:assert/strict";
import { assessDirectaLocalSnapshotEvidence as assess } from "../lib/ui/directa-local-snapshot-evidence.mjs";

const now = Date.parse("2026-10-17T17:00:08.000Z");
const base = {
  generatedAt: "2026-10-17T17:00:07.000Z",
  source: "directa-dapi-local", mode: "read-only", host: "loopback",
  liveTradingAllowed: false, writeCommandsBlocked: true,
  connection: { state: "CONN_OK", healthy: true },
  account: { identifierPersisted: false, identifierPresent: true, liquidity: 987654.23, equity: 123456.78 },
  availability: { totalLiquidity: 987654.23 },
  positions: [], orders: [], errors: [],
  diagnostics: { stockListComplete: true, orderListComplete: true, receivedMessages: 8 },
};
const ok = assess(base, now);
assert.equal(ok.state, "CURRENT_COMPLETE");
assert.equal(ok.complete, true);
assert.equal(ok.positionsObserved, 0, "Zero positions is valid only after a complete snapshot");
assert.equal(ok.ordersObserved, 0);
assert.equal(ok.brokerReconciliationVerified, false);
assert.equal(ok.brokerWritesAuthorized, false);
assert.equal(ok.liveTradingAllowed, false);

function blocked(input, reason, time = now) {
  const result = assess(input, time);
  assert.equal(result.complete, false, reason);
  assert.ok(result.failures.includes(reason), reason);
  assert.equal(result.brokerWritesAuthorized, false);
  assert.equal(result.liveTradingAllowed, false);
}
blocked(null, "LOCAL_SNAPSHOT_MISSING");
blocked({ ...base, generatedAt: "2026-10-17T16:59:30.000Z" }, "LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK");
blocked({ ...base, generatedAt: "2026-10-17T17:00:09.000Z" }, "LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK");
blocked({ ...base, generatedAt: "2026-02-30T17:00:07.000Z" }, "LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK");
blocked({ ...base, generatedAt: "2026-10-17T17:00:07" }, "LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK");
blocked(base, "LOCAL_SNAPSHOT_STALE_OR_INVALID_CLOCK", Number.NaN);
blocked({ ...base, connection: { state: "CONN_LOST", healthy: true } }, "BROKER_CONNECTION_UNHEALTHY");
blocked({ ...base, mode: "live" }, "READ_ONLY_BOUNDARY_UNVERIFIED");
blocked({ ...base, writeCommandsBlocked: false }, "READ_ONLY_BOUNDARY_UNVERIFIED");
blocked({ ...base, diagnostics: { ...base.diagnostics, stockListComplete: false } }, "BROKER_LISTS_INCOMPLETE");
blocked({ ...base, account: null }, "BROKER_ACCOUNT_FIELDS_INCOMPLETE");
blocked({ ...base, account: { ...base.account, liquidity: null } }, "BROKER_ACCOUNT_FIELDS_INCOMPLETE");
blocked({ ...base, availability: null }, "BROKER_ACCOUNT_FIELDS_INCOMPLETE");
blocked({ ...base, positions: null }, "BROKER_COLLECTIONS_MISSING");
blocked({ ...base, orders: [{ state: "UNKNOWN", clientOrderId: "TOPSECRET" }] }, "BROKER_ORDER_STATE_AMBIGUOUS");
blocked({ ...base, errors: [{ ticker: "SECRET_TICKER", code: 1024 }] }, "BROKER_PROTOCOL_ERRORS");
const privacy = JSON.stringify(assess({ ...base,
  positions: [{ ticker: "SECRET_TICKER", portfolioQuantity: 123 }],
  orders: [{ state: "FILLED", clientOrderId: "TOPSECRET" }],
}, now));
for (const secret of ["SECRET_TICKER", "TOPSECRET", "987654", "123456"]) {
  assert.equal(privacy.includes(secret), false, "Sensitive account details must not be reported");
}
console.log("Directa local snapshot completeness/redaction tests: PASS");
