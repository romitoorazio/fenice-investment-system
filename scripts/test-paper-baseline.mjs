import assert from "node:assert/strict";
import { evaluatePaperBaselineEligibility } from "../lib/trading/paper-baseline.mjs";

const now = Date.parse("2026-09-21T20:00:00Z");
const executionGeneratedAt = "2026-09-21T19:50:00Z";
const healthy = {
  sources: {
    generatedAt: "2026-09-21T19:30:00Z",
    critical: { gate: "GREEN", ready: 9, total: 9 },
  },
  intelligence: {
    generatedAt: "2026-09-21T19:30:00Z",
    intelligenceConfidence: 93,
    crossSourceValidation: { checked: 18, divergent: 0 },
    coverage: { sourceConcentrationPercent: 42, marketSources: 4, assetClasses: ["ETF", "Equity", "Crypto", "Bond"] },
    policy: { unknownTimestampEvidenceExcluded: true },
  },
  executionMarket: {
    generatedAt: executionGeneratedAt,
    observations: [
      { sourceFamily: "twelve-data", eligibility: "PAPER" },
      { sourceFamily: "alpha-vantage", eligibility: "PAPER" },
      { sourceFamily: "stooq", eligibility: "VALIDATION_ONLY" },
    ],
    policy: {
      liveTradingAllowed: false,
      validationOnlySourcesNeverSatisfyPaperQuorum: true,
      untaggedLegacyEvidenceDefaultsToValidationOnly: true,
    },
  },
  executionCoverage: {
    version: 5,
    generatedAt: "2026-09-21T19:51:00Z",
    evidenceGeneratedAt: executionGeneratedAt,
    requestedSymbols: 12,
    paperEligibleSymbols: 5,
    paperEligiblePercent: 41.7,
    rows: [
      { symbol: "SPY", paperEligible: true, directaOptionalEvidence: false },
      { symbol: "QQQ", paperEligible: true, directaOptionalEvidence: true },
    ],
    policy: {
      requiredEligibility: "PAPER",
      minIndependentSourceFamilies: 2,
      preferredIndependentSourceFamilies: 3,
      directaPaidRealtimeRequired: false,
      directaEvidenceOptionalForPaperCertification: true,
      approvedIndependentPaperSourceFamilies: ["alpha-vantage", "alpaca", "massive", "twelve-data"],
      validationOnlyEvidenceCannotSatisfyPaperQuorum: true,
      liveTradingAllowed: false,
    },
  },
  governance: {
    guardrails: { blockAutonomousTrading: true, requireHumanConfirmation: true },
    prohibitedActions: ["inviare ordini", "collegarsi a broker"],
  },
  fingerprint: { complete: true, algorithm: "sha256", digest: "a".repeat(64) },
  now,
};

const pass = evaluatePaperBaselineEligibility(healthy);
assert.equal(pass.eligible, true, pass.reasons.join(" | "));
assert.equal(pass.metrics.paperEligibleSourceFamilies, 2);
assert.equal(pass.metrics.paperEligibleSymbols, 5);
assert.equal(pass.metrics.directaPaidRealtimeRequired, false);
assert.equal(pass.metrics.directaEvidenceOptionalForPaperCertification, true);
assert.equal(pass.metrics.directaOptionalEvidenceSymbols, 1);
assert.ok(pass.metrics.approvedIndependentPaperSourceFamilies.includes("twelve-data"));
assert.equal(pass.gates.executionSymbolCoverage, true);
assert.equal(pass.gates.zeroCostPaperPolicy, true);

const noDirectaEvidence = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    rows: healthy.executionCoverage.rows.map((row) => ({ ...row, directaOptionalEvidence: false })),
  },
});
assert.equal(noDirectaEvidence.eligible, true, "Directa evidence must be optional for PAPER certification");
assert.equal(noDirectaEvidence.metrics.directaOptionalEvidenceSymbols, 0);

const lowQuality = evaluatePaperBaselineEligibility({
  ...healthy,
  intelligence: { ...healthy.intelligence, intelligenceConfidence: 89 },
});
assert.equal(lowQuality.eligible, false);
assert.equal(lowQuality.gates.dataQuality, false);

const staleSources = evaluatePaperBaselineEligibility({
  ...healthy,
  sources: { ...healthy.sources, generatedAt: "2026-09-19T10:00:00Z" },
});
assert.equal(staleSources.eligible, false);
assert.equal(staleSources.gates.criticalSources, false);

const fakeRedundancy = evaluatePaperBaselineEligibility({
  ...healthy,
  executionMarket: {
    ...healthy.executionMarket,
    observations: [
      { sourceFamily: "same-provider", eligibility: "PAPER" },
      { sourceFamily: "same-provider", eligibility: "PAPER" },
      { sourceFamily: "validator", eligibility: "VALIDATION_ONLY" },
    ],
  },
});
assert.equal(fakeRedundancy.eligible, false);
assert.equal(fakeRedundancy.metrics.paperEligibleSourceFamilies, 1);

const validationOnlySecondSource = evaluatePaperBaselineEligibility({
  ...healthy,
  executionMarket: {
    ...healthy.executionMarket,
    observations: [
      { sourceFamily: "twelve-data", eligibility: "PAPER" },
      { sourceFamily: "stooq", eligibility: "VALIDATION_ONLY" },
    ],
  },
});
assert.equal(validationOnlySecondSource.eligible, false, "VALIDATION_ONLY evidence must not satisfy PAPER redundancy");

const narrowCoverage = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    paperEligibleSymbols: 2,
    paperEligiblePercent: 16.7,
  },
});
assert.equal(narrowCoverage.eligible, false);
assert.equal(narrowCoverage.gates.executionSymbolCoverage, false);
assert.ok(narrowCoverage.reasons.some((reason) => reason.includes("per-symbol PAPER execution coverage")));

const legacyDirectaPolicy = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    version: 4,
    policy: {
      requiredEligibility: "PAPER",
      minIndependentSourceFamilies: 2,
      minimumDirectaPilotEligibleSymbols: 3,
      requireDirectaPaperSourceForDirectaPilot: true,
      requireIndependentNonDirectaPaperSourceForDirectaPilot: true,
      liveTradingAllowed: false,
    },
  },
});
assert.equal(legacyDirectaPolicy.eligible, false, "legacy Directa-mandatory coverage policy must not certify the zero-cost baseline");
assert.equal(legacyDirectaPolicy.gates.zeroCostPaperPolicy, false);

const paidDirectaRequired = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    policy: { ...healthy.executionCoverage.policy, directaPaidRealtimeRequired: true },
  },
});
assert.equal(paidDirectaRequired.eligible, false, "paid Directa realtime must never become a PAPER prerequisite");

const directaNotOptional = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    policy: { ...healthy.executionCoverage.policy, directaEvidenceOptionalForPaperCertification: false },
  },
});
assert.equal(directaNotOptional.eligible, false, "policy must explicitly keep Directa evidence optional");

const validationAllowed = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    policy: { ...healthy.executionCoverage.policy, validationOnlyEvidenceCannotSatisfyPaperQuorum: false },
  },
});
assert.equal(validationAllowed.eligible, false, "validation-only evidence must never satisfy the PAPER quorum");

const mismatchedCoverage = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    evidenceGeneratedAt: "2026-09-21T19:00:00Z",
  },
});
assert.equal(mismatchedCoverage.eligible, false);
assert.equal(mismatchedCoverage.metrics.executionCoverageMatchesEvidence, false);

const staleCoverage = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    generatedAt: "2026-09-21T18:00:00Z",
  },
});
assert.equal(staleCoverage.eligible, false);
assert.equal(staleCoverage.gates.executionSymbolCoverage, false);

const liveUnlocked = evaluatePaperBaselineEligibility({
  ...healthy,
  governance: {
    guardrails: { blockAutonomousTrading: false, requireHumanConfirmation: true },
    prohibitedActions: ["inviare ordini", "collegarsi a broker"],
  },
});
assert.equal(liveUnlocked.eligible, false);
assert.equal(liveUnlocked.gates.liveTradingLocked, false);

console.log("Fenice paper baseline eligibility tests: PASS");
