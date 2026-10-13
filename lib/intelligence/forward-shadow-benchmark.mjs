// FENICE100K: isolated research scorecard. Never alters SHADOW/PAPER decisions or submits orders.
const DAY = 86_400_000;
const WINDOWS = Object.freeze({ "7d": { days: 7, grace: 4 }, "30d": { days: 30, grace: 5 } });
const COST_PERCENT = 0.30; // Illustrative round trip, NOT actual Directa costs.
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
  if (record.researchOnly !== true || record.liveTradingAllowed !== false ||
      record.brokerSubmissionAllowed !== false || record.executionEligible !== false ||
      record.paperCertificationEligible !== false || record.historicalBackfill === true) return null;
  if (!Array.isArray(record.tranches) || !record.tranches.length) return null;
  return { start, day, symbol };
}
function stagedAt(record, price, markedAt) {
  if (!validPrice(price)) return null;
  const executed = record.tranches.filter(t => t?.status === "EXECUTED");
  if (!executed.length || executed.some(t => !validPrice(t.price) || utc(t.executedAt) === null || utc(t.executedAt) > markedAt)) return null;
  return executed.reduce((sum,t) => sum + (price / t.price - 1) * 100, 0) / executed.length;
}
function measured(record, name, rules, now) {
  const created = validStart(record, now);
  if (!created) return null;
  const checkpoint = record.checkpoints?.[name];
  const at = utc(checkpoint?.measuredAt);
  if (checkpoint?.status !== "MEASURED" || at === null || at > now ||
      at - created.start < rules.days * DAY || at - created.start > (rules.days + rules.grace) * DAY) return null;
  const raw = stagedAt(record, checkpoint.currentPrice, at);
  const lump = (checkpoint.currentPrice / record.referencePrice - 1) * 100;
  if (raw === null || !validNumber(checkpoint.stagedReturnPercent) ||
      !validNumber(checkpoint.lumpSumReturnPercent) ||
      !Number.isFinite(lump) ||
      Math.abs(raw - checkpoint.stagedReturnPercent) > 0.035 ||
      Math.abs(lump - checkpoint.lumpSumReturnPercent) > 0.035) return null;
  return { ...created, measuredAt: at, exitDay: new Date(at).toISOString().slice(0,10),
    stagedGross: raw, lumpGross: lump };
}
function provisional(record, now) {
  const created = validStart(record, now);
  const at = utc(record?.lastMarkedAt);
  if (!created || at === null || at < created.start || at > now || now - at > 26 * 3_600_000) return null;
  const raw = stagedAt(record, record.lastPrice, at);
  const lump = (record.lastPrice / record.referencePrice - 1) * 100;
  if (raw === null || !validNumber(record.stagedMarkToMarketPercent) || !validNumber(record.lumpSumMarkToMarketPercent) ||
    !Number.isFinite(lump) || Math.abs(raw - record.stagedMarkToMarketPercent) > 0.035 ||
    Math.abs(lump - record.lumpSumMarkToMarketPercent) > 0.035) return null;
  return { ...created, measuredAt: at, exitDay: new Date(at).toISOString().slice(0,10),
    stagedGross: raw, lumpGross: lump };
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
    const net = item.stagedGross - cost;
    pairs.push({ symbol:item.symbol, entryDate:item.day, exitDate:item.exitDay,
      hypotheticalNetReturnPercent:round(net), benchmarkGrossReturnPercent:round(spy.lumpGross),
      hypotheticalExcessPercent:round(net - spy.lumpGross), beatBenchmark:net>spy.lumpGross });
  }
  return pairs;
}
function stats(pairs) {
  return { pairedSamples:pairs.length, independentEntryDays:new Set(pairs.map(p => p.entryDate)).size,
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
    matured[horizon]=stats(pairs);
  }
  return {
    version:1, benchmark:"SPY", currency:"USD", costPercent, costBasis:"Illustrative candidate round-trip; benchmark is gross",
    state:matured["7d"].pairedSamples>=30 && matured["30d"].pairedSamples>=30?"RESEARCH_SAMPLE_MATURE":"INSUFFICIENT_FORWARD_EVIDENCE",
    methodology:"Matched issuer and SPY forward-only cohorts, same entry day, same exit day, <=12h entry and <=24h mark difference; prices and stored returns cross-validated. One symbol/day, 7/30d maturity gates. Provisional marks are not matured observations.",
    exclusions:"No FX, dividends, taxes, Directa actual fees or executable order-book evidence. No claim of observed strategy alpha when sample is immature.",
    provisional:{...stats(provisionalPairs), observations:provisionalPairs.slice(0,8)},
    matured,
    hasRealizedProfit:false,
    isolation:{researchOnly:true,changesV6Policy:false,feedsPaperCertification:false,
      brokerSubmissionAllowed:false,liveTradingAllowed:false,executionEligible:false},
  };
}
