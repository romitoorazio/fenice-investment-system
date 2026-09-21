import assert from "node:assert/strict";
import { evaluateDecisionDataGate } from "../lib/trading/decision-data-gate.mjs";

const now = Date.parse("2026-09-21T16:35:00Z");
const healthy = {
  sourceHealth: {
    generatedAt: "2026-09-21T16:33:00Z",
    critical: { gate: "GREEN", ready: 9, total: 9 },
  },
  intelligence: {
    generatedAt: "2026-09-21T16:34:00Z",
    intelligenceConfidence: 92,
    coverage: {
      sourceConcentrationPercent: 46,
      marketSources: 3,
      assetClasses: ["ETF", "Equity", "Crypto", "Bond"],
    },
    crossSourceValidation: { checked: 20, divergent: 0 },
    policy: {
      unknownTimestampEvidenceExcluded: true,
      validationEvidenceFreshnessHours: { crypto: 4, traditional: 96 },
    },
  },
  now,
};

const pass = evaluateDecisionDataGate(healthy);
assert.equal(pass.ready, true, pass.reasons.join(" | "));
assert.equal(pass.policy.liveTradingAllowed, false);

const lowConfidence = evaluateDecisionDataGate({
  ...healthy,
  intelligence: { ...healthy.intelligence, intelligenceConfidence: 89 },
});
assert.equal(lowConfidence.ready, false);

const divergent = evaluateDecisionDataGate({
  ...healthy,
  intelligence: {
    ...healthy.intelligence,
    crossSourceValidation: { checked: 20, divergent: 1 },
  },
});
assert.equal(divergent.ready, false);

const concentrated = evaluateDecisionDataGate({
  ...healthy,
  intelligence: {
    ...healthy.intelligence,
    coverage: { ...healthy.intelligence.coverage, sourceConcentrationPercent: 50.1 },
  },
});
assert.equal(concentrated.ready, false);

const staleIntelligence = evaluateDecisionDataGate({
  ...healthy,
  intelligence: { ...healthy.intelligence, generatedAt: "2026-09-21T16:20:00Z" },
});
assert.equal(staleIntelligence.ready, false);

const missingCritical = evaluateDecisionDataGate({
  ...healthy,
  sourceHealth: {
    ...healthy.sourceHealth,
    critical: { gate: "GREEN", ready: 8, total: 9 },
  },
});
assert.equal(missingCritical.ready, false);

const weakFreshnessPolicy = evaluateDecisionDataGate({
  ...healthy,
  intelligence: {
    ...healthy.intelligence,
    policy: {
      ...healthy.intelligence.policy,
      validationEvidenceFreshnessHours: { crypto: 8, traditional: 96 },
    },
  },
});
assert.equal(weakFreshnessPolicy.ready, false);

console.log("Fenice decision-data gate tests: PASS");
