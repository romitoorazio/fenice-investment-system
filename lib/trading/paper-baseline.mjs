const HOUR_MS = 3_600_000;

function ageHours(timestamp, now) {
  const parsed = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (Number(now) - parsed) / HOUR_MS;
}

function timestampsMatch(left, right, toleranceMs = 1000) {
  const a = Date.parse(String(left || ""));
  const b = Date.parse(String(right || ""));
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= toleranceMs;
}

export function evaluatePaperBaselineEligibility({
  sources,
  intelligence,
  executionMarket,
  executionCoverage,
  governance,
  fingerprint,
  now = Date.now(),
  maxSourceAgeHours = 24,
  maxIntelligenceAgeHours = 24,
  maxExecutionEvidenceAgeMinutes = 30,
  maxExecutionCoverageAgeMinutes = 30,
  minPaperEligibleSymbols = 3,
  minPaperEligiblePercent = 25,
} = {}) {
  const reasons = [];
  const sourceAge = ageHours(sources?.generatedAt, now);
  const intelligenceAge = ageHours(intelligence?.generatedAt, now);
  const executionAgeMinutes = ageHours(executionMarket?.generatedAt, now) * 60;
  const coverageAgeMinutes = ageHours(executionCoverage?.generatedAt, now) * 60;

  const sourceFresh = sourceAge >= 0 && sourceAge <= maxSourceAgeHours;
  const criticalSourcesReady = sourceFresh
    && sources?.critical?.gate === "GREEN"
    && Number(sources?.critical?.total || 0) > 0
    && Number(sources?.critical?.ready || 0) === Number(sources?.critical?.total || 0);
  if (!criticalSourcesReady) reasons.push("critical source health is not fresh GREEN");

  const intelligenceFresh = intelligenceAge >= 0 && intelligenceAge <= maxIntelligenceAgeHours;
  const crossChecks = Number(intelligence?.crossSourceValidation?.checked || 0);
  const divergent = Number(intelligence?.crossSourceValidation?.divergent || 0);
  const dataQualityReady = intelligenceFresh
    && Number(intelligence?.intelligenceConfidence || 0) >= 90
    && Number(intelligence?.coverage?.sourceConcentrationPercent ?? 100) <= 50
    && Number(intelligence?.coverage?.marketSources || 0) >= 3
    && Array.isArray(intelligence?.coverage?.assetClasses)
    && intelligence.coverage.assetClasses.length >= 3
    && crossChecks >= 10
    && divergent === 0
    && intelligence?.policy?.unknownTimestampEvidenceExcluded === true;
  if (!dataQualityReady) reasons.push("institutional data-quality gate is not satisfied");

  const executionFresh = executionAgeMinutes >= 0 && executionAgeMinutes <= maxExecutionEvidenceAgeMinutes;
  const observations = Array.isArray(executionMarket?.observations) ? executionMarket.observations : [];
  const unverifiedPaperObservations = observations.filter((row) =>
    (row?.eligibility === "PAPER" || row?.eligibility === "LIVE") && row?.provenanceVerified !== true,
  );
  const paperEligibleFamilies = new Set(
    observations
      .filter((row) => (row?.eligibility === "PAPER" || row?.eligibility === "LIVE") && row?.provenanceVerified === true)
      .map((row) => String(row?.sourceFamily || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const executionEvidencePolicyReady = Number(executionMarket?.version || 0) >= 10
    && executionMarket?.policy?.liveTradingAllowed === false
    && executionMarket?.policy?.validationOnlySourcesNeverSatisfyPaperQuorum === true
    && executionMarket?.policy?.untaggedLegacyEvidenceDefaultsToValidationOnly === true
    && executionMarket?.policy?.providerVenueMustBeVerifiedBeforePaperEligibility === true
    && executionMarket?.policy?.delayedIntradayEvidenceNeverSatisfiesPaperQuorum === true
    && executionMarket?.policy?.paperEligibilityRequiresExplicitRealtimeAndEntitlement === true
    && executionMarket?.policy?.paperEligibilityRequiresVerifiedProvenance === true;
  const executionEvidenceReady = executionFresh
    && executionEvidencePolicyReady
    && unverifiedPaperObservations.length === 0
    && paperEligibleFamilies.size >= 2;
  if (!executionEvidenceReady) reasons.push("fresh, provenance-verified PAPER execution market-data redundancy is not proven");

  const coverageFresh = coverageAgeMinutes >= 0 && coverageAgeMinutes <= maxExecutionCoverageAgeMinutes;
  const coverageMatchesEvidence = timestampsMatch(executionCoverage?.evidenceGeneratedAt, executionMarket?.generatedAt);
  const requestedSymbols = Math.max(0, Number(executionCoverage?.requestedSymbols || 0));
  const paperEligibleSymbols = Math.max(0, Number(executionCoverage?.paperEligibleSymbols || 0));
  const paperEligiblePercent = Math.max(0, Number(executionCoverage?.paperEligiblePercent || 0));
  const minimumEligibleSymbols = Math.max(1, Number(minPaperEligibleSymbols) || 3);
  const minimumEligiblePercent = Math.max(0, Math.min(100, Number(minPaperEligiblePercent) || 25));
  const approvedPaperFamilies = Array.isArray(executionCoverage?.policy?.approvedIndependentPaperSourceFamilies)
    ? executionCoverage.policy.approvedIndependentPaperSourceFamilies.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
  const coveragePolicyReady = Number(executionCoverage?.version || 0) >= 6
    && executionCoverage?.policy?.requiredEligibility === "PAPER"
    && Number(executionCoverage?.policy?.minIndependentSourceFamilies || 0) >= 2
    && Number(executionCoverage?.policy?.preferredIndependentSourceFamilies || 0) >= 3
    && executionCoverage?.policy?.directaPaidRealtimeRequired === false
    && executionCoverage?.policy?.directaEvidenceOptionalForPaperCertification === true
    && executionCoverage?.policy?.validationOnlyEvidenceCannotSatisfyPaperQuorum === true
    && executionCoverage?.policy?.paperEligibilityRequiresVerifiedProvenance === true
    && approvedPaperFamilies.length >= 2
    && executionCoverage?.policy?.liveTradingAllowed === false;
  const broadCoverageReady = requestedSymbols >= minimumEligibleSymbols
    && paperEligibleSymbols >= minimumEligibleSymbols
    && paperEligiblePercent >= minimumEligiblePercent;
  const executionCoverageReady = coverageFresh
    && coverageMatchesEvidence
    && coveragePolicyReady
    && broadCoverageReady;
  if (!executionCoverageReady) {
    reasons.push(`per-symbol PAPER execution coverage is insufficient, stale, mismatched, or policy-invalid (${paperEligibleSymbols}/${requestedSymbols}, ${paperEligiblePercent}%)`);
  }

  const prohibited = new Set(governance?.prohibitedActions || []);
  const liveLockReady = governance?.guardrails?.blockAutonomousTrading === true
    && governance?.guardrails?.requireHumanConfirmation === true
    && prohibited.has("inviare ordini")
    && prohibited.has("collegarsi a broker");
  if (!liveLockReady) reasons.push("live-trading lock is not fully enforced");

  const fingerprintReady = fingerprint?.complete === true
    && fingerprint?.algorithm === "sha256"
    && /^[a-f0-9]{64}$/i.test(String(fingerprint?.digest || ""));
  if (!fingerprintReady) reasons.push("paper validation core fingerprint is incomplete");

  const rows = Array.isArray(executionCoverage?.rows) ? executionCoverage.rows : [];
  const directaOptionalEvidenceSymbols = rows.filter((row) => row?.directaOptionalEvidence === true).length;

  return {
    eligible: reasons.length === 0,
    reasons,
    gates: {
      criticalSources: criticalSourcesReady,
      dataQuality: dataQualityReady,
      executionMarketData: executionEvidenceReady,
      executionMarketProvenancePolicy: executionEvidencePolicyReady,
      executionSymbolCoverage: executionCoverageReady,
      zeroCostPaperPolicy: coveragePolicyReady,
      liveTradingLocked: liveLockReady,
      validationFingerprint: fingerprintReady,
    },
    metrics: {
      sourceAgeHours: Number.isFinite(sourceAge) ? Number(sourceAge.toFixed(2)) : null,
      intelligenceAgeHours: Number.isFinite(intelligenceAge) ? Number(intelligenceAge.toFixed(2)) : null,
      executionEvidenceAgeMinutes: Number.isFinite(executionAgeMinutes) ? Number(executionAgeMinutes.toFixed(1)) : null,
      executionCoverageAgeMinutes: Number.isFinite(coverageAgeMinutes) ? Number(coverageAgeMinutes.toFixed(1)) : null,
      executionCoverageMatchesEvidence: coverageMatchesEvidence,
      executionEvidenceVersion: Number(executionMarket?.version || 0),
      executionCoverageVersion: Number(executionCoverage?.version || 0),
      intelligenceConfidence: Number(intelligence?.intelligenceConfidence || 0),
      crossChecks,
      divergent,
      marketSources: Number(intelligence?.coverage?.marketSources || 0),
      sourceConcentrationPercent: Number(intelligence?.coverage?.sourceConcentrationPercent ?? 100),
      paperEligibleSourceFamilies: paperEligibleFamilies.size,
      unverifiedPaperObservations: unverifiedPaperObservations.length,
      requestedExecutionSymbols: requestedSymbols,
      paperEligibleSymbols,
      paperEligiblePercent,
      minimumPaperEligibleSymbols: minimumEligibleSymbols,
      minimumPaperEligiblePercent: minimumEligiblePercent,
      approvedIndependentPaperSourceFamilies: approvedPaperFamilies,
      paperEligibilityRequiresVerifiedProvenance: executionCoverage?.policy?.paperEligibilityRequiresVerifiedProvenance === true,
      directaPaidRealtimeRequired: executionCoverage?.policy?.directaPaidRealtimeRequired === true,
      directaEvidenceOptionalForPaperCertification: executionCoverage?.policy?.directaEvidenceOptionalForPaperCertification === true,
      directaOptionalEvidenceSymbols,
    },
  };
}
