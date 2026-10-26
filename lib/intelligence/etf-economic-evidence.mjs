/**
 * ETF economic evidence for the Investment Committee, research-only.
 *
 * The terminal's valuation=50 is a neutral fallback, not a measured
 * issuer-based ETF valuation. Historical terminal strategies are not an
 * independent forward test, and neither this report nor a strategy gain can
 * change Committee scores, PAPER approvals or any broker authority.
 */
const validNumber = (value, minimum, maximum) =>
  typeof value === "number" && Number.isFinite(value)
  && value >= minimum && value <= maximum;

function validAsOf(value, nowMs) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)
      || parsed > nowMs || parsed < nowMs - 7 * 86400000) return null;
  return value;
}

function validStrategy(row) {
  return !!row && typeof row.id === "string"
    && validNumber(row.annualizedReturnPercent, -100, 1000)
    && validNumber(row.maxDrawdownPercent, -100, 0)
    && Number.isSafeInteger(row.observations) && row.observations >= 100
    && Number.isSafeInteger(row.trades) && row.trades >= 0
    && validNumber(row.transactionCostPercent, 0, 20)
    && validNumber(row.benchmarkAnnualizedReturnPercent, -100, 1000);
}
const n2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

function indicativeHistoricalComparison(asset, nowMs) {
  const asOf = validAsOf(asset?.technical?.observedAt, nowMs);
  const strategies = asset?.technical?.strategies;
  const base = Array.isArray(strategies)
    ? strategies.find(row => row?.id === "buy-hold") : null;
  if (!asOf || !validStrategy(base)) return null;
  const alternatives = strategies
    .filter(row => row?.id !== "buy-hold" && validStrategy(row)
      && row.observations === base.observations
      && row.transactionCostPercent === base.transactionCostPercent
      && row.benchmarkAnnualizedReturnPercent === base.benchmarkAnnualizedReturnPercent)
    .sort((a, b) => b.annualizedReturnPercent - a.annualizedReturnPercent
      || a.trades - b.trades);
  if (!alternatives.length) return null;
  const best = alternatives[0];
  return {
    state: "HISTORICAL_INDICATIVE_ONLY",
    asOf,
    observationCount: base.observations,
    referenceStrategy: "buy-hold",
    referenceAnnualizedReturnPercent: base.annualizedReturnPercent,
    bestAlternativeStrategy: best.id,
    bestAlternativeAnnualizedReturnPercent: best.annualizedReturnPercent,
    alternativeMinusBuyHoldAnnualizedPoints:
      n2(best.annualizedReturnPercent - base.annualizedReturnPercent),
    modeledTransactionCostPercent: base.transactionCostPercent,
    identicalActualDateWindowVerified: false,
    actualDirectaCostsIncluded: false,
    independentlyForwardValidated: false,
    observedMarketPriceIsNotExecutableQuote: true,
  };
}

export function assessEtfEconomicEvidence(asset, { nowMs = Date.now() } = {}) {
  if (String(asset?.assetClass || "").toUpperCase() !== "ETF") return null;
  if (!Number.isFinite(nowMs) || nowMs < 946684800000)
    throw new Error("INVALID_ETF_RESEARCH_CLOCK");

  // No verified issuer expense ratio, index look-through fundamentals,
  // tracking difference, or tax/FX/slippage evidence is supplied by the
  // terminal dataset. Never interpret its default score of 50 as "fair".
  const historicalComparison = indicativeHistoricalComparison(asset, nowMs);
  return {
    status: "ECONOMIC_VALUATION_NOT_ESTABLISHED",
    benchmarkIndex: null,
    issuerExpenseRatioPercent: null,
    trackingDifferenceAnnualPercent: null,
    instrumentLookthroughValuation: null,
    costsVerifiedAgainstIssuer: false,
    missingEvidence: [
      "ISSUER_EXPENSE_RATIO",
      "TRACKING_DIFFERENCE",
      "INDEX_OR_UNDERLYING_VALUATION",
      "FORWARD_NET_ALPHA_VS_BENCHMARK",
      "ACTUAL_BROKER_FEES_AND_FX",
    ],
    legacyCommitteeValuationScoreIsNeutralFallback: true,
    historicalComparison,
    // Explicitly advisory, even if a historical alternative won.
    changesCommitteeScore: false,
    unlocksResearchBuy: false,
    paperCertificationEligible: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
  };
}
