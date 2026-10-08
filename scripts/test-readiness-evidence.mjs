import assert from "node:assert/strict";
import { buildInstitutionalEvidence } from "../lib/trading/readiness-evidence.ts";
import { evaluateExecutionReadiness } from "../lib/trading/execution-readiness.ts";
import { derivePaperRuntimeEvidence } from "../lib/ui/paper-runtime-evidence.ts";

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


const paperRuntime = derivePaperRuntimeEvidence({
  dailyEvidence: [
    {
      date: "2026-10-08",
      observedAt: "2026-10-08T17:04:27.344Z",
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      marketSession: {
        configured: true,
        evidence: {
          state: "OPEN",
          source: "Alpaca Paper Trading Clock",
          observedAt: "2026-10-08T17:04:26.734Z",
          authoritative: true,
        },
        decision: { allowed: true, state: "OPEN", reasons: [] },
      },
      marketFxEvidence: {
        readyNow: true,
        requiredForNonEuro: true,
        provider: "twelve-data",
        expectedProvider: "twelve-data",
        baseCurrency: "EUR",
        expectedBaseCurrency: "EUR",
        usdPair: "USD/EUR",
        usdRate: 0.8928,
        usdObservedAt: "2026-10-08T17:03:00.000Z",
        provenanceVerified: true,
        liveTradingAllowed: false,
        brokerConnectivityAllowed: false,
      },
      fillEvidenceProof: {
        complete: true,
        windows: [{
          marketFx: {
            ready: true,
            requiredForAdditionalFills: true,
            nonEuroFills: 1,
            matchedNonEuroFills: 1,
            proofs: [{ clientOrderId: "probe-usd-1", readyAtFill: true, matches: true }],
          },
        }],
      },
    },
    {
      date: "2026-10-09",
      observedAt: "2026-10-09T18:00:00.000Z",
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      marketSession: {
        configured: true,
        evidence: {
          state: "CLOSED",
          source: "Alpaca Paper Trading Clock",
          observedAt: "2026-10-09T18:00:00.000Z",
          authoritative: true,
        },
        decision: { allowed: false, state: "CLOSED", reasons: ["MARKET_CLOSED"] },
      },
    },
  ],
}, {
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
  positions: [
    { quantity: 1, averagePrice: 500, currency: "USD", fxToEuro: 0.8928 },
  ],
  executions: [
    {
      clientOrderId: "probe-usd-1",
      status: "PAPER_FILLED",
      currency: "USD",
      fxToEuro: 0.8928,
      fxProvider: "twelve-data",
      fxObservedAt: "2026-10-08T17:03:00.000Z",
      risk: { checks: [{ code: "valid-capital", passed: true, observed: 10000 }] },
    },
  ],
});
assert.equal(paperRuntime.marketSessionControlsVerified, true);
assert.equal(paperRuntime.marketSessionEvidenceDate, "2026-10-09");
assert.equal(paperRuntime.fxExposureVerified, true);
assert.equal(paperRuntime.fxEvidenceDate, "2026-10-08");
assert.equal(paperRuntime.certifiedForeignPaperFills, 1);
assert.equal(paperRuntime.foreignPaperFills, 1);
assert.equal(paperRuntime.fxTotalForeignExposurePercent, 4.464);

const persistedPaperRuntime = buildInstitutionalEvidence(intelligence, {
  marketSessionControlsVerified: paperRuntime.marketSessionControlsVerified,
  fxExposureVerified: paperRuntime.fxExposureVerified,
});
assert.equal(persistedPaperRuntime["market-session-controls"], "PASS");
assert.equal(persistedPaperRuntime["fx-exposure"], "PASS");

const unsafePaperRuntime = derivePaperRuntimeEvidence({
  dailyEvidence: [{
    date: "2026-10-08",
    liveTradingAllowed: true,
    brokerConnectivityAllowed: false,
    marketSession: {
      configured: true,
      evidence: { state: "OPEN", source: "clock", observedAt: "2026-10-08T17:00:00Z", authoritative: true },
      decision: { allowed: true },
    },
  }],
});
assert.equal(unsafePaperRuntime.marketSessionControlsVerified, false);
assert.equal(unsafePaperRuntime.fxExposureVerified, false);

console.log("Fenice readiness evidence fail-closed tests: PASS");
