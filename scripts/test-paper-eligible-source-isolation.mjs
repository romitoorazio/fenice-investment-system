import assert from "node:assert/strict";
import { evaluateExecutionReadiness } from "../lib/trading/execution-readiness.ts";

const now = Date.parse("2026-10-09T16:00:00.000Z");
const at = (s) => new Date(now - s * 1000).toISOString();
const observation = (sourceFamily, eligibility = "PAPER", provenanceVerified = true) => ({
  symbol: "AAPL", sourceFamily, eligibility, provenanceVerified,
});
const paperPolicy = {
  liveTradingAllowed: false,
  validationOnlySourcesNeverSatisfyPaperQuorum: true,
  untaggedLegacyEvidenceDefaultsToValidationOnly: true,
  paperEligibilityRequiresVerifiedProvenance: true,
};
const coveragePolicy = {
  requiredEligibility: "PAPER",
  minIndependentSourceFamilies: 2,
  preferredIndependentSourceFamilies: 3,
  directaPaidRealtimeRequired: false,
  directaEvidenceOptionalForPaperCertification: true,
  validationOnlyEvidenceCannotSatisfyPaperQuorum: true,
  paperEligibilityRequiresVerifiedProvenance: true,
  approvedIndependentPaperSourceFamilies: ["alpaca", "twelve-data"],
  preferredZeroCostPaperSourceFamilies: ["alpaca", "twelve-data"],
  liveTradingAllowed: false,
};
const goodEvidence = {
  version: 10,
  generatedAt: at(15),
  observations: [observation("alpaca"), observation("twelve-data")],
  capabilities: {alpacaConfigured: true, twelveDataConfigured: true},
  policy: paperPolicy,
};
const goodCoverage = {
  version: 6,
  generatedAt: at(8),
  evidenceGeneratedAt: at(15),
  requestedSymbols: 12, paperEligibleSymbols: 4, paperEligiblePercent: 33.3,
  policy: coveragePolicy,
};
const assess = (e = goodEvidence, c = goodCoverage) => evaluateExecutionReadiness(e, c, now);
const valid = assess();
assert.equal(valid.verified, true);
assert.equal(valid.metrics.paperEligibleSourceFamilies, 2);
assert.equal(valid.metrics.rejectedLiveObservations, 0);
assert.equal(valid.metrics.liveTradingAllowed, false);

const solelyLive = assess({
  ...goodEvidence,
  observations: [observation("alpaca", "LIVE"), observation("twelve-data", "LIVE")],
});
assert.equal(solelyLive.verified, false);
assert.equal(solelyLive.metrics.rejectedLiveObservations, 2);
assert.equal(solelyLive.metrics.paperEligibleSourceFamilies, 0);
assert(solelyLive.reasons.some((reason) => reason.includes("LIVE-tagged")));

const mixed = assess({ ...goodEvidence,
  observations: [observation("alpaca"), observation("twelve-data", "LIVE")],
});
assert.equal(mixed.verified, false);
assert.equal(mixed.metrics.paperEligibleSourceFamilies, 1);
assert.equal(mixed.metrics.rejectedLiveObservations, 1);

const extraLive = assess({ ...goodEvidence,
  observations: [...goodEvidence.observations, observation("directa", "LIVE")],
});
assert.equal(extraLive.verified, false, "a third LIVE provider never increases redundancy");
assert.equal(extraLive.metrics.paperEligibleSourceFamilies, 2);
assert.equal(extraLive.metrics.rejectedLiveObservations, 1);

const rogue = assess({ ...goodEvidence,
  observations: [observation("unregistered-a"), observation("unregistered-b")],
});
assert.equal(rogue.verified, false, "arbitrary provider families cannot satisfy PAPER");
assert.equal(rogue.metrics.paperEligibleSourceFamilies, 0);

const mixedApproved = assess({ ...goodEvidence,
  observations: [observation("alpaca"), observation("unregistered-b")],
});
assert.equal(mixedApproved.verified, false);
assert.equal(mixedApproved.metrics.paperEligibleSourceFamilies, 1);

const validationOnly = assess({ ...goodEvidence,
  observations: [observation("alpaca"), observation("twelve-data", "VALIDATION_ONLY")],
});
assert.equal(validationOnly.verified, false);
assert.equal(validationOnly.metrics.paperEligibleSourceFamilies, 1);

const unverified = assess({ ...goodEvidence,
  observations: [observation("alpaca", "PAPER", false), observation("twelve-data")],
});
assert.equal(unverified.verified, false);
assert.equal(unverified.metrics.unverifiedPaperObservations, 1);
assert.equal(unverified.metrics.paperEligibleSourceFamilies, 1);

const policyDisallowsAlpaca = assess(goodEvidence, {
  ...goodCoverage,
  policy: { ...coveragePolicy, approvedIndependentPaperSourceFamilies: ["twelve-data", "directa"] },
});
assert.equal(policyDisallowsAlpaca.verified, false);
assert.equal(policyDisallowsAlpaca.metrics.paperEligibleSourceFamilies, 1);

assert.equal(assess({ ...goodEvidence, generatedAt: at(3600) }).verified, false);
assert.equal(assess(goodEvidence, { ...goodCoverage, policy: { ...coveragePolicy, liveTradingAllowed: true } }).verified, false);
console.log("Fenice PAPER eligibility separation and approved independent source regression: PASS.");
