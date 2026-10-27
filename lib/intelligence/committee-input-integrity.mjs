/**
 * Investment Committee research input contract. The decision clock is explicit:
 * future-dated observations must never receive 'fresh' scoring and zero/missing
 * prices must never create an entry plan. This is separate from PAPER V6 prices.
 */
const MIN_TIME = Date.UTC(2000, 0, 1);
export function scoreResearchFreshness(value, asOfMs) {
  if (!Number.isFinite(asOfMs) || asOfMs < MIN_TIME) throw new Error("INVALID_COMMITTEE_CLOCK");
  if (value === null || value === undefined || value === "") return 35;
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return 30;
  const observedMs = Date.parse(value);
  if (!Number.isFinite(observedMs) || new Date(observedMs).toISOString().slice(0, 19) !== value.slice(0, 19)
    || observedMs < MIN_TIME) return 30;
  if (observedMs > asOfMs) return 0; // Do not reward impossible future information.
  const hours = (asOfMs - observedMs) / 3_600_000;
  return hours <= 24 ? 100 : hours <= 72 ? 85 : hours <= 168 ? 65 : 35;
}
export function positiveResearchReferencePrice(value) {
  if ((typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && value.trim() === "")) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Freeze a historical Strategy Lab observation beside a committee decision.
 * This is NOT a forward strategy signal, return forecast or execution gate.
 */
export function researchStrategySnapshot(book, symbol, asOfMs) {
  const canonicalTime = value => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
  };
  if (!Number.isSafeInteger(asOfMs) || asOfMs < MIN_TIME) return null;
  const generated = canonicalTime(book?.generatedAt);
  if (generated === null || generated > asOfMs || asOfMs - generated > 14 * 86_400_000
    || book?.mode !== "live" || !Array.isArray(book?.assets)) return null;
  const matching = book.assets.filter(asset => asset?.symbol === symbol);
  if (matching.length !== 1) return null;
  const asset = matching[0];
  const observed = canonicalTime(asset?.observedAt);
  if (observed === null || observed > generated || asset?.status !== "operativo"
    || asset?.conclusion !== "ROBUSTA" || !Array.isArray(asset?.families)) return null;
  const families = asset.families.filter(f => f?.id === asset.bestFamily && f?.verdict === "ROBUSTA");
  if (families.length !== 1) return null;
  const family = families[0];
  const variants = Array.isArray(family.variants)
    ? family.variants.filter(v => v?.id === family.selectedVariantId) : [];
  if (variants.length !== 1) return null;
  const metric = n => typeof n === "number" && Number.isFinite(n);
  if (!metric(family.robustnessScore) || family.robustnessScore < 0 || family.robustnessScore > 100
    || !metric(family.medianOutOfSampleExcessPercent)
    || !metric(family.medianOutOfSampleDrawdownImprovementPercent)
    || !variants[0].parameters || typeof variants[0].parameters !== "object"
    || Array.isArray(variants[0].parameters)) return null;
  const params = Object.entries(variants[0].parameters);
  if (!params.length || params.length > 12 || params.some(([key, v]) =>
    !/^[a-z][a-zA-Z0-9]{0,40}$/.test(key) || !metric(v))) return null;
  return {
    kind: "HISTORICAL_OOS_RESEARCH_ONLY",
    strategyAsOf: book.generatedAt,
    priceHistoryAsOf: asset.observedAt,
    family: family.id,
    selectedVariant: family.selectedVariantId,
    parameters: Object.fromEntries(params),
    historicalRobustnessScore: family.robustnessScore,
    historicalMedianOosExcessAnnualizedPercent: family.medianOutOfSampleExcessPercent,
    historicalMedianOosDrawdownImprovementPoints: family.medianOutOfSampleDrawdownImprovementPercent,
    dataIsForward: false,
    affectsCommitteeScore: false,
    executionAuthorized: false,
    profitableStrategyVerified: false,
  };
}

/**
 * Explain why a candidate does not satisfy the Committee's existing COMPRA
 * research thresholds. This is a diagnostic, not a trade or PAPER gate.
 * Keep these limits aligned with decisionFor in run-investment-committee.mjs.
 */
export function diagnoseResearchBuyRequirements({
  referencePrice, score, confidence, risk, valuation, terminalDecision, dcf,
}) {
  const gaps = [];
  if (positiveResearchReferencePrice(referencePrice) === null)
    gaps.push({ code: 'REFERENCE_PRICE_MISSING', actual: null, required: 'positive price' });
  if (!Number.isFinite(score) || score < 78)
    gaps.push({ code: 'COMMITTEE_SCORE_BELOW_78', actual: Number.isFinite(score) ? score : null, requiredMin: 78 });
  if (!Number.isFinite(confidence) || confidence < 72)
    gaps.push({ code: 'CONFIDENCE_BELOW_72', actual: Number.isFinite(confidence) ? confidence : null, requiredMin: 72 });
  if (!Number.isFinite(risk) || risk > 58)
    gaps.push({ code: 'RISK_ABOVE_58', actual: Number.isFinite(risk) ? risk : null, requiredMax: 58 });
  if (!Number.isFinite(valuation) || valuation < 55)
    gaps.push({ code: 'VALUATION_BELOW_55', actual: Number.isFinite(valuation) ? valuation : null, requiredMin: 55 });
  if (terminalDecision !== 'ACCUMULA')
    gaps.push({ code: 'TERMINAL_NOT_ACCUMULA', actual: terminalDecision ?? null, required: 'ACCUMULA' });
  if (dcf?.status === 'disponibile' && Number(dcf.upsideBasePercent) < -25)
    gaps.push({ code: 'DCF_DEEP_OVERVALUATION', actual: Number(dcf.upsideBasePercent), requiredMinExclusive: -25 });
  return {
    scope: 'RESEARCH_RULES_ONLY',
    status: gaps.length ? 'NOT_QUALIFIED' : 'RESEARCH_RULES_MET',
    gaps,
    // Never infer PAPER or broker readiness from a Committee decision or daily candle.
    paperExecutionEligible: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
  };
}
