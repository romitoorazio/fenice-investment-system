export function selectShadowCalibrationCandidates(decisions, {
  minimumCommitteeScore = 68,
  minimumRawConfidence = 90,
  maximumRiskScore = 68,
  limit = 12,
} = {}) {
  const source = Array.isArray(decisions) ? decisions : [];
  return source
    .filter((item) => ["OSSERVA", "ATTENDI"].includes(String(item?.decision || "").toUpperCase()))
    .filter((item) => Number(item?.committeeScore) >= minimumCommitteeScore)
    .filter((item) => Number(item?.rawConfidenceBeforeCalibration) >= minimumRawConfidence)
    .filter((item) => Number(item?.riskScore) <= maximumRiskScore)
    .sort((a, b) =>
      Number(b.rawConfidenceBeforeCalibration || 0) - Number(a.rawConfidenceBeforeCalibration || 0) ||
      Number(b.committeeScore || 0) - Number(a.committeeScore || 0) ||
      Number(a.riskScore || 100) - Number(b.riskScore || 100))
    .slice(0, Math.max(0, Math.min(50, Number(limit) || 0)))
    .map((item) => ({
      symbol: String(item.symbol || "").toUpperCase(),
      observedDecision: item.decision,
      committeeScore: Number(item.committeeScore),
      rawConfidence: Number(item.rawConfidenceBeforeCalibration),
      calibratedConfidence: Number(item.confidence),
      riskScore: Number(item.riskScore),
      referencePrice: Number.isFinite(Number(item.currentPrice)) ? Number(item.currentPrice) : null,
      currency: item.currency || null,
      calibrationOnly: true,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    }));
}
