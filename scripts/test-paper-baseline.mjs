import assert from "node:assert/strict";
import { evaluatePaperBaselineEligibility } from "../lib/trading/paper-baseline.mjs";

const now = Date.parse("2026-09-21T20:00:00Z");
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
    generatedAt: "2026-09-21T19:50:00Z",
    observations: [
      { sourceFamily: "provider-a", eligibility: "PAPER" },
      { sourceFamily: "provider-b", eligibility: "PAPER" },
      { sourceFamily: "provider-b", eligibility: "PAPER" },
    ],
    policy: { liveTradingAllowed: false, validationOnlySourcesNeverSatisfyPaperQuorum: true },
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
