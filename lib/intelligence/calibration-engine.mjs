const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));

export function buildCalibrationSamplesFromLedger(records, { checkpoint = "7d", decision = "COMPRA" } = {}) {
  const samples = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (decision && String(record?.decision || "").toUpperCase() !== String(decision).toUpperCase()) continue;
    const confidenceRaw = Number(record?.confidence);
    const returnPercent = Number(record?.checkpoints?.[checkpoint]?.returnPercent);
    if (!Number.isFinite(confidenceRaw) || !Number.isFinite(returnPercent)) continue;
    samples.push({
      confidence: clamp(confidenceRaw / 100),
      outcome: returnPercent > 0 ? 1 : 0,
    });
  }
  return samples;
}

export function evaluateCalibration(samples, { bins = 10, minSamples = 30 } = {}) {
  const valid = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({ confidence: clamp(sample?.confidence), outcome: Number(sample?.outcome) >= 0.5 ? 1 : 0 }))
    .filter((sample) => Number.isFinite(sample.confidence) && Number.isFinite(sample.outcome));

  if (valid.length === 0) {
    return {
      state: "INSUFFICIENT",
      sampleSize: 0,
      brierScore: null,
      expectedCalibrationError: null,
      averageConfidence: null,
      observedHitRate: null,
      optimismBias: null,
      confidenceMultiplier: 0.9,
      bins: [],
      reasons: ["no calibration samples available"],
    };
  }

  const bucketCount = Math.max(2, Math.min(20, Number(bins) || 10));
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    lower: index / bucketCount,
    upper: (index + 1) / bucketCount,
    count: 0,
    confidenceSum: 0,
    outcomeSum: 0,
  }));

  let brierSum = 0;
  let confidenceSum = 0;
  let outcomeSum = 0;
  for (const sample of valid) {
    const index = Math.min(bucketCount - 1, Math.floor(sample.confidence * bucketCount));
    const bucket = buckets[index];
    bucket.count += 1;
    bucket.confidenceSum += sample.confidence;
    bucket.outcomeSum += sample.outcome;
    brierSum += (sample.confidence - sample.outcome) ** 2;
    confidenceSum += sample.confidence;
    outcomeSum += sample.outcome;
  }

  let ece = 0;
  const renderedBins = [];
  for (const bucket of buckets) {
    if (!bucket.count) continue;
    const averageConfidence = bucket.confidenceSum / bucket.count;
    const observedHitRate = bucket.outcomeSum / bucket.count;
    ece += Math.abs(averageConfidence - observedHitRate) * bucket.count / valid.length;
    renderedBins.push({
      lower: Number(bucket.lower.toFixed(2)),
      upper: Number(bucket.upper.toFixed(2)),
      count: bucket.count,
      averageConfidence: Number(averageConfidence.toFixed(4)),
      observedHitRate: Number(observedHitRate.toFixed(4)),
      gap: Number((averageConfidence - observedHitRate).toFixed(4)),
    });
  }

  const brierScore = brierSum / valid.length;
  const averageConfidence = confidenceSum / valid.length;
  const observedHitRate = outcomeSum / valid.length;
  const optimismBias = averageConfidence - observedHitRate;
  const reasons = [];

  if (valid.length < minSamples) {
    reasons.push(`calibration requires at least ${minSamples} samples; only ${valid.length} available`);
    return {
      state: "INSUFFICIENT",
      sampleSize: valid.length,
      brierScore: Number(brierScore.toFixed(4)),
      expectedCalibrationError: Number(ece.toFixed(4)),
      averageConfidence: Number(averageConfidence.toFixed(4)),
      observedHitRate: Number(observedHitRate.toFixed(4)),
      optimismBias: Number(optimismBias.toFixed(4)),
      confidenceMultiplier: 0.9,
      bins: renderedBins,
      reasons,
    };
  }

  let state = "CALIBRATED";
  let confidenceMultiplier = 1;
  if (ece > 0.12 || brierScore > 0.25 || optimismBias > 0.15) {
    state = "POOR";
    confidenceMultiplier = 0.8;
    reasons.push("forecast calibration materially deviates from realised outcomes");
  } else if (ece > 0.08 || brierScore > 0.20 || optimismBias > 0.1) {
    state = "WATCH";
    confidenceMultiplier = 0.9;
    reasons.push("forecast calibration requires caution");
  }

  return {
    state,
    sampleSize: valid.length,
    brierScore: Number(brierScore.toFixed(4)),
    expectedCalibrationError: Number(ece.toFixed(4)),
    averageConfidence: Number(averageConfidence.toFixed(4)),
    observedHitRate: Number(observedHitRate.toFixed(4)),
    optimismBias: Number(optimismBias.toFixed(4)),
    confidenceMultiplier,
    bins: renderedBins,
    reasons,
  };
}
