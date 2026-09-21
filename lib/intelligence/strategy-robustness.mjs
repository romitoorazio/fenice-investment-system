const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

function median(values) {
  const sorted = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function seededRandom(seed = 20260921) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function buildWalkForwardWindows(length, { minimumTrain = 504, testSize = 126, stepSize = 126 } = {}) {
  const count = Math.max(0, Math.floor(Number(length) || 0));
  const train = Math.max(1, Math.floor(Number(minimumTrain) || 504));
  const test = Math.max(20, Math.floor(Number(testSize) || 126));
  const step = Math.max(1, Math.floor(Number(stepSize) || test));
  const windows = [];
  for (let testStart = train; testStart + test <= count; testStart += step) {
    windows.push({ trainStart: 0, trainEnd: testStart, testStart, testEnd: testStart + test });
  }
  return windows;
}

export function summarizeWalkForward(results, { minimumWindows = 3, minimumTradesPerWindow = 1 } = {}) {
  const rows = (Array.isArray(results) ? results : []).filter((row) => row && Number.isFinite(Number(row.excessAnnualizedReturnPercent)));
  if (rows.length < minimumWindows) {
    return {
      state: "INSUFFICIENT",
      windowCount: rows.length,
      positiveWindowPercent: null,
      medianExcessAnnualizedPercent: null,
      medianSharpe: null,
      worstMaxDrawdownPercent: null,
      minimumTrades: null,
      score: 0,
      reasons: [`walk-forward requires at least ${minimumWindows} windows`],
    };
  }

  const positive = rows.filter((row) => Number(row.excessAnnualizedReturnPercent) > 0 && Number(row.sharpe) > 0).length;
  const positiveWindowPercent = positive / rows.length * 100;
  const medianExcess = median(rows.map((row) => Number(row.excessAnnualizedReturnPercent))) ?? 0;
  const medianSharpe = median(rows.map((row) => Number(row.sharpe))) ?? 0;
  const worstDrawdown = Math.min(...rows.map((row) => Number(row.maxDrawdownPercent)).filter(Number.isFinite));
  const minimumTrades = Math.min(...rows.map((row) => Number(row.trades)).filter(Number.isFinite));
  const lowTradePenalty = minimumTrades < minimumTradesPerWindow ? 15 : 0;
  const score = Math.round(clamp(
    25
      + positiveWindowPercent * 0.45
      + clamp(medianExcess, -20, 20) * 1.1
      + clamp(medianSharpe, -1, 2) * 8
      + clamp(20 + worstDrawdown, -20, 20) * 0.4
      - lowTradePenalty,
    0,
    100,
  ));
  const state = score >= 70 && positiveWindowPercent >= 65
    ? "ROBUST"
    : score >= 55 && positiveWindowPercent >= 50
      ? "WATCH"
      : "FRAGILE";
  const reasons = [];
  if (positiveWindowPercent < 65) reasons.push(`only ${positiveWindowPercent.toFixed(1)}% of walk-forward windows outperform with positive Sharpe`);
  if (medianExcess <= 0) reasons.push("median walk-forward excess return is not positive");
  if (minimumTrades < minimumTradesPerWindow) reasons.push("at least one walk-forward window has insufficient trades");

  return {
    state,
    windowCount: rows.length,
    positiveWindowPercent: Number(positiveWindowPercent.toFixed(1)),
    medianExcessAnnualizedPercent: Number(medianExcess.toFixed(2)),
    medianSharpe: Number(medianSharpe.toFixed(2)),
    worstMaxDrawdownPercent: Number(worstDrawdown.toFixed(2)),
    minimumTrades,
    score,
    reasons,
  };
}

export function evaluateParameterStability(variantMetrics) {
  const rows = (Array.isArray(variantMetrics) ? variantMetrics : [])
    .filter((row) => row && Number.isFinite(Number(row.excessAnnualizedReturnPercent)) && Number.isFinite(Number(row.sharpe)));
  if (rows.length < 3) {
    return { state: "INSUFFICIENT", variants: rows.length, positivePercent: null, dispersion: null, score: 0 };
  }
  const excesses = rows.map((row) => Number(row.excessAnnualizedReturnPercent));
  const positive = rows.filter((row) => Number(row.excessAnnualizedReturnPercent) > 0 && Number(row.sharpe) > 0).length;
  const mean = excesses.reduce((sum, value) => sum + value, 0) / excesses.length;
  const variance = excesses.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, excesses.length - 1);
  const dispersion = Math.sqrt(variance);
  const positivePercent = positive / rows.length * 100;
  const score = Math.round(clamp(positivePercent - Math.min(35, dispersion * 2), 0, 100));
  return {
    state: score >= 60 ? "STABLE" : score >= 40 ? "WATCH" : "FRAGILE",
    variants: rows.length,
    positivePercent: Number(positivePercent.toFixed(1)),
    dispersion: Number(dispersion.toFixed(2)),
    score,
  };
}

export function pairedBlockBootstrapOutperformance(
  strategyReturns,
  benchmarkReturns,
  { iterations = 500, blockSize = 10, seed = 20260921 } = {},
) {
  const length = Math.min(Array.isArray(strategyReturns) ? strategyReturns.length : 0, Array.isArray(benchmarkReturns) ? benchmarkReturns.length : 0);
  const pairs = [];
  for (let index = 0; index < length; index += 1) {
    const strategy = Number(strategyReturns[index]);
    const benchmark = Number(benchmarkReturns[index]);
    if (Number.isFinite(strategy) && Number.isFinite(benchmark)) pairs.push([strategy, benchmark]);
  }
  if (pairs.length < 60) {
    return { state: "INSUFFICIENT", observations: pairs.length, iterations: 0, probabilityOutperformPercent: null, medianExcessPercent: null };
  }

  const runs = Math.max(100, Math.min(5000, Math.floor(Number(iterations) || 500)));
  const block = Math.max(1, Math.min(pairs.length, Math.floor(Number(blockSize) || 10)));
  const random = seededRandom(seed);
  const excesses = [];
  let outperform = 0;

  for (let iteration = 0; iteration < runs; iteration += 1) {
    let strategyEquity = 1;
    let benchmarkEquity = 1;
    let sampled = 0;
    while (sampled < pairs.length) {
      const maxStart = Math.max(0, pairs.length - block);
      const start = Math.floor(random() * (maxStart + 1));
      for (let offset = 0; offset < block && sampled < pairs.length; offset += 1) {
        const [strategyReturn, benchmarkReturn] = pairs[start + offset];
        strategyEquity *= 1 + strategyReturn;
        benchmarkEquity *= 1 + benchmarkReturn;
        sampled += 1;
      }
    }
    const excess = (strategyEquity / benchmarkEquity - 1) * 100;
    excesses.push(excess);
    if (excess > 0) outperform += 1;
  }

  const probability = outperform / runs * 100;
  const medianExcess = median(excesses) ?? 0;
  return {
    state: probability >= 65 && medianExcess > 0 ? "ROBUST" : probability >= 50 ? "WATCH" : "FRAGILE",
    observations: pairs.length,
    iterations: runs,
    blockSize: block,
    probabilityOutperformPercent: Number(probability.toFixed(1)),
    medianExcessPercent: Number(medianExcess.toFixed(2)),
  };
}

export function evaluateCostSensitivity(resultsByCost) {
  const rows = (Array.isArray(resultsByCost) ? resultsByCost : [])
    .filter((row) => row && Number.isFinite(Number(row.costBps)) && Number.isFinite(Number(row.excessAnnualizedReturnPercent)))
    .sort((a, b) => Number(a.costBps) - Number(b.costBps));
  if (rows.length < 3) return { state: "INSUFFICIENT", scenarios: rows.length, worstExcessPercent: null, positiveScenarios: 0 };
  const positiveScenarios = rows.filter((row) => Number(row.excessAnnualizedReturnPercent) > 0).length;
  const worstExcessPercent = Math.min(...rows.map((row) => Number(row.excessAnnualizedReturnPercent)));
  return {
    state: positiveScenarios === rows.length && worstExcessPercent > 0 ? "ROBUST" : positiveScenarios >= Math.ceil(rows.length / 2) ? "WATCH" : "FRAGILE",
    scenarios: rows.length,
    positiveScenarios,
    worstExcessPercent: Number(worstExcessPercent.toFixed(2)),
  };
}
