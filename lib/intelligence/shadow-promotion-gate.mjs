const finite = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const round = (value, digits = 2) => {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

function blocker(blockers, condition, code) {
  if (condition) blockers.push(code);
}

function evaluateHorizon(summary, {
  label,
  minSamples,
  minBeatWaitRatePercent,
  minAverageReturnPercent,
  minAverageWorstObservedReturnPercent,
}) {
  const blockers = [];
  const sampleSize = Number(summary?.sampleSize || 0);
  const maturity = String(summary?.maturity || "INSUFFICIENT").toUpperCase();
  const beatWaitRatePercent = finite(summary?.beatWaitRatePercent) ? Number(summary.beatWaitRatePercent) : null;
  const averageReturnPercent = finite(summary?.averageStagedReturnPercent) ? Number(summary.averageStagedReturnPercent) : null;
  const averageWorstObservedReturnPercent = finite(summary?.averageWorstObservedReturnPercent)
    ? Number(summary.averageWorstObservedReturnPercent)
    : null;

  blocker(blockers, sampleSize < minSamples, `${label}_SAMPLE_BELOW_${minSamples}`);
  blocker(blockers, maturity !== "MATURE", `${label}_NOT_MATURE`);
  blocker(blockers, !finite(beatWaitRatePercent), `${label}_BEAT_RATE_MISSING`);
  blocker(blockers, finite(beatWaitRatePercent) && beatWaitRatePercent < minBeatWaitRatePercent, `${label}_BEAT_RATE_BELOW_${minBeatWaitRatePercent}`);
  blocker(blockers, !finite(averageReturnPercent), `${label}_AVERAGE_RETURN_MISSING`);
  blocker(blockers, finite(averageReturnPercent) && averageReturnPercent < minAverageReturnPercent, `${label}_AVERAGE_RETURN_BELOW_${minAverageReturnPercent}`);
  blocker(blockers, !finite(averageWorstObservedReturnPercent), `${label}_DRAWDOWN_EVIDENCE_MISSING`);
  blocker(
    blockers,
    finite(averageWorstObservedReturnPercent)
      && averageWorstObservedReturnPercent < minAverageWorstObservedReturnPercent,
    `${label}_AVERAGE_WORST_RETURN_BELOW_${Math.abs(minAverageWorstObservedReturnPercent)}`,
  );

  return {
    label,
    sampleSize,
    maturity,
    beatWaitRatePercent,
    averageReturnPercent,
    averageWorstObservedReturnPercent,
    thresholds: {
      minSamples,
      minBeatWaitRatePercent,
      minAverageReturnPercent,
      minAverageWorstObservedReturnPercent,
    },
    passed: blockers.length === 0,
    blockers,
  };
}

export function buildShadowPromotionGate(shadowEvaluation, {
  now = new Date(),
  maxSourceAgeHours = 30,
  sevenDay = {
    minSamples: 30,
    minBeatWaitRatePercent: 60,
    minAverageReturnPercent: 0.25,
    minAverageWorstObservedReturnPercent: -8,
  },
  thirtyDay = {
    minSamples: 30,
    minBeatWaitRatePercent: 60,
    minAverageReturnPercent: 0.75,
    minAverageWorstObservedReturnPercent: -12,
  },
} = {}) {
  const blockers = [];
  const generatedAt = Date.parse(String(shadowEvaluation?.generatedAt || ""));
  const ageHours = Number.isFinite(generatedAt)
    ? Math.max(0, (now.getTime() - generatedAt) / 3_600_000)
    : null;

  blocker(blockers, shadowEvaluation?.safety?.liveTradingAllowed !== false, "LIVE_LOCK_NOT_VERIFIED");
  blocker(blockers, shadowEvaluation?.safety?.brokerSubmissionAllowed !== false, "BROKER_LOCK_NOT_VERIFIED");
  blocker(blockers, shadowEvaluation?.safety?.paperCertificationEvidenceMutationAllowed !== false, "PAPER_MUTATION_LOCK_NOT_VERIFIED");
  blocker(blockers, shadowEvaluation?.safety?.feedsProposalReadiness !== false, "PROPOSAL_READINESS_COUPLING_DETECTED");
  blocker(blockers, shadowEvaluation?.methodology?.forwardOnly !== true, "FORWARD_ONLY_NOT_VERIFIED");
  blocker(blockers, shadowEvaluation?.methodology?.historicalBackfillAllowed !== false, "HISTORICAL_BACKFILL_NOT_BLOCKED");
  blocker(blockers, shadowEvaluation?.sourceState?.sourceFresh !== true, "SOURCE_NOT_FRESH");
  blocker(blockers, !finite(ageHours) || ageHours > maxSourceAgeHours, "PROMOTION_REPORT_STALE");

  const h7 = evaluateHorizon(shadowEvaluation?.matured7d, { label: "7D", ...sevenDay });
  const h30 = evaluateHorizon(shadowEvaluation?.matured30d, { label: "30D", ...thirtyDay });
  blockers.push(...h7.blockers, ...h30.blockers);

  const uniqueBlockers = [...new Set(blockers)];
  const eligibleForHumanResearchReview = uniqueBlockers.length === 0;

  return {
    version: 1,
    generatedAt: now.toISOString(),
    purpose: "Fail-closed V7 research promotion gate for forward-only shadow evidence. Never grants PAPER or LIVE execution permission.",
    state: eligibleForHumanResearchReview ? "ELIGIBLE_FOR_HUMAN_RESEARCH_REVIEW" : "LOCKED",
    eligibleForHumanResearchReview,
    blockers: uniqueBlockers,
    evidence: {
      sourceGeneratedAt: shadowEvaluation?.generatedAt ?? null,
      sourceAgeHours: round(ageHours),
      sourceFresh: shadowEvaluation?.sourceState?.sourceFresh === true,
      totalRecords: Number(shadowEvaluation?.totalRecords || 0),
      activeRecords: Number(shadowEvaluation?.activeRecords || 0),
      sevenDay: h7,
      thirtyDay: h30,
    },
    promotionPolicy: {
      requiresBothHorizons: true,
      minimumIndependentSamplesPerHorizon: 30,
      minimumBeatWaitRatePercent: 60,
      sevenDayMinimumAverageReturnPercent: 0.25,
      thirtyDayMinimumAverageReturnPercent: 0.75,
      sevenDayAverageWorstReturnFloorPercent: -8,
      thirtyDayAverageWorstReturnFloorPercent: -12,
      humanReviewStillRequired: true,
      automaticPromotionAllowed: false,
    },
    safety: {
      diagnosticOnly: true,
      modifiesV6DecisionPolicy: false,
      queueWritesAllowed: false,
      paperCertificationEvidenceMutationAllowed: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
      feedsProposalReadiness: false,
      canEnablePaper: false,
      canEnableLive: false,
    },
  };
}
