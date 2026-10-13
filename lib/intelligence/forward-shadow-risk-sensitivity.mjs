// FENICE100K research-only stress grid. Descriptive arithmetic, not VaR or a forecast.
// Input pairs come exclusively from time-aligned, validated forward SHADOW/SPY checkpoints.
const round = x => Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
const mean = xs => xs.length ? xs.reduce((s,x)=>s+x,0)/xs.length : null;
const COST_SCENARIOS = Object.freeze([0.10, 0.30, 0.50, 1.00]);
const PRICE_SHOCK_SCENARIOS = Object.freeze([5, 10, 20]);
const isFiniteNumber = x => typeof x === "number" && Number.isFinite(x);

function validPair(pair) {
  return pair && isFiniteNumber(pair.grossFullCapitalPercent) &&
    isFiniteNumber(pair.investedFraction) && pair.investedFraction > 0 &&
    pair.investedFraction <= 1 &&
    isFiniteNumber(pair.benchmarkGrossPercent) &&
    isFiniteNumber(pair.priceShockCoefficient) && pair.priceShockCoefficient > 0 &&
    typeof pair.entryDate === "string" && typeof pair.exitDate === "string";
}

/**
 * All returns are *percentage points of the total three-tranche research budget*.
 * The individual-stock shock acts on its latest marked price while SPY is held
 * unchanged solely to isolate one sensitivity; no correlation is forecast.
 */
export function summarizeForwardShadowSensitivity(pairs, { baseCostPercent = 0.30 } = {}) {
  if (!isFiniteNumber(baseCostPercent) || baseCostPercent < 0 || baseCostPercent > 10) {
    throw new Error("Invalid hypothetical cost for research sensitivity");
  }
  const cohort = Array.isArray(pairs) ? pairs : [];
  if (cohort.some(pair => !validPair(pair))) throw new Error("Invalid source pair for research sensitivity");
  const count = cohort.length;
  const independentEntryDays = new Set(cohort.map(p => p.entryDate)).size;
  const average = fn => count ? round(mean(cohort.map(fn))) : null;
  const percent = fn => count ? round(100 * cohort.filter(fn).length / count) : null;
  const min = fn => count ? round(Math.min(...cohort.map(fn))) : null;
  const net = (p,cost,shock=0) => p.grossFullCapitalPercent -
    shock * p.priceShockCoefficient - cost * p.investedFraction;
  return {
    state: count ? "SCENARIOS_ONLY_NOT_PREDICTIONS" : "NOT_AVAILABLE",
    pairedSamples: count,
    independentEntryDays,
    baseCaseRoundTripCostPercent: baseCostPercent,
    costScenarios: COST_SCENARIOS.map(cost => ({
      hypotheticalRoundTripCostPercent: cost,
      averageNetFullCapitalPercent: average(p => net(p,cost)),
      averageExcessVsSpyGrossPercent: average(p => net(p,cost) - p.benchmarkGrossPercent),
      underperformSpyRatePercent: percent(p => net(p,cost) < p.benchmarkGrossPercent),
      negativeVsCashRatePercent: percent(p => net(p,cost) < 0),
    })),
    isolatedAssetPriceShocks: PRICE_SHOCK_SCENARIOS.map(shock => ({
      additionalAssetPriceDropPercent: shock,
      averageStressedNetFullCapitalPercent: average(p => net(p,baseCostPercent,shock)),
      worstStressedNetFullCapitalPercent: min(p => net(p,baseCostPercent,shock)),
      averageStressedExcessVsSpyGrossPercent: average(p => net(p,baseCostPercent,shock) - p.benchmarkGrossPercent),
      negativeVsCashRatePercent: percent(p => net(p,baseCostPercent,shock) < 0),
    })),
    caution: "Illustrative idiosyncratic stock-price shocks applied AFTER the observed mark; SPY is frozen solely as a comparison control. Not an observed drawdown, forecast, VaR, confidence interval, position-sizing advice, broker quote or executed profit.",
    orderSubmissionAllowed: false,
    paperPromotionAllowed: false,
    liveTradingAllowed: false,
  };
}
