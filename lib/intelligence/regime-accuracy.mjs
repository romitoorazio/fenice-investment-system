const REGIMES = new Set(["VALUTARE", "ATTENDERE", "PROTEGGERE CAPITALE"]);
const BENCHMARKS = ["SPY", "QQQ", "IWM"];

const finite = (value) => Number.isFinite(Number(value));
const round = (value, digits = 2) => {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};
const normalize = (value) => String(value || "").trim().toUpperCase();

function median(values) {
  const sorted = values.filter(finite).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function normalizeFeniceRegime(value) {
  const regime = normalize(value);
  return REGIMES.has(regime) ? regime : null;
}

export function benchmarkPrices(snapshot) {
  const decisions = Array.isArray(snapshot?.allDecisions) ? snapshot.allDecisions : [];
  const prices = {};
  for (const symbol of BENCHMARKS) {
    const row = decisions.find((item) => normalize(item?.symbol) === symbol);
    if (finite(row?.currentPrice) && Number(row.currentPrice) > 0) prices[symbol] = Number(row.currentPrice);
  }
  return prices;
}

export function compositeForwardReturn(referencePrices, futurePrices, { minimumBenchmarks = 2 } = {}) {
  const returns = [];
  const components = [];
  for (const symbol of BENCHMARKS) {
    const start = Number(referencePrices?.[symbol]);
    const end = Number(futurePrices?.[symbol]);
    if (!finite(start) || !finite(end) || start <= 0 || end <= 0) continue;
    const returnPercent = ((end / start) - 1) * 100;
    returns.push(returnPercent);
    components.push({ symbol, startPrice: round(start), endPrice: round(end), returnPercent: round(returnPercent) });
  }
  if (returns.length < minimumBenchmarks) return null;
  return {
    benchmarkCount: returns.length,
    compositeReturnPercent: round(median(returns)),
    components,
  };
}

export function classifyRegimeOutcome(regime, compositeReturnPercent, neutralBandPercent = 1) {
  const r = Number(compositeReturnPercent);
  const normalized = normalizeFeniceRegime(regime);
  if (!normalized || !finite(r)) return null;
  const band = Math.max(0, Number(neutralBandPercent) || 0);

  if (normalized === "VALUTARE") {
    if (r > band) return { class: "CONFERMATO", utilityScore: 1, missedRallyPercent: 0, avoidedLossPercent: 0 };
    if (r < -band) return { class: "NON_CONFERMATO", utilityScore: 0, missedRallyPercent: 0, avoidedLossPercent: 0 };
    return { class: "NEUTRALE", utilityScore: 0.5, missedRallyPercent: 0, avoidedLossPercent: 0 };
  }

  if (normalized === "PROTEGGERE CAPITALE") {
    if (r < -band) return { class: "PROTEZIONE_CONFERMATA", utilityScore: 1, missedRallyPercent: 0, avoidedLossPercent: round(-r) };
    if (r > band) return { class: "ECCESSO_PRUDENZA", utilityScore: 0, missedRallyPercent: round(r), avoidedLossPercent: 0 };
    return { class: "PRUDENZA_NEUTRALE", utilityScore: 0.5, missedRallyPercent: 0, avoidedLossPercent: 0 };
  }

  if (r < -band) return { class: "PRUDENZA_UTILE", utilityScore: 1, missedRallyPercent: 0, avoidedLossPercent: round(-r) };
  if (r > band) return { class: "RIALZO_PERSO", utilityScore: 0, missedRallyPercent: round(r), avoidedLossPercent: 0 };
  return { class: "ATTESA_COERENTE", utilityScore: 1, missedRallyPercent: 0, avoidedLossPercent: 0 };
}

export function latestWeekdaySnapshots(snapshots) {
  const latestByDate = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const generatedAt = String(snapshot?.generatedAt || "");
    const timestamp = Date.parse(generatedAt);
    const regime = normalizeFeniceRegime(snapshot?.marketRegime);
    if (!Number.isFinite(timestamp) || !regime) continue;
    const weekday = new Date(timestamp).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const prices = benchmarkPrices(snapshot);
    if (Object.keys(prices).length < 2) continue;
    const date = generatedAt.slice(0, 10);
    const existing = latestByDate.get(date);
    if (!existing || timestamp > existing.timestamp) latestByDate.set(date, { snapshot, timestamp, date, regime, prices });
  }
  return [...latestByDate.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function buildRegimeAccuracyLedger(snapshots, {
  horizons = { "1session": 1, "5sessions": 5, "20sessions": 20, "60sessions": 60 },
} = {}) {
  const daily = latestWeekdaySnapshots(snapshots);
  const records = daily.map((row, index) => {
    const checkpoints = {};
    for (const [label, offset] of Object.entries(horizons)) {
      const future = daily[index + Number(offset)];
      if (!future) continue;
      const result = compositeForwardReturn(row.prices, future.prices);
      if (!result) continue;
      checkpoints[label] = {
        measuredAt: future.snapshot.generatedAt,
        marketDate: future.date,
        ...result,
        outcome: classifyRegimeOutcome(row.regime, result.compositeReturnPercent),
      };
    }
    return {
      id: row.date + ":" + row.regime.replaceAll(" ", "_"),
      observationDate: row.date,
      createdAt: row.snapshot.generatedAt,
      regime: row.regime,
      referenceBenchmarks: row.prices,
      checkpoints,
      researchOnly: true,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    purpose: "V7 research-only regime accuracy ledger using SPY/QQQ/IWM median forward return.",
    methodology: {
      regimes: [...REGIMES],
      benchmarkBasket: BENCHMARKS,
      composite: "median forward return of at least two available benchmark ETFs",
      neutralBandPercent: 1,
      observationFrequency: "latest valid committee snapshot per UTC weekday",
      horizons,
      feedsV6CalibrationPolicy: false,
    },
    isolation: {
      modifiesV6DecisionLedger: false,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    },
    recordCount: records.length,
    records,
  };
}

export function summarizeRegimeAccuracy(records, checkpoint) {
  const rows = (Array.isArray(records) ? records : [])
    .filter((record) => finite(record?.checkpoints?.[checkpoint]?.compositeReturnPercent));

  const byRegime = {};
  for (const regime of ["VALUTARE", "ATTENDERE", "PROTEGGERE CAPITALE"]) {
    const selected = rows.filter((record) => record.regime === regime);
    const outcomes = selected.map((record) => record.checkpoints[checkpoint].outcome).filter(Boolean);
    const returns = selected.map((record) => Number(record.checkpoints[checkpoint].compositeReturnPercent));
    const utility = outcomes.map((outcome) => Number(outcome.utilityScore)).filter(finite);
    byRegime[regime] = {
      sampleSize: selected.length,
      averageCompositeReturnPercent: returns.length ? round(returns.reduce((a, b) => a + b, 0) / returns.length) : null,
      utilityRatePercent: utility.length ? round(utility.reduce((a, b) => a + b, 0) / utility.length * 100) : null,
      missedRallyPercent: round(outcomes.reduce((sum, outcome) => sum + Number(outcome.missedRallyPercent || 0), 0)),
      avoidedLossPercent: round(outcomes.reduce((sum, outcome) => sum + Number(outcome.avoidedLossPercent || 0), 0)),
      classes: outcomes.reduce((acc, outcome) => {
        acc[outcome.class] = (acc[outcome.class] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  const allOutcomes = rows.map((record) => record.checkpoints[checkpoint].outcome).filter(Boolean);
  const allUtility = allOutcomes.map((outcome) => Number(outcome.utilityScore)).filter(finite);
  return {
    checkpoint,
    sampleSize: rows.length,
    overallUtilityRatePercent: allUtility.length ? round(allUtility.reduce((a, b) => a + b, 0) / allUtility.length * 100) : null,
    missedRallyPercent: round(allOutcomes.reduce((sum, outcome) => sum + Number(outcome.missedRallyPercent || 0), 0)),
    avoidedLossPercent: round(allOutcomes.reduce((sum, outcome) => sum + Number(outcome.avoidedLossPercent || 0), 0)),
    byRegime,
  };
}
