import assert from "node:assert/strict";
import { buildMultiBrokerReadiness } from "../lib/brokers/multi-broker-readiness.ts";
import { LIVE_TRADING_RELEASED } from "../lib/brokers/safety.ts";

const report = buildMultiBrokerReadiness();
assert.equal(report.version, 1);
assert.equal(report.purpose, "RESEARCH_ONLY");
assert.equal(report.liveTradingReleased, LIVE_TRADING_RELEASED);
assert.equal(report.liveTradingReleased, false);
assert.equal(report.verifiedBrokerConnections, 0);
assert.equal(report.accountTotalsAvailable, false);
assert.equal(report.crossBrokerDataSharingEnabled, false);
assert.equal(report.brokerOrderSubmissionEnabled, false);
assert.deepEqual(report.brokers.map((broker) => broker.id), ["directa", "etoro"]);
assert.equal(new Set(report.brokers.map((broker) => broker.id)).size, 2);

for (const broker of report.brokers) {
  assert.equal(broker.accountConnectionVerified, false);
  assert.equal(broker.accountDataAvailable, false);
  assert.equal(broker.orderSubmissionEnabled, false);
  assert.ok(broker.nextStep.length > 20);
}

const directa = report.brokers[0];
const etoro = report.brokers[1];
assert.equal(directa.mode, "LOCAL_READ_ONLY");
assert.equal(directa.readOnlyAdapterPrepared, true);
assert.equal(directa.status, "PREPARED_UNVERIFIED");
assert.equal(etoro.mode, "DEMO_READ_ONLY_PLANNED");
assert.equal(etoro.readOnlyAdapterPrepared, false);
assert.equal(etoro.status, "NOT_CONNECTED");

const serialized = JSON.stringify(report).toLowerCase();
for (const forbidden of ["x-user-key", "x-api-key", "private key", "secret key", "bearer "]) {
  assert.equal(serialized.includes(forbidden), false, `Public report must not expose ${forbidden}`);
}
console.log("Fenice multi-broker read-only readiness tests: PASS");
