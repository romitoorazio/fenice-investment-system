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
      { sourceFamily: "provider-a", eligibility: "PAPER" },
      { sourceFamily: "provider-b", eligibility: "PAPER" },
      { sourceFamily: "provider-b", eligibility: "PAPER" },
    ],
    policy: { liveTradingAllowed: false, validationOnlySourcesNeverSatisfyPaperQuorum: true },
  },
  executionCoverage: {
    version: 2,
    generatedAt: "2026-09-21T19:51:00Z",
    evidenceGeneratedAt: executionGeneratedAt,
    requestedSymbols: 12,
    paperEligibleSymbols: 5,
    paperEligiblePercent: 41.7,
    directaPilotCandidateSymbols: 9,
    directaPilotEligibleSymbols: 4,
    directaPilotEligiblePercent: 44.4,
    policy: {
      requiredEligibility: "PAPER",
      minIndependentSourceFamilies: 2,
      minimumDirectaPilotEligibleSymbols: 3,
      cryptoCannotSatisfyDirectaPilotCoverage: true,
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
assert.equal(pass.metrics.directaPilotEligibleSymbols, 4);
assert.equal(pass.gates.executionSymbolCoverage, true);
assert.equal(pass.gates.directaPilotCoverage, true);

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

const cryptoOnlyCoverage = evaluatePaperBaselineEligibility({
  ...healthy,
  executionCoverage: {
    ...healthy.executionCoverage,
    requestedSymbols: 12,
    paperEligibleSymbols: 5,
    paperEligiblePercent: 41.7,
    directaPilotCandidateSymbols: 9,
    directaPilotEligibleSymbols: 0,
    directaPilotEligiblePercent: 0,
  },
});
assert.equal(cryptoOnlyCoverage.eligible, false, "crypto quorum must not certify the Directa equity/ETF pilot");
assert.equal(cryptoOnlyCoverage.gates.directaPilotCoverage, false);
assert.ok(cryptoOnlyCoverage.reasons.some((reason) => reason.includes("Directa pilot equity/ETF")));

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