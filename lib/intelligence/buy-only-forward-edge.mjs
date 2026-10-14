/**
 * V7 buy-only diagnostic: a 30-day opportunity sample containing ATTENDI or
 * EVITA is not evidence that a BUY strategy makes money.
 * Hypothetical USD price returns only: never PAPER, LIVE, EUR NAV or profit.
 */
const round = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
const mean = values => values.length ? values.reduce((a,b) => a+b,0) / values.length : null;
const MIN_FORWARD_BUY_PAIRS = 30;
const MIN_INDEPENDENT_ENTRY_DAYS = 30;

function cohort(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (r?.decision !== "COMPRA" || typeof r.observationDate !== "string"
      || !/^\d{4}-\d\d-\d\d$/.test(r.observationDate)
      || !Number.isFinite(r.hypotheticalNetPercent) || !Number.isFinite(r.excessPercent)) continue;
    const bucket = byDay.get(r.observationDate) ?? [];
    bucket.push(r);
    byDay.set(r.observationDate, bucket);
  }
  const valid = [...byDay.values()].flat();
  const dayMeans = [...byDay.values()].map(group => mean(group.map(x => x.excessPercent)));
  return {
    sampleSize: valid.length,
    independentEntryDays: byDay.size,
    hypotheticalMeanReturnAfterCostPercent: round(mean(valid.map(x => x.hypotheticalNetPercent))),
    hypotheticalMeanExcessVsBenchmarkPercent: round(mean(valid.map(x => x.excessPercent))),
    equalEntryDayMeanExcessPercent: round(mean(dayMeans)),
    benchmarkBeatRatePercent: valid.length
      ? round(valid.filter(x => x.excessPercent > 0).length * 100 / valid.length) : null,
    worstObservedHypotheticalNetPercent: valid.length
      ? round(Math.min(...valid.map(x => x.hypotheticalNetPercent))) : null,
    // NOT a true strategy drawdown: the data are individual ticker windows.
    strategyDrawdownPercent: null,
    verifiedProfit: false,
  };
}

export function assessBuyOnlyForwardEdge(compared) {
  const rows = Array.isArray(compared) ? compared : [];
  const forward = cohort(rows.filter(x => x.origin === "FORWARD_RECORDED"));
  const retrospective = cohort(rows.filter(x => x.origin === "HISTORICAL_BACKFILL"));
  const excludedUnknownOriginBuySamples = rows.filter(x => x.decision === "COMPRA"
    && !["FORWARD_RECORDED", "HISTORICAL_BACKFILL"].includes(x.origin)).length;
  const sampleMature = forward.sampleSize >= MIN_FORWARD_BUY_PAIRS
    && forward.independentEntryDays >= MIN_INDEPENDENT_ENTRY_DAYS;
  const benchmarkOutperformedNumerically = sampleMature
    && forward.equalEntryDayMeanExcessPercent > 0
    && forward.benchmarkBeatRatePercent > 50;
  return {
    state: forward.sampleSize === 0 ? "NO_FORWARD_BUY_SAMPLES"
      : !sampleMature ? "FORWARD_BUY_EVIDENCE_INSUFFICIENT"
      : benchmarkOutperformedNumerically ? "NUMERIC_RESEARCH_REVIEW_REQUIRED"
      : "FORWARD_BUY_NOT_OUTPERFORMING",
    forward,
    retrospective,
    excludedUnknownOriginBuySamples,
    thresholds: {
      minimumForwardPairedBuys: MIN_FORWARD_BUY_PAIRS,
      minimumIndependentForwardEntryDays: MIN_INDEPENDENT_ENTRY_DAYS,
      benchmarkBeatRateMustExceedPercent: 50,
      equalDayMeanExcessMustBePositive: true,
    },
    sampleMature,
    benchmarkOutperformedNumerically,
    researchOnly: true,
    costModel: "Illustrative USD round-trip cost, excludes broker actual fees, FX, tax, corporate actions and dividends",
    actualTradingProfitDemonstrated: false,
    canAuthorizePaper: false,
    canAuthorizeLive: false,
  };
}
