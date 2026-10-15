import { assessBuyOnlyForwardEdge } from "./buy-only-forward-edge.mjs";

// Research-only, price-return comparison of as-of committee observations.
// This evaluator never authorizes trades or asserts realized P&L.
const HORIZONS = Object.freeze({ "1d": 1, "7d": 7, "30d": 30, "90d": 90 });
const DAY_MS = 86_400_000;
const MAX_CHECKPOINT_DELAY_DAYS = 4;
const MAX_SOURCE_DISAGREEMENT_PERCENT = 0.02;
const ROUND_TRIP_COST_PERCENT = 0.30; // Scenario, NOT actual broker fees, taxes, spread or FX.
const DECISIONS = new Set(["COMPRA", "OSSERVA", "ATTENDI", "EVITA"]);

function positive(value) {
  return value !== null && value !== undefined && (typeof value === "number" || typeof value === "string")
    && String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
}
function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 19) === value.slice(0, 19) ? n : null;
}
const round = (number) => Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
const average = (items) => items.length ? round(items.reduce((acc, n) => acc + n, 0) / items.length) : null;

function checkedObservation(record, horizon, days, nowMs) {
  const createdMs = timestamp(record?.createdAt);
  const cp = record?.checkpoints?.[horizon];
  const measuredMs = timestamp(cp?.measuredAt);
  if (createdMs === null || measuredMs === null || createdMs > nowMs || measuredMs > nowMs) return null;
  if (measuredMs - createdMs < days * DAY_MS || measuredMs - createdMs > (days + MAX_CHECKPOINT_DELAY_DAYS) * DAY_MS) return null;
  if (record.observationDate && record.observationDate !== new Date(createdMs).toISOString().slice(0, 10)) return null;
  if (String(record.currency || "").toUpperCase() !== "USD") return null;
  if (!positive(record.referencePrice) || !positive(cp?.price) || !Number.isFinite(cp?.returnPercent)) return null;
  if (!["current-committee", "committee-history"].includes(cp?.source)) return null;
  const returnPercent = (Number(cp.price) / Number(record.referencePrice) - 1) * 100;
  if (!Number.isFinite(returnPercent) || Math.abs(returnPercent - cp.returnPercent) > MAX_SOURCE_DISAGREEMENT_PERCENT) return null;
  const ticker = typeof record.symbol === "string" ? record.symbol.trim().toUpperCase() : "";
  const decision = String(record.decision || "").toUpperCase();
  if (!/^[A-Z0-9._-]{1,25}$/.test(ticker) || !DECISIONS.has(decision)) return null;
  return {
    ticker, decision, observedAt: createdMs, measuredAt: measuredMs,
    observationDate: new Date(createdMs).toISOString().slice(0, 10),
    checkpointDate: new Date(measuredMs).toISOString().slice(0, 10),
    grossReturnPercent: returnPercent,
    backfill: record.historicalBackfill === true,
    origin: record.historicalBackfill === true ? "HISTORICAL_BACKFILL"
      : record.historicalBackfill === false ? "FORWARD_RECORDED" : "UNKNOWN_ORIGIN",
  };
}

function emptyHorizon(horizon) {
  return {
    horizon, pairedSamples: 0, uniqueDays: 0,
    historicalBackfillSamples: 0, forwardObservedSamples: 0,
    buySignalSamples: 0, waitOrAvoidSamples: 0,
    hypotheticalMeanReturnAfterCostPercent: null,
    benchmarkMeanGrossReturnPercent: null,
    hypotheticalMeanExcessVsBenchmarkPercent: null,
    hypotheticalPositiveNetRatePercent: null,
    hypotheticalBeatBenchmarkRatePercent: null,
    verifiedNetProfit: false, verifiedLiveReturnPercent: null,
  };
}

export function evaluateDecisionBenchmarkEdge(records, { now = new Date(), costPercent = ROUND_TRIP_COST_PERCENT } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(nowMs)) throw new Error("Invalid valuation date");
  if (!Number.isFinite(costPercent) || costPercent < 0 || costPercent > 10) throw new Error("Invalid cost scenario");
  const all = Array.isArray(records) ? records : [];
  const horizons = {};
  for (const [horizon, days] of Object.entries(HORIZONS)) {
    const observations = all.map(row => checkedObservation(row, horizon, days, nowMs)).filter(Boolean)
      .sort((a, b) => a.observedAt - b.observedAt || a.ticker.localeCompare(b.ticker) || a.decision.localeCompare(b.decision));
    const benchmarkByCycle = new Map();
    // A reconstructed SPY backfill must NEVER serve as the control for a
    // prospectively recorded stock. Both records must share the exact
    // committee as-of instant and explicitly verified observation origin.
    // Matching only the UTC day can inject an earlier SPY price (or a
    // hindsight reconstruction) into a later intraday decision's return.
    const knownOrigin = item => item.origin === "FORWARD_RECORDED"
      || item.origin === "HISTORICAL_BACKFILL";
    const cycleKey = item => item.observedAt + ":" + item.origin;
    for (const item of observations) {
      if (item.ticker === "SPY" && knownOrigin(item)
        && !benchmarkByCycle.has(cycleKey(item))) {
        benchmarkByCycle.set(cycleKey(item), item);
      }
    }
    const compared = [], seen = new Set();
    for (const item of observations) {
      if (item.ticker === "SPY" || !knownOrigin(item)) continue;
      const key = item.observationDate + ":" + item.ticker;
      if (seen.has(key)) continue; // Never cherry-pick a later same-day cycle when the first had no aligned SPY.
      seen.add(key);
      const spy = benchmarkByCycle.get(cycleKey(item));
      if (!spy) continue; // No identical-cycle, same-origin SPY: no alpha estimate.
      if (item.checkpointDate !== spy.checkpointDate) continue; // Strictly same exit day.
      if (Math.abs(item.measuredAt - spy.measuredAt) > DAY_MS) continue;
      const hypotheticalNetPercent = item.grossReturnPercent - costPercent;
      compared.push({
        ...item, benchmarkGrossReturnPercent: spy.grossReturnPercent,
        hypotheticalNetPercent, excessPercent: hypotheticalNetPercent - spy.grossReturnPercent,
      });
    }
    const result = emptyHorizon(horizon);
    result.pairedSamples = compared.length;
    result.uniqueDays = new Set(compared.map(x => x.observationDate)).size;
    result.historicalBackfillSamples = compared.filter(x => x.origin === "HISTORICAL_BACKFILL").length;
    result.forwardObservedSamples = compared.filter(x => x.origin === "FORWARD_RECORDED").length;
    result.buySignalSamples = compared.filter(x => x.decision === "COMPRA").length;
    result.waitOrAvoidSamples = compared.filter(x => x.decision !== "COMPRA").length;
    result.hypotheticalMeanReturnAfterCostPercent = average(compared.map(x => x.hypotheticalNetPercent));
    result.benchmarkMeanGrossReturnPercent = average(compared.map(x => x.benchmarkGrossReturnPercent));
    result.hypotheticalMeanExcessVsBenchmarkPercent = average(compared.map(x => x.excessPercent));
    result.hypotheticalPositiveNetRatePercent = compared.length ? round(100 * compared.filter(x => x.hypotheticalNetPercent > 0).length / compared.length) : null;
    result.hypotheticalBeatBenchmarkRatePercent = compared.length ? round(100 * compared.filter(x => x.excessPercent > 0).length / compared.length) : null;
    // Do not present positive post-hoc returns on ATTENDI/EVITA as BUY alpha.
    // Exclude records whose forward-vs-backfill provenance flag is absent.
    result.buyOnlyEvidence = assessBuyOnlyForwardEdge(compared);
    horizons[horizon] = result;
  }
  return {
    version: 2,
    label: "Research-only benchmark edge / hypothetical USD price returns; BUY-only evidence separated",
    benchmark: "SPY",
    currency: "USD",
    assumedRoundTripCostPercent: costPercent,
    costAssumption: "Illustrative single round-trip cost; not actual Directa commission, spread, slippage, FX, taxes or dividends.",
    methodology: "Identical committee as-of instant and provenance origin as the SPY benchmark, same UTC checkpoint exit day; recompute both returns from positive prices; deduplicate one observation per ticker/day; historical bootstrap and prospective observations never cross-paired.",
    selectionBiasWarning: "Historical committee snapshots and repeated correlated market days are NOT out-of-sample validation. ATTENDI/EVITA counterfactuals are NOT BUY alpha; buy-only forward cohorts require both >=30 pairs and >=30 independent entry days before numeric review. Hypothetical trades are not executed and cannot establish portfolio profitability.",
    scope: "Excludes SPY itself, non-USD assets, missing/stale/badly timed quotes, unknown origin, mismatched entry instants/benchmark origins, mismatched end dates and unverified checkpoints. SPY benchmark is gross; candidate nets illustrative costs.",
    isolation: {
      researchOnly: true,
      feedsV6CalibrationPolicy: false,
      modifiesPaperEvidence: false,
      changesCommitteeDecisions: false,
      executionEligible: false,
      paperCertificationEligible: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
    },
    hasVerifiedProfit: false,
    horizons,
  };
}
