import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'strategy-lab.json');
const terminalPath = path.join(root, 'data', 'terminal-intelligence.json');
const now = new Date();
const COST = 0.001;

const universe = [
  ['SPY', 'SPY', 'S&P 500 ETF', 'ETF'], ['QQQ', 'QQQ', 'Nasdaq 100 ETF', 'ETF'], ['IWM', 'IWM', 'Russell 2000 ETF', 'ETF'],
  ['GLD', 'GLD', 'Oro ETF', 'Materie prime'], ['TLT', 'TLT', 'Treasury 20+ Year ETF', 'Obbligazioni'],
  ['AAPL', 'AAPL', 'Apple', 'Azioni'], ['MSFT', 'MSFT', 'Microsoft', 'Azioni'], ['NVDA', 'NVDA', 'NVIDIA', 'Semiconduttori'],
  ['GOOGL', 'GOOGL', 'Alphabet', 'Azioni'], ['AMZN', 'AMZN', 'Amazon', 'Azioni'], ['META', 'META', 'Meta Platforms', 'Azioni'],
  ['TSM', 'TSM', 'Taiwan Semiconductor ADR', 'Semiconduttori'], ['ASML', 'ASML', 'ASML ADR', 'Semiconduttori'],
  ['CRSP', 'CRSP', 'CRISPR Therapeutics', 'Biotech'], ['RXRX', 'RXRX', 'Recursion Pharmaceuticals', 'AI Biotech'],
  ['NTLA', 'NTLA', 'Intellia Therapeutics', 'Biotech'], ['BIOX', 'BIOX', 'Bioceres Crop Solutions', 'Agritech'],
  ['BTC', 'BTC-USD', 'Bitcoin', 'Criptovaluta'], ['ETH', 'ETH-USD', 'Ethereum', 'Criptovaluta'],
];

const trendVariants = [
  { id: 'trend-40-180', label: 'Trend 40/180', fast: 40, slow: 180 },
  { id: 'trend-50-200', label: 'Trend 50/200', fast: 50, slow: 200 },
  { id: 'trend-60-220', label: 'Trend 60/220', fast: 60, slow: 220 },
];
const tacticalVariants = [
  { id: 'tactical-15-45', label: 'Tattica 15/45', fast: 15, slow: 45, rsiMin: 40, rsiMax: 75 },
  { id: 'tactical-20-50', label: 'Tattica 20/50', fast: 20, slow: 50, rsiMin: 45, rsiMax: 72 },
  { id: 'tactical-25-60', label: 'Tattica 25/60', fast: 25, slow: 60, rsiMin: 45, rsiMax: 70 },
];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const standardDeviation = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function fetchJson(url, timeoutMs = 25_000) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 FeniceStrategyLab/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1000);
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

async function fetchRows(yahooSymbol) {
  const encoded = encodeURIComponent(yahooSymbol);
  let data;
  try { data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5y&events=div%2Csplits&includeAdjustedClose=true`); }
  catch { data = await fetchJson(`https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5y&events=div%2Csplits&includeAdjustedClose=true`); }
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(data?.chart?.error?.description || 'Storico vuoto');
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || quote.close || [];
  const rows = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = Number(adjusted[index] ?? quote.close?.[index]);
    if (!Number.isFinite(close) || close <= 0) continue;
    const date = new Date(Number(timestamps[index]) * 1000).toISOString().slice(0, 10);
    rows.push({ date, close });
  }
  if (rows.length < 300) throw new Error(`Storico insufficiente: ${rows.length} osservazioni`);
  return rows;
}

function rollingAverage(values, period) {
  const result = new Array(values.length).fill(undefined);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) result[index] = sum / period;
  }
  return result;
}

function rollingRsi(values, period = 14) {
  const result = new Array(values.length).fill(undefined);
  for (let end = period; end < values.length; end += 1) {
    let gains = 0;
    let losses = 0;
    for (let index = end - period + 1; index <= end; index += 1) {
      const change = values[index] - values[index - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }
    const averageLoss = losses / period;
    result[end] = averageLoss === 0 ? 100 : 100 - 100 / (1 + (gains / period) / averageLoss);
  }
  return result;
}

function maxDrawdown(values) {
  let peak = values[0] || 1;
  let drawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    drawdown = Math.min(drawdown, value / peak - 1);
  }
  return drawdown * 100;
}

function calculateMetrics(assetCloses, benchmarkCloses, signal, start, end) {
  let equity = 1;
  let benchmarkEquity = 1;
  let position = false;
  let trades = 0;
  let exposureDays = 0;
  const strategyReturns = [];
  const equityCurve = [1];
  const benchmarkCurve = [1];
  for (let index = Math.max(1, start); index < end; index += 1) {
    const desired = Boolean(signal[index - 1]);
    if (desired !== position) {
      equity *= 1 - COST;
      trades += 1;
      position = desired;
    }
    const assetReturn = assetCloses[index] / assetCloses[index - 1] - 1;
    const benchmarkReturn = benchmarkCloses[index] / benchmarkCloses[index - 1] - 1;
    const strategyReturn = position ? assetReturn : 0;
    if (position) exposureDays += 1;
    equity *= 1 + strategyReturn;
    benchmarkEquity *= 1 + benchmarkReturn;
    strategyReturns.push(strategyReturn);
    equityCurve.push(equity);
    benchmarkCurve.push(benchmarkEquity);
  }
  const observations = strategyReturns.length;
  const years = Math.max(observations / 252, 1 / 252);
  const annualizedReturn = (equity ** (1 / years) - 1) * 100;
  const benchmarkAnnualized = (benchmarkEquity ** (1 / years) - 1) * 100;
  const deviation = standardDeviation(strategyReturns);
  const sharpe = deviation > 0 ? average(strategyReturns) / deviation * Math.sqrt(252) : 0;
  return {
    annualizedReturnPercent: round(annualizedReturn, 1),
    benchmarkAnnualizedReturnPercent: round(benchmarkAnnualized, 1),
    excessAnnualizedReturnPercent: round(annualizedReturn - benchmarkAnnualized, 1),
    maxDrawdownPercent: round(maxDrawdown(equityCurve), 1),
    benchmarkMaxDrawdownPercent: round(maxDrawdown(benchmarkCurve), 1),
    volatilityPercent: round(deviation * Math.sqrt(252) * 100, 1),
    sharpe: round(sharpe, 2),
    trades,
    exposurePercent: round(observations ? exposureDays / observations * 100 : 0, 1),
    observations,
  };
}

function buildSignals(closes, family, parameters) {
  const fast = rollingAverage(closes, parameters.fast);
  const slow = rollingAverage(closes, parameters.slow);
  const rsi = family === 'tactical' ? rollingRsi(closes, 14) : [];
  return closes.map((price, index) => {
    if (!Number.isFinite(fast[index]) || !Number.isFinite(slow[index])) return false;
    if (family === 'trend') return fast[index] > slow[index] && price > slow[index];
    return fast[index] > slow[index] && price > fast[index] && Number(rsi[index]) >= parameters.rsiMin && Number(rsi[index]) <= parameters.rsiMax;
  });
}

function verdictFor(score, positive, count) {
  if (score >= 70 && positive >= Math.ceil(count * 2 / 3)) return 'ROBUSTA';
  if (score >= 55 && positive >= Math.ceil(count / 2)) return 'PROMETTENTE';
  if (count) return 'FRAGILE';
  return 'INSUFFICIENTE';
}

function buildFamily(id, label, definitions, closes, benchmarkCloses, splitIndex) {
  const variants = definitions.map((definition) => {
    const signals = buildSignals(closes, id, definition);
    return {
      id: definition.id,
      label: definition.label,
      parameters: Object.fromEntries(Object.entries(definition).filter(([key, value]) => !['id', 'label'].includes(key) && Number.isFinite(value))),
      inSample: calculateMetrics(closes, benchmarkCloses, signals, 1, splitIndex),
      outOfSample: calculateMetrics(closes, benchmarkCloses, signals, splitIndex, closes.length),
      fullPeriod: calculateMetrics(closes, benchmarkCloses, signals, 1, closes.length),
    };
  });
  const excesses = variants.map((variant) => variant.outOfSample.excessAnnualizedReturnPercent);
  const improvements = variants.map((variant) => variant.outOfSample.maxDrawdownPercent - variant.outOfSample.benchmarkMaxDrawdownPercent).map((value) => -value);
  const positive = variants.filter((variant) => variant.outOfSample.excessAnnualizedReturnPercent > 0 && variant.outOfSample.sharpe > 0).length;
  const medianExcess = median(excesses);
  const medianImprovement = median(improvements);
  const tradePenalty = variants.some((variant) => variant.outOfSample.trades < 2) ? 8 : 0;
  const score = Math.round(clamp(42 + clamp(medianExcess, -20, 20) * 1.5 + (positive / variants.length) * 28 + clamp(medianImprovement, -20, 30) * 0.6 - tradePenalty));
  const selected = [...variants].sort((left, right) => (right.outOfSample.excessAnnualizedReturnPercent + right.outOfSample.sharpe * 3) - (left.outOfSample.excessAnnualizedReturnPercent + left.outOfSample.sharpe * 3))[0];
  const verdict = verdictFor(score, positive, variants.length);
  const rationale = [
    `${positive}/${variants.length} varianti battono SPY fuori campione con Sharpe positivo.`,
    `Eccesso annuo mediano fuori campione: ${round(medianExcess, 1)}%.`,
    `Miglioramento mediano del drawdown rispetto a SPY: ${round(medianImprovement, 1)} punti percentuali.`,
  ];
  const warnings = [];
  if (positive < Math.ceil(variants.length / 2)) warnings.push('La maggioranza dei parametri non conferma un vantaggio fuori campione.');
  if (variants.some((variant) => variant.outOfSample.trades < 2)) warnings.push('Alcune varianti hanno poche operazioni fuori campione: significatività ridotta.');
  if (medianExcess < 0) warnings.push('Il risultato mediano fuori campione è inferiore al benchmark SPY.');
  return {
    id,
    label,
    verdict,
    robustnessScore: score,
    positiveOutOfSampleVariants: positive,
    variantCount: variants.length,
    medianOutOfSampleExcessPercent: round(medianExcess, 1),
    medianOutOfSampleDrawdownImprovementPercent: round(medianImprovement, 1),
    selectedVariantId: selected?.id || variants[0]?.id,
    variants,
    rationale,
    warnings,
  };
}

async function buildAsset(definition, spyMap, terminalMap) {
  const [symbol, yahooSymbol, defaultName, defaultClass] = definition;
  const rows = await fetchRows(yahooSymbol);
  const aligned = rows.filter((row) => spyMap.has(row.date));
  if (aligned.length < 300) throw new Error(`Solo ${aligned.length} date allineate con SPY`);
  const closes = aligned.map((row) => row.close);
  const benchmarkCloses = aligned.map((row) => spyMap.get(row.date));
  const splitIndex = Math.max(250, Math.floor(aligned.length * 0.6));
  if (aligned.length - splitIndex < 150) throw new Error('Periodo fuori campione troppo breve');
  const families = [
    buildFamily('trend', 'Trend following', trendVariants, closes, benchmarkCloses, splitIndex),
    buildFamily('tactical', 'Momentum tattico', tacticalVariants, closes, benchmarkCloses, splitIndex),
  ];
  const best = [...families].sort((left, right) => right.robustnessScore - left.robustnessScore)[0];
  const terminalAsset = terminalMap.get(symbol);
  return {
    symbol,
    name: terminalAsset?.name || defaultName,
    assetClass: terminalAsset?.assetClass || defaultClass,
    source: 'Yahoo Finance daily adjusted close',
    observedAt: `${aligned.at(-1).date}T00:00:00.000Z`,
    status: 'operativo',
    historyYears: round((aligned.length - 1) / 252, 1),
    observations: aligned.length,
    splitDate: aligned[splitIndex]?.date,
    benchmark: 'SPY',
    families,
    bestFamily: best?.id,
    bestRobustnessScore: best?.robustnessScore || 0,
    conclusion: best?.verdict || 'INSUFFICIENTE',
    warnings: best?.verdict === 'ROBUSTA' ? [] : ['Nessuna strategia deve essere usata automaticamente senza ulteriori test, slippage e verifica sul broker.'],
  };
}

const previous = await readJson(reportPath, { version: 0 });
const terminal = await readJson(terminalPath, { assets: [] });
const terminalMap = new Map((terminal.assets || []).map((asset) => [asset.symbol, asset]));
const spyRows = await fetchRows('SPY');
const spyMap = new Map(spyRows.map((row) => [row.date, row.close]));
const assets = [];
const failures = [];
for (let index = 0; index < universe.length; index += 3) {
  const batch = universe.slice(index, index + 3);
  const results = await Promise.allSettled(batch.map((definition) => buildAsset(definition, spyMap, terminalMap)));
  results.forEach((result, offset) => {
    if (result.status === 'fulfilled') assets.push(result.value);
    else failures.push(`${batch[offset][0]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (index + 3 < universe.length) await sleep(500);
}
assets.sort((left, right) => right.bestRobustnessScore - left.bestRobustnessScore);
const robustCount = assets.filter((asset) => asset.conclusion === 'ROBUSTA').length;
const report = {
  version: Number(previous.version || 0) + 1,
  generatedAt: now.toISOString(),
  mode: assets.length >= 15 ? 'live' : assets.length ? 'partial' : 'bootstrap',
  source: {
    name: 'Fenice Robust Strategy Lab',
    state: assets.length >= 15 ? 'operativo' : assets.length ? 'parziale' : 'errore',
    detail: `${assets.length}/${universe.length} strumenti analizzati; ${robustCount} con almeno una famiglia classificata ROBUSTA.`,
  },
  universeSize: universe.length,
  assetCount: assets.length,
  coveragePercent: Math.round(assets.length / universe.length * 100),
  robustCount,
  methodology: [
    'Storico giornaliero rettificato fino a cinque anni.',
    'Primo 60% usato come periodo di sviluppo; ultimo 40% completamente fuori campione.',
    'Il segnale della seduta precedente determina l’esposizione della seduta successiva: nessun look-ahead.',
    'Confronto con SPY sulle stesse date disponibili per ogni strumento.',
    'Tre varianti di parametri per ciascuna famiglia, per ridurre il rischio di overfitting.',
    `Costo simulato ${(COST * 100).toFixed(1)}% a ogni cambio di posizione.`,
    'Robustezza basata su eccesso di rendimento mediano fuori campione, drawdown, Sharpe, numero di varianti positive e sufficienza delle operazioni.',
  ],
  assets,
  warnings: [
    ...(failures.length ? [`Analisi non completata per ${failures.length} strumenti: ${failures.slice(0, 5).join('; ')}.`] : []),
    'Non sono ancora inclusi spread bid/ask specifici, imposte, liquidità, slippage variabile o sospensioni di mercato.',
    'Un backtest robusto riduce il rischio di overfitting ma non garantisce risultati futuri.',
  ],
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Strategy Lab: ${assets.length}/${universe.length}, robusti ${robustCount}, copertura ${report.coveragePercent}%.`);
