import assert from "node:assert/strict";
import { buildInstitutionalEvidence } from "../lib/trading/readiness-evidence.ts";

const intelligence = {
  intelligenceConfidence: 96,
  coverage: { sourceConcentrationPercent: 40 },
  crossSourceValidation: { checked: 20, divergent: 0 },
};

const cloudOnly = buildInstitutionalEvidence(intelligence, {});
assert.equal(cloudOnly["data-quality"], "PASS");
assert.equal(cloudOnly["cross-source-validation"], "PASS");
assert.equal(cloudOnly["execution-market-quorum"], "TESTING");
assert.equal(cloudOnly["broker-readonly"], "TESTING");
assert.equal(cloudOnly["execution-reconciliation"], "TESTING");
assert.equal(cloudOnly["paper-30d"], "MISSING");

const runtimeVerified = buildInstitutionalEvidence(intelligence, {
  executionMarketQuorumVerified: true,
  brokerReadOnlyVerified: true,
  brokerReconciliationVerified: true,
  paper30dVerified: true,
});
assert.equal(runtimeVerified["execution-market-quorum"], "PASS");
assert.equal(runtimeVerified["broker-readonly"], "PASS");
assert.equal(runtimeVerified["execution-reconciliation"], "PASS");
assert.equal(runtimeVerified["paper-30d"], "PASS");

const weakData = buildInstitutionalEvidence({
  intelligenceConfidence: 89,
  coverage: { sourceConcentrationPercent: 40 },
  crossSourceValidation: { checked: 20, divergent: 0 },
}, { executionMarketQuorumVerified: true });
assert.equal(weakData["data-quality"], "BLOCKED");

console.log("Fenice readiness evidence fail-closed tests: PASS");
