import {buildShadowOutcomeSamples} from "./shadow-calibration.mjs";
import {eligibleDecisionCheckpoint} from "./decision-ledger-price-evidence.mjs";

// The ledger rounds checkpoint price and return independently to two decimals.
function consistentOutcome(record, mark) {
  const reported = mark?.returnPercent;
  if (!Number.isFinite(reported) || reported === 0) return false;
  const entry = record.entryReferencePrice;
  const implied = ((mark.price - entry) / entry) * 100;
  const tolerance = 0.005 * 100 / entry + 0.005 + 1e-8;
  if (!Number.isFinite(implied) || !Number.isFinite(tolerance) || Math.abs(reported - implied) > tolerance) return false;
  // The rounded price must independently establish the binary label.
  // Exclude ambiguous near-flat outcomes rather than manufacturing wins/losses.
  const epsilon = Number.EPSILON * Math.max(entry, mark.price) * 4;
  return reported > 0 ? mark.price - 0.005 > entry + epsilon
    : mark.price + 0.005 < entry - epsilon;
}

export function buildCalibrationSamplesFromLedger(records, {checkpoint="7d", decision="COMPRA", asOfMs=Date.now()}={}) {
  if (!Number.isSafeInteger(asOfMs) || !/^([1-9]\d*)d$/.test(checkpoint)) return [];
  const days = Number(checkpoint.slice(0,-1));
  const eligible = (Array.isArray(records)?records:[]).filter(record=>{
    if (decision && String(record?.decision??"").toUpperCase() !== decision.toUpperCase()) return false;
    const mark = record?.checkpoints?.[checkpoint];
    const measured = Date.parse(mark?.measuredAt);
    return Number.isFinite(measured) && measured <= asOfMs &&
      mark.priceEvidenceKind === "DAILY_SESSION_BUCKET_RESEARCH_ONLY" &&
      eligibleDecisionCheckpoint(record,{price:mark.price,observedAt:mark.priceObservedAt,currency:record.currency},days,measured) &&
      consistentOutcome(record,mark);
  });
  return buildShadowOutcomeSamples(eligible,checkpoint);
}

export function evaluateCalibration(samples, { bins = 10, minSamples = 30 } = {}) {
  const valid = [];
  for (const sample of Array.isArray(samples) ? samples : []) {
    const confidence = sample?.confidence;
    const outcome = sample?.outcome;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || (outcome !== 0 && outcome !== 1)) continue;
    valid.push({ confidence, outcome });
  }

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
