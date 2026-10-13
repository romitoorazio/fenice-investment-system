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
    forwardBenchmark: {
      version: 4, state: "RESEARCH_SAMPLE_MATURE", benchmark: "SPY",
      currency: "USD", costPercent: 0.3, hasRealizedProfit: false,
      isolation: { researchOnly: true, liveTradingAllowed: false,
        brokerSubmissionAllowed: false, feedsPaperCertification: false },
      matured: {
        "7d": { pairedSamples: 32, independentEntryDays: 30,
          hypotheticalAverageExcessPercent: 0.35, beatBenchmarkRatePercent: 56.25 },
        "30d": { pairedSamples: 33, independentEntryDays: 31,
          hypotheticalAverageExcessPercent: 0.8, beatBenchmarkRatePercent: 60.61 },
      },
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


assert.equal(mature.evidence.independentBenchmark["7d"].independentEntryDays, 30);
assert.equal(mature.promotionPolicy.requirePositiveHypotheticalExcessAfterCosts, true);
const onlyCorrelatedDays = baseReport();
onlyCorrelatedDays.forwardBenchmark.matured["7d"].pairedSamples = 100;
onlyCorrelatedDays.forwardBenchmark.matured["7d"].independentEntryDays = 1;
const correlated = buildShadowPromotionGate(onlyCorrelatedDays, {now});
assert.equal(correlated.state, "LOCKED", "100 stocks on 1 day are not independent evidence");
assert(correlated.blockers.includes("7D_BENCHMARK_INDEPENDENT_DAYS_BELOW_30"));

const losesAfterCosts = baseReport();
losesAfterCosts.forwardBenchmark.matured["30d"].hypotheticalAverageExcessPercent = -0.05;
const losesGate = buildShadowPromotionGate(losesAfterCosts,{now});
assert.equal(losesGate.eligibleForHumanResearchReview,false);
assert(losesGate.blockers.includes("30D_BENCHMARK_NET_EXCESS_NOT_POSITIVE"));

const weakBenchmarkWins = baseReport();
weakBenchmarkWins.forwardBenchmark.matured["7d"].beatBenchmarkRatePercent = 50;
assert(buildShadowPromotionGate(weakBenchmarkWins,{now}).blockers.includes("7D_BENCHMARK_BEAT_RATE_NOT_ABOVE_50"));

const benchmarkAbsent = baseReport();
delete benchmarkAbsent.forwardBenchmark;
assert.equal(buildShadowPromotionGate(benchmarkAbsent,{now}).state,"LOCKED","missing benchmark must fail closed");

const provisionalOnly = baseReport();
provisionalOnly.forwardBenchmark.state="INSUFFICIENT_FORWARD_EVIDENCE";
assert(buildShadowPromotionGate(provisionalOnly,{now}).blockers.includes("BENCHMARK_FORWARD_SAMPLE_NOT_MATURE"));

const claimsRealProfit = baseReport();
claimsRealProfit.forwardBenchmark.hasRealizedProfit=true;
assert(buildShadowPromotionGate(claimsRealProfit,{now}).blockers.includes("BENCHMARK_SAFETY_BOUNDARY_INVALID"));

const falseFutureTimestamp = baseReport();
falseFutureTimestamp.generatedAt="2026-10-08T20:01:00Z";
assert(buildShadowPromotionGate(falseFutureTimestamp,{now}).blockers.includes("PROMOTION_REPORT_STALE"),
  "a report dated in the future is not fresh evidence");

const malformedBenchmark = baseReport();
malformedBenchmark.forwardBenchmark.matured["7d"].independentEntryDays=Infinity;
assert(buildShadowPromotionGate(malformedBenchmark,{now}).blockers.includes("7D_BENCHMARK_INDEPENDENT_DAYS_BELOW_30"));

console.log("Fenice V7 shadow promotion gate: PASS");
