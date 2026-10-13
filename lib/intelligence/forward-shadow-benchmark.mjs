// FENICE100K: isolated research scorecard. Never alters SHADOW/PAPER decisions or submits orders.
import { summarizeForwardShadowSensitivity } from "./forward-shadow-risk-sensitivity.mjs";
const DAY = 86_400_000;
const WINDOWS = Object.freeze({ "7d": { days: 7, grace: 4 }, "30d": { days: 30, grace: 5 } });
const COST_PERCENT = 0.30; // Illustrative round trip, NOT actual Directa costs.
const MAX_ENTRY_QUOTE_AGE = 30 * 60_000;
const MAX_MARK_QUOTE_AGE = 6 * 3_600_000;
const PLANNED_TRANCHES = 3; // Three equal-notional shadow slices; uninvested capital remains cash at 0%.
const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const validNumber = value => typeof value === "number" && Number.isFinite(value);
const validPrice = value => validNumber(value) && value > 0;
const mean = arr => arr.length ? round(arr.reduce((x,y) => x+y,0) / arr.length) : null;

function utc(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const normal = new Date(ms).toISOString();
  return normal.slice(0,19) === value.slice(0,19) ? ms : null;
}
function validStart(record, now) {
  const symbol = typeof record?.symbol === "string" ? record.symbol.trim().toUpperCase() : "";
  const start = utc(record?.createdAt);
  const day = start !== null ? new Date(start).toISOString().slice(0,10) : null;
  if (!symbol || !/^[A-Z0-9._-]{1,25}$/.test(symbol) || start === null || start > now || !validPrice(record?.referencePrice)) return null;
  if (record.observationDate !== day || record.id !== day + ":" + symbol || record.currency !== "USD") return null;
  // Legacy rows without an original observed quote remain archived, not scored.
  const initialQuote = utc(record?.source?.initialQuoteObservedAt);
  if (initialQuote === null || initialQuote > start || start - initialQuote > MAX_ENTRY_QUOTE_AGE ||
      typeof record.source?.initialQuoteSource !== "string" || !record.source.initialQuoteSource.trim()) return null;
  if (record.researchOnly !== true || record.liveTradingAllowed !== false ||
      record.brokerSubmissionAllowed !== false || record.executionEligible !== false ||
      record.paperCertificationEligible !== false || record.historicalBackfill === true) return null;
  if (!Array.isArray(record.tranches) || record.tranches.length !== PLANNED_TRANCHES ||
      record.tranches.some((t, index) => {
        const expectedStart = start + index * 7 * DAY;
        const executedAt = utc(t?.executedAt);
        return t?.number !== index + 1 || t.targetOffsetDays !== index * 7 ||
          !["EXECUTED", "PENDING", "SKIPPED_SIGNAL_INVALIDATED"].includes(t?.status) ||
          (t.status === "EXECUTED" &&
            (executedAt === null || executedAt < expectedStart || executedAt > expectedStart + 4 * DAY));
      })) return null;
  return { start, day, symbol };
}
function timelyMarkedQuote(value, markedAt, start) {
  const quote = utc(value);
  return quote !== null && quote >= start && quote <= markedAt && markedAt - quote <= MAX_MARK_QUOTE_AGE;
}
function stagedAt(record, price, markedAt) {
  if (!validPrice(price)) return null;
  const executed = record.tranches.filter(t => t?.status === "EXECUTED");
  if (!executed.length || executed.some(t => !validPrice(t.price) || utc(t.executedAt) === null || utc(t.executedAt) > markedAt)) return null;
  return executed.reduce((sum,t) => sum + (price / t.price - 1) * 100, 0) / executed.length;
}
function fullCapitalAt(record, price, markedAt) {
  const investedOnly = stagedAt(record, price, markedAt);
  if (investedOnly === null) return null;
  const executedCount = record.tranches.filter(t => t.status === "EXECUTED").length;
  // Normalize to all THREE planned, equal research allocations. Pending slices yield 0% in cash.
  const exposed = record.tranches.filter(t => t.status === "EXECUTED");
  const priceShockCoefficient = exposed.reduce((sum,t) => sum + price / t.price,0) / PLANNED_TRANCHES;
  return {capitalGross: investedOnly * executedCount / PLANNED_TRANCHES,
    investedFraction: executedCount / PLANNED_TRANCHES, priceShockCoefficient};
}
function measured(record, name, rules, now) {
  const created = validStart(record, now);
  if (!created) return null;
  const checkpoint = record.checkpoints?.[name];
  const at = utc(checkpoint?.measuredAt);
  if (checkpoint?.status !== "MEASURED" || at === null || at > now ||
      !timelyMarkedQuote(checkpoint?.quoteObservedAt, at, created.start) ||
      at - created.start < rules.days * DAY || at - created.start > (rules.days + rules.grace) * DAY) return null;
  const raw = stagedAt(record, checkpoint.currentPrice, at);
  const lump = (checkpoint.currentPrice / record.referencePrice - 1) * 100;
  if (raw === null || !validNumber(checkpoint.stagedReturnPercent) ||
      !validNumber(checkpoint.lumpSumReturnPercent) ||
      !Number.isFinite(lump) ||
      Math.abs(raw - checkpoint.stagedReturnPercent) > 0.035 ||
      Math.abs(lump - checkpoint.lumpSumReturnPercent) > 0.035) return null;
  const capital = fullCapitalAt(record, checkpoint.currentPrice, at);
  if (!capital) return null;
  return { ...created, measuredAt: at, exitDay: new Date(at).toISOString().slice(0,10),
    stagedGross: raw, lumpGross: lump, ...capital };
}
function provisional(record, now) {
  const created = validStart(record, now);
  const at = utc(record?.lastMarkedAt);
  if (!created || at === null || at < created.start || at > now || now - at > 26 * 3_600_000 ||
      !timelyMarkedQuote(record?.lastQuoteObservedAt, at, created.start)) return null;
  const raw = stagedAt(record, record.lastPrice, at);
  const lump = (record.lastPrice / record.referencePrice - 1) * 100;
  if (raw === null || !validNumber(record.stagedMarkToMarketPercent) || !validNumber(record.lumpSumMarkToMarketPercent) ||
    !Number.isFinite(lump) || Math.abs(raw - record.stagedMarkToMarketPercent) > 0.035 ||
    Math.abs(lump - record.lumpSumMarkToMarketPercent) > 0.035) return null;
  const capital = fullCapitalAt(record, record.lastPrice, at);
  if (!capital) return null;
  return { ...created, measuredAt: at, exitDay: new Date(at).toISOString().slice(0,10),
    stagedGross: raw, lumpGross: lump, ...capital };
}
function compare(rows, measure, cost) {
  const sorted = rows.filter(x => x && typeof x === "object").sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.symbol).localeCompare(String(b.symbol)));
  const starts = new Map(), seen = new Set();
  const prepared = [];
  for (const rec of sorted) {
    const point = measure(rec);
    if (!point) continue;
    const key = point.day + ":" + point.symbol;
    if (seen.has(key)) continue;
    seen.add(key);
    prepared.push(point);
    if (point.symbol === "SPY" && !starts.has(point.day)) starts.set(point.day, point);
  }
  const pairs = [];
  for (const item of prepared) {
    if (item.symbol === "SPY") continue;
    const spy = starts.get(item.day);
    if (!spy || item.exitDay !== spy.exitDay ||
      Math.abs(spy.start - item.start) > 12 * 3_600_000 ||
      Math.abs(spy.measuredAt - item.measuredAt) > DAY) continue;
    const investedCost = cost * item.investedFraction;
    const net = item.capitalGross - investedCost;
    pairs.push({ symbol:item.symbol, entryDate:item.day, exitDate:item.exitDay,
      // Full precision retained for sensitivity arithmetic; all outputs are research-only.
      grossFullCapitalPercent:item.capitalGross,
      investedFraction:item.investedFraction,
      benchmarkGrossPercent:spy.lumpGross,
      priceShockCoefficient:item.priceShockCoefficient,
      investedCapitalPercent:round(100 * item.investedFraction), cashCapitalPercent:round(100 * (1 - item.investedFraction)),
      hypotheticalCostOnTotalCapitalPercent:round(investedCost),
      hypotheticalNetReturnPercent:round(net), benchmarkGrossReturnPercent:round(spy.lumpGross),
      hypotheticalExcessPercent:round(net - spy.lumpGross), beatBenchmark:net>spy.lumpGross });
  }
  return pairs;
}
function stats(pairs,cost) {
  return { pairedSamples:pairs.length, independentEntryDays:new Set(pairs.map(p => p.entryDate)).size,
    sensitivity:summarizeForwardShadowSensitivity(pairs,{baseCostPercent:cost}),
    hypotheticalAverageAfterCostPercent:mean(pairs.map(p => p.hypotheticalNetReturnPercent)),
    benchmarkGrossAveragePercent:mean(pairs.map(p => p.benchmarkGrossReturnPercent)),
    hypotheticalAverageExcessPercent:mean(pairs.map(p => p.hypotheticalExcessPercent)),
    beatBenchmarkRatePercent:pairs.length?round(100*pairs.filter(p=>p.beatBenchmark).length/pairs.length):null };
}
export function evaluateForwardShadowBenchmark(records,{now=new Date(),costPercent=COST_PERCENT}={}) {
  const nowMs=now instanceof Date?now.getTime():NaN;
  if (!Number.isFinite(nowMs) || !validNumber(costPercent) || costPercent<0 || costPercent>10) throw new Error("Invalid forward research valuation inputs");
  const input=Array.isArray(records)?records:[];
  const provisionalPairs=compare(input,r=>provisional(r,nowMs),costPercent);
  const matured={};
  for(const [horizon,rules] of Object.entries(WINDOWS)){
    const pairs=compare(input,r=>measured(r,horizon,rules,nowMs),costPercent);
    matured[horizon]=stats(pairs,costPercent);
  }
  return {
    version:4, benchmark:"SPY", currency:"USD", costPercent,
    capitalBasis:"Three equal-notional research slices. Unfilled slices earn 0% in cash; benchmark SPY assumes 100% invested initially.",
    costBasis:"Illustrative round trip charged in proportion to executed slices, not on uninvested cash; benchmark is gross",
    state:Object.values(matured).every(h => h.pairedSamples >= 30 && h.independentEntryDays >= 30) ? "RESEARCH_SAMPLE_MATURE" : "INSUFFICIENT_FORWARD_EVIDENCE",
    methodology:"Only original symbol-specific quote timestamps and sources are admitted (<=30 minutes before decision), and exit quotes need actual observation timestamps no older than 6h at mark time. Unknown-time legacy quote marks remain archived but cannot count toward alpha. Matched USD issuer and SPY forward-only cohorts on same entry and exit days. Full capital normalized to three equal tranches; unfilled slices stay zero-yield cash and illustrative costs scale with invested fraction. Both >=30 paired symbols AND >=30 independent entry dates at 7d/30d are required. Provisional marks never count as mature.",
    exclusions:"No FX, dividends, taxes, Directa actual fees or executable order-book evidence. Sensitivity shocks are hypothetical, not max drawdown or forecasts. No claim of observed strategy alpha when sample is immature.",
    provisional:{...stats(provisionalPairs,costPercent), observations:provisionalPairs.slice(0,8)},
    matured,
    hasRealizedProfit:false,
    isolation:{researchOnly:true,changesV6Policy:false,feedsPaperCertification:false,
      brokerSubmissionAllowed:false,liveTradingAllowed:false,executionEligible:false},
  };
}
