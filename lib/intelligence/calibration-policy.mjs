const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

function normaliseMultiplier(value, fallback = 0.9) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, 0.5, 1);
}

export function selectCalibrationPolicy(report, { preferredHorizons = ["30d", "7d"], minimumSamples = 30 } = {}) {
  const horizons = report?.horizons && typeof report.horizons === "object" ? report.horizons : {};
  const matureStates = new Set(["CALIBRATED", "WATCH", "POOR"]);

  for (const horizon of preferredHorizons) {
    const result = horizons?.[horizon];
    const sampleSize = Number(result?.sampleSize || 0);
    if (!result || sampleSize < minimumSamples || !matureStates.has(String(result.state || "").toUpperCase())) continue;
    return {
      horizon,
      state: String(result.state).toUpperCase(),
      sampleSize,
      multiplier: normaliseMultiplier(result.confidenceMultiplier, 0.9),
      evidenceMature: true,
      reasons: Array.isArray(result.reasons) ? result.reasons : [],
    };
  }

  const fallbackCandidates = preferredHorizons
    .map((horizon) => ({ horizon, result: horizons?.[horizon] }))
    .filter(({ result }) => result && Number.isFinite(Number(result.confidenceMultiplier)));
  const fallbackMultiplier = fallbackCandidates.length
    ? Math.min(...fallbackCandidates.map(({ result }) => normaliseMultiplier(result.confidenceMultiplier, 0.9)))
    : 0.9;
  const bestSample = fallbackCandidates
    .sort((a, b) => Number(b.result?.sampleSize || 0) - Number(a.result?.sampleSize || 0))[0];

  return {
    horizon: bestSample?.horizon || null,
    state: "INSUFFICIENT",
    sampleSize: Number(bestSample?.result?.sampleSize || 0),
    multiplier: Math.min(0.9, fallbackMultiplier),
    evidenceMature: false,
    reasons: ["calibration evidence is not yet mature; confidence reduced conservatively"],
  };
}

export function applyCalibrationToConfidence(rawConfidence, policy) {
  const raw = Number(rawConfidence);
  if (!Number.isFinite(raw)) return 0;
  const boundedRaw = clamp(raw, 0, 100);
  const multiplier = normaliseMultiplier(policy?.multiplier, 0.9);
  return Math.round(Math.min(boundedRaw, boundedRaw * multiplier));
}
