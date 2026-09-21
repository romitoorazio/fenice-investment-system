function ageMinutes(timestamp, now) {
  const parsed = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (Number(now) - parsed) / 60_000;
}

export function evaluateDecisionDataGate({
  sourceHealth,
  intelligence,
  now = Date.now(),
  maxAgeMinutes = 10,
  minConfidence = 90,
  maxSourceConcentrationPercent = 50,
  minMarketSources = 3,
  minAssetClasses = 3,
  minCrossChecks = 10,
} = {}) {
  const sourceAgeMinutes = ageMinutes(sourceHealth?.generatedAt, now);
  const intelligenceAgeMinutes = ageMinutes(intelligence?.generatedAt, now);
  const maxAge = Math.max(1, Number(maxAgeMinutes) || 10);
  const criticalReady = Number(sourceHealth?.critical?.ready || 0);
  const criticalTotal = Number(sourceHealth?.critical?.total || 0);
  const sourceReady = sourceAgeMinutes >= 0
    && sourceAgeMinutes <= maxAge
    && sourceHealth?.critical?.gate === "GREEN"
    && criticalTotal > 0
    && criticalReady === criticalTotal;

  const confidence = Number(intelligence?.intelligenceConfidence || 0);
  const sourceConcentrationPercent = Number(intelligence?.coverage?.sourceConcentrationPercent ?? 100);
  const marketSources = Number(intelligence?.coverage?.marketSources || 0);
  const assetClasses = Array.isArray(intelligence?.coverage?.assetClasses)
    ? intelligence.coverage.assetClasses.length
    : 0;
  const crossChecks = Number(intelligence?.crossSourceValidation?.checked || 0);
  const divergent = Number(intelligence?.crossSourceValidation?.divergent || 0);
  const freshnessPolicyReady = intelligence?.policy?.unknownTimestampEvidenceExcluded === true
    && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.crypto) > 0
    && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.crypto) <= 4
    && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.traditional) > 0
    && Number(intelligence?.policy?.validationEvidenceFreshnessHours?.traditional) <= 96;
  const dataReady = intelligenceAgeMinutes >= 0
    && intelligenceAgeMinutes <= maxAge
    && confidence >= Number(minConfidence)
    && sourceConcentrationPercent <= Number(maxSourceConcentrationPercent)
    && marketSources >= Number(minMarketSources)
    && assetClasses >= Number(minAssetClasses)
    && crossChecks >= Number(minCrossChecks)
    && divergent === 0
    && freshnessPolicyReady;

  const reasons = [];
  if (!sourceReady) reasons.push("critical source health is not fresh GREEN");
  if (!dataReady) reasons.push("institutional intelligence-quality evidence is not ready");

  return {
    ready: sourceReady && dataReady,
    sourceReady,
    dataReady,
    reasons,
    metrics: {
      sourceAgeMinutes: Number.isFinite(sourceAgeMinutes) ? Number(sourceAgeMinutes.toFixed(1)) : null,
      intelligenceAgeMinutes: Number.isFinite(intelligenceAgeMinutes) ? Number(intelligenceAgeMinutes.toFixed(1)) : null,
      criticalReady,
      criticalTotal,
      confidence,
      sourceConcentrationPercent,
      marketSources,
      assetClasses,
      crossChecks,
      divergent,
      freshnessPolicyReady,
    },
    policy: {
      maxAgeMinutes: maxAge,
      minConfidence: Number(minConfidence),
      maxSourceConcentrationPercent: Number(maxSourceConcentrationPercent),
      minMarketSources: Number(minMarketSources),
      minAssetClasses: Number(minAssetClasses),
      minCrossChecks: Number(minCrossChecks),
      requireZeroDivergence: true,
      requireFreshnessPolicy: true,
      liveTradingAllowed: false,
    },
  };
}
