import assert from "node:assert/strict";
import { buildInstitutionalEvidence } from "../lib/trading/readiness-evidence.ts";
import { evaluateExecutionReadiness } from "../lib/trading/execution-readiness.ts";

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

const now = Date.parse("2026-09-22T16:31:30Z");
const generatedAt = "2026-09-22T16:31:10Z";
const healthyEvidence = {
  version: 10,
  generatedAt,
  observations: [
    { sourceFamily: "twelve-data", eligibility: "PAPER", provenanceVerified: true },
    { sourceFamily: "alpaca", eligibility: "PAPER", provenanceVerified: true },
  ],
  capabilities: {
    twelveDataConfigured: true,
    alpacaConfigured: true,
    alphaVantageConfigured: true,
    directaLocalSnapshotDetected: false,
  },
  policy: {
    liveTradingAllowed: false,
    validationOnlySourcesNeverSatisfyPaperQuorum: true,
    untaggedLegacyEvidenceDefaultsToValidationOnly: true,
    paperEligibilityRequiresVerifiedProvenance: true,
  },
};
const healthyCoverage = {
  version: 6,
  generatedAt: "2026-09-22T16:31:11Z",
  evidenceGeneratedAt: generatedAt,
  requestedSymbols: 12,
  paperEligibleSymbols: 6,
  paperEligiblePercent: 50,
  policy: {
    requiredEligibility: "PAPER",
    minIndependentSourceFamilies: 2,
    preferredIndependentSourceFamilies: 3,
    directaPaidRealtimeRequired: false,
    directaEvidenceOptionalForPaperCertification: true,
    validationOnlyEvidenceCannotSatisfyPaperQuorum: true,
    paperEligibilityRequiresVerifiedProvenance: true,
    liveTradingAllowed: false,
    approvedIndependentPaperSourceFamilies: ["alpaca", "alpha-vantage", "twelve-data"],
    preferredZeroCostPaperSourceFamilies: ["alpaca", "twelve-data"],
  },
};

const executionPass = evaluateExecutionReadiness(healthyEvidence, healthyCoverage, now);
assert.equal(executionPass.verified, true, executionPass.reasons.join(" | "));
assert.equal(executionPass.state, "PASS");
assert.equal(executionPass.metrics.paperEligibleSourceFamilies, 2);
assert.equal(executionPass.metrics.configuredZeroCostSourceFamilies, 2);
assert.equal(executionPass.metrics.directaPaidRealtimeRequired, false);
assert.equal(executionPass.metrics.liveTradingAllowed, false);
assert.equal(executionPass.ownerActionRequired, false);

const staleExecution = evaluateExecutionReadiness(
  { ...healthyEvidence, generatedAt: "2026-09-22T14:00:00Z" },
  healthyCoverage,
  now,
);
assert.equal(staleExecution.verified, false);
assert.equal(staleExecution.state, "STALE");
assert.ok(staleExecution.reasons.some((reason) => reason.includes("older than 30 minutes")));

const unverifiedProvenance = evaluateExecutionReadiness({
  ...healthyEvidence,
  observations: [
    { sourceFamily: "twelve-data", eligibility: "PAPER", provenanceVerified: true },
    { sourceFamily: "alpaca", eligibility: "PAPER", provenanceVerified: false },
  ],
}, healthyCoverage, now);
assert.equal(unverifiedProvenance.verified, false);
assert.equal(unverifiedProvenance.state, "BLOCKED");
assert.equal(unverifiedProvenance.metrics.unverifiedPaperObservations, 1);

const missingFreeCredentials = evaluateExecutionReadiness({
  ...healthyEvidence,
  observations: [],
  capabilities: {
    twelveDataConfigured: false,
    alpacaConfigured: false,
    alphaVantageConfigured: true,
    directaLocalSnapshotDetected: false,
  },
}, {
  ...healthyCoverage,
  paperEligibleSymbols: 0,
  paperEligiblePercent: 0,
}, now);
assert.equal(missingFreeCredentials.verified, false);
assert.equal(missingFreeCredentials.state, "UNCONFIGURED");
assert.equal(missingFreeCredentials.ownerActionRequired, true);
assert.match(String(missingFreeCredentials.ownerAction), /Twelve Data Basic \+ Alpaca Basic\/IEX/);
assert.equal(missingFreeCredentials.metrics.directaPaidRealtimeRequired, false);

const legacyCoverage = evaluateExecutionReadiness(healthyEvidence, {
  ...healthyCoverage,
  version: 5,
  policy: {
    ...healthyCoverage.policy,
    paperEligibilityRequiresVerifiedProvenance: false,
  },
}, now);
assert.equal(legacyCoverage.verified, false);
assert.equal(legacyCoverage.state, "BLOCKED");
assert.ok(legacyCoverage.reasons.some((reason) => reason.includes("legacy or incomplete")));

console.log("Fenice readiness evidence fail-closed tests: PASS");
