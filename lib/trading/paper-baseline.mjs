const HOUR_MS = 3_600_000;

function ageHours(timestamp, now) {
  const parsed = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (Number(now) - parsed) / HOUR_MS;
}

export function evaluatePaperBaselineEligibility({
  sources,
  intelligence,
  executionMarket,
  governance,
  fingerprint,
  now = Date.now(),
  maxSourceAgeHours = 24,
  maxIntelligenceAgeHours = 24,
  maxExecutionEvidenceAgeMinutes = 30,
} = {}) {
  const reasons = [];
  const sourceAge = ageHours(sources?.generatedAt, now);
  const intelligenceAge = ageHours(intelligence?.generatedAt, now);
  const executionAgeMinutes = ageHours(executionMarket?.generatedAt, now) * 60;

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
  const paperEligibleFamilies = new Set(
    observations
      .filter((row) => row?.eligibility === "PAPER" || row?.eligibility === "LIVE")
      .map((row) => String(row?.sourceFamily || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const executionEvidenceReady = executionFresh
    && executionMarket?.policy?.liveTradingAllowed === false
    && executionMarket?.policy?.validationOnlySourcesNeverSatisfyPaperQuorum === true
    && paperEligibleFamilies.size >= 2;
  if (!executionEvidenceReady) reasons.push("fresh PAPER-eligible execution market-data redundancy is not proven");

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

  return {
    eligible: reasons.length === 0,
    reasons,
    gates: {
      criticalSources: criticalSourcesReady,
      dataQuality: dataQualityReady,
      executionMarketData: executionEvidenceReady,
      liveTradingLocked: liveLockReady,
      validationFingerprint: fingerprintReady,
    },
    metrics: {
      sourceAgeHours: Number.isFinite(sourceAge) ? Number(sourceAge.toFixed(2)) : null,
      intelligenceAgeHours: Number.isFinite(intelligenceAge) ? Number(intelligenceAge.toFixed(2)) : null,
      executionEvidenceAgeMinutes: Number.isFinite(executionAgeMinutes) ? Number(executionAgeMinutes.toFixed(1)) : null,
      intelligenceConfidence: Number(intelligence?.intelligenceConfidence || 0),
      crossChecks,
      divergent,
      marketSources: Number(intelligence?.coverage?.marketSources || 0),
      sourceConcentrationPercent: Number(intelligence?.coverage?.sourceConcentrationPercent ?? 100),
      paperEligibleSourceFamilies: paperEligibleFamilies.size,
    },
  };
}
