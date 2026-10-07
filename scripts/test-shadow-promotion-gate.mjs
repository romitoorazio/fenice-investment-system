import assert from "node:assert/strict";
import { buildShadowPromotionGate } from "../lib/intelligence/shadow-promotion-gate.mjs";

const now = new Date("2026-10-07T20:00:00Z");

function baseReport() {
  return {
    generatedAt: "2026-10-07T19:30:00Z",
    safety: {
      diagnosticOnly: true,
      modifiesV6DecisionPolicy: false,
      queueWritesAllowed: false,
      paperCertificationEvidenceMutationAllowed: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
      feedsProposalReadiness: false,
    },
    methodology: {
      forwardOnly: true,
      historicalBackfillAllowed: false,
    },
    sourceState: {
      sourceFresh: true,
    },
    totalRecords: 40,
    activeRecords: 10,
    matured7d: {
      sampleSize: 30,
      maturity: "MATURE",
      beatWaitRatePercent: 66.67,
      averageStagedReturnPercent: 1.2,
      averageWorstObservedReturnPercent: -4.5,
    },
    matured30d: {
      sampleSize: 30,
      maturity: "MATURE",
      beatWaitRatePercent: 63.33,
      averageStagedReturnPercent: 2.4,
      averageWorstObservedReturnPercent: -7.2,
    },
  };
}

const mature = buildShadowPromotionGate(baseReport(), { now });
assert.equal(mature.state, "ELIGIBLE_FOR_HUMAN_RESEARCH_REVIEW");
assert.equal(mature.eligibleForHumanResearchReview, true);
assert.deepEqual(mature.blockers, []);
assert.equal(mature.safety.liveTradingAllowed, false);
assert.equal(mature.safety.canEnablePaper, false);
assert.equal(mature.safety.canEnableLive, false);
assert.equal(mature.promotionPolicy.automaticPromotionAllowed, false);

const early = baseReport();
early.matured7d = {
  sampleSize: 4,
  maturity: "INSUFFICIENT",
  beatWaitRatePercent: null,
  averageStagedReturnPercent: null,
  averageWorstObservedReturnPercent: null,
};
early.matured30d = {
  sampleSize: 0,
  maturity: "INSUFFICIENT",
  beatWaitRatePercent: null,
  averageStagedReturnPercent: null,
  averageWorstObservedReturnPercent: null,
};
const locked = buildShadowPromotionGate(early, { now });
assert.equal(locked.state, "LOCKED");
assert.equal(locked.eligibleForHumanResearchReview, false);
assert(locked.blockers.includes("7D_SAMPLE_BELOW_30"));
assert(locked.blockers.includes("30D_SAMPLE_BELOW_30"));

const weak = baseReport();
weak.matured7d.beatWaitRatePercent = 55;
weak.matured30d.averageStagedReturnPercent = 0.2;
weak.matured30d.averageWorstObservedReturnPercent = -15;
const weakGate = buildShadowPromotionGate(weak, { now });
assert.equal(weakGate.state, "LOCKED");
assert(weakGate.blockers.includes("7D_BEAT_RATE_BELOW_60"));
assert(weakGate.blockers.includes("30D_AVERAGE_RETURN_BELOW_0.75"));
assert(weakGate.blockers.includes("30D_AVERAGE_WORST_RETURN_BELOW_12"));

const coupled = baseReport();
coupled.safety.feedsProposalReadiness = true;
const coupledGate = buildShadowPromotionGate(coupled, { now });
assert.equal(coupledGate.state, "LOCKED");
assert(coupledGate.blockers.includes("PROPOSAL_READINESS_COUPLING_DETECTED"));

const stale = baseReport();
stale.generatedAt = "2026-10-05T00:00:00Z";
const staleGate = buildShadowPromotionGate(stale, { now });
assert.equal(staleGate.state, "LOCKED");
assert(staleGate.blockers.includes("PROMOTION_REPORT_STALE"));

console.log("Fenice V7 shadow promotion gate: PASS");
