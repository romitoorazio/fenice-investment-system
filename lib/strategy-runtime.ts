// @ts-nocheck
import type { StrategyLabReport } from "@/lib/strategy";
import type { TerminalReport } from "@/lib/terminal";

const COST = 0.001;
const variants = {
  trend: [
    { id: "trend-40-180", label: "Trend 40/180", fast: 40, slow: 180 },
    { id: "trend-50-200", label: "Trend 50/200", fast: 50, slow: 200 },
    { id: "trend-60-220", label: "Trend 60/220", fast: 60, slow: 220 },
  ],
  tactical: [
    { id: "tactical-15-45", label: "Tattica 15/45", fast: 15, slow: 45, rsiMin: 40, rsiMax: 75 },
    { id: "tactical-20-50", label: "Tattica 20/50", fast: 20, slow: 50, rsiMin: 45, rsiMax: 72 },
    { id: "tactical-25-60", label: "Tattica 25/60", fast: 25, slow: 60, rsiMin: 45, rsiMax: 70 },
  ],
};
const yahooSymbols: Record<string, string> = { BTC: "BTC-USD", ETH: "ETH-USD" };
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const deviation = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
};

async function chart(symbol: string) {
  const encoded = encodeURIComponent(symbol);
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5y&events=div%2Csplits&includeAdjustedClose=true`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5y&events=div%2Csplits&includeAdjustedClose=true`,
  ];
  let lastError;
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0 FeniceStrategyRuntime/1.0" },
        next: { revalidate: 21_600 },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error("Storico vuoto");
      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const adjusted = result.indicators?.adjclose?.[0]?.adjclose || quote.close || [];
      const rows = timestamps.map((timestamp, index) => ({
        date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
        close: Number(adjusted[index] ?? quote.close?.[index]),
      })).filter((row) => Number.isFinite(row.close) && row.close > 0);
      if (rows.length < 300) throw new Error(`Storico insufficiente: ${rows.length}`);
      return rows;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function rollingAverage(values, period) {
  const output = new Array(values.length).fill(undefined);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) output[index] = sum / period;
  }
  return output;
}

function rollingRsi(values, period = 14) {
  const output = new Array(values.length).fill(undefined);
  for (let end = period; end < values.length; end += 1) {
    let gains = 0;
    let losses = 0;
    for (let index = end - period + 1; index <= end; index += 1) {
      const change = values[index] - values[index - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }
    const loss = losses / period;
    output[end] = loss === 0 ? 100 : 100 - 100 / (1 + (gains / period) / loss);
  }
  return output;
}

function signals(closes, family, parameters) {
  const fast = rollingAverage(closes, parameters.fast);
  const slow = rollingAverage(closes, parameters.slow);
  const rsi = family === "tactical" ? rollingRsi(closes) : [];
  return closes.map((price, index) => {
    if (!Number.isFinite(fast[index]) || !Number.isFinite(slow[index])) return false;
    if (family === "trend") return fast[index] > slow[index] && price > slow[index];
    return fast[index] > slow[index] && price > fast[index] && Number(rsi[index]) >= parameters.rsiMin && Number(rsi[index]) <= parameters.rsiMax;
  });
}

function maxDrawdown(values) {
  let peak = values[0] || 1;
  let worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    worst = Math.min(worst, value / peak - 1);
  }
  return worst * 100;
}

function metrics(asset, benchmark, signal, start, end) {
  let equity = 1;
  let benchmarkEquity = 1;
  let position = false;
  let trades = 0;
  let exposure = 0;
  const returns = [];
  const equityCurve = [1];
  const benchmarkCurve = [1];
  for (let index = Math.max(1, start); index < end; index += 1) {
    const desired = Boolean(signal[index - 1]);
    if (desired !== position) {
      equity *= 1 - COST;
      trades += 1;
      position = desired;
    }
    const assetReturn = asset[index] / asset[index - 1] - 1;
    const benchmarkReturn = benchmark[index] / benchmark[index - 1] - 1;
    const strategyReturn = position ? assetReturn : 0;
    if (position) exposure += 1;
    equity *= 1 + strategyReturn;
    benchmarkEquity *= 1 + benchmarkReturn;
    returns.push(strategyReturn);
    equityCurve.push(equity);
    benchmarkCurve.push(benchmarkEquity);
  }
  const observations = returns.length;
  const years = Math.max(observations / 252, 1 / 252);
  const annual = (equity ** (1 / years) - 1) * 100;
  const benchmarkAnnual = (benchmarkEquity ** (1 / years) - 1) * 100;
  const sd = deviation(returns);
  return {
    annualizedReturnPercent: round(annual, 1),
    benchmarkAnnualizedReturnPercent: round(benchmarkAnnual, 1),
    excessAnnualizedReturnPercent: round(annual - benchmarkAnnual, 1),
    maxDrawdownPercent: round(maxDrawdown(equityCurve), 1),
    benchmarkMaxDrawdownPercent: round(maxDrawdown(benchmarkCurve), 1),
    volatilityPercent: round(sd * Math.sqrt(252) * 100, 1),
    sharpe: round(sd ? average(returns) / sd * Math.sqrt(252) : 0, 2),
    trades,
    exposurePercent: round(observations ? exposure / observations * 100 : 0, 1),
    observations,
  };
}

function verdict(score, positive, count) {
  if (score >= 70 && positive >= Math.ceil(count * 2 / 3)) return "ROBUSTA";
  if (score >= 55 && positive >= Math.ceil(count / 2)) return "PROMETTENTE";
  return count ? "FRAGILE" : "INSUFFICIENTE";
}

function family(id, label, definitions, closes, benchmark, split) {
  const results = definitions.map((definition) => {
    const signal = signals(closes, id, definition);
    return {
      id: definition.id,
      label: definition.label,
      parameters: Object.fromEntries(Object.entries(definition).filter(([key, value]) => !["id", "label"].includes(key) && Number.isFinite(value))),
      inSample: metrics(closes, benchmark, signal, 1, split),
      outOfSample: metrics(closes, benchmark, signal, split, closes.length),
      fullPeriod: metrics(closes, benchmark, signal, 1, closes.length),
    };
  });
  const positive = results.filter((item) => item.outOfSample.excessAnnualizedReturnPercent > 0 && item.outOfSample.sharpe > 0).length;
  const medianExcess = median(results.map((item) => item.outOfSample.excessAnnualizedReturnPercent));
  const medianImprovement = median(results.map((item) => item.outOfSample.maxDrawdownPercent - item.outOfSample.benchmarkMaxDrawdownPercent));
  const tradePenalty = results.some((item) => item.outOfSample.trades < 2) ? 8 : 0;
  const score = Math.round(clamp(42 + clamp(medianExcess, -20, 20) * 1.5 + positive / results.length * 28 + clamp(medianImprovement, -20, 30) * 0.6 - tradePenalty));
  const selected = [...results].sort((a, b) => (b.outOfSample.excessAnnualizedReturnPercent + b.outOfSample.sharpe * 3) - (a.outOfSample.excessAnnualizedReturnPercent + a.outOfSample.sharpe * 3))[0];
  return {
    id,
    label,
    verdict: verdict(score, positive, results.length),
    robustnessScore: score,
    positiveOutOfSampleVariants: positive,
    variantCount: results.length,
    medianOutOfSampleExcessPercent: round(medianExcess, 1),
    medianOutOfSampleDrawdownImprovementPercent: round(medianImprovement, 1),
    selectedVariantId: selected.id,
    variants: results,
    rationale: [
      `${positive}/${results.length} varianti battono SPY fuori campione con Sharpe positivo.`,
      `Eccesso annuo mediano fuori campione: ${round(medianExcess, 1)}%.`,
      `Miglioramento mediano del drawdown rispetto a SPY: ${round(medianImprovement, 1)} punti percentuali.`,
    ],
    warnings: [
      ...(positive < Math.ceil(results.length / 2) ? ["La maggioranza dei parametri non conferma un vantaggio fuori campione."] : []),
      ...(results.some((item) => item.outOfSample.trades < 2) ? ["Alcune varianti hanno poche operazioni fuori campione."] : []),
      ...(medianExcess < 0 ? ["Il risultato mediano fuori campione è inferiore a SPY."] : []),
    ],
  };
}

async function assetReport(asset, spyMap) {
  const symbol = yahooSymbols[asset.symbol] || asset.symbol;
  const rows = await chart(symbol);
  const aligned = rows.filter((row) => spyMap.has(row.date));
  if (aligned.length < 300) throw new Error("Date allineate insufficienti");
  const closes = aligned.map((row) => row.close);
  const benchmark = aligned.map((row) => spyMap.get(row.date));
  const split = Math.max(250, Math.floor(aligned.length * 0.6));
  if (aligned.length - split < 150) throw new Error("Periodo fuori campione insufficiente");
  const families = [
    family("trend", "Trend following", variants.trend, closes, benchmark, split),
    family("tactical", "Momentum tattico", variants.tactical, closes, benchmark, split),
  ];
  const best = [...families].sort((a, b) => b.robustnessScore - a.robustnessScore)[0];
  return {
    symbol: asset.symbol,
    name: asset.name,
    assetClass: asset.assetClass,
    source: "Yahoo Finance daily adjusted close",
    observedAt: `${aligned.at(-1).date}T00:00:00.000Z`,
    status: "operativo",
    historyYears: round((aligned.length - 1) / 252, 1),
    observations: aligned.length,
    splitDate: aligned[split].date,
    benchmark: "SPY",
    families,
    bestFamily: best.id,
    bestRobustnessScore: best.robustnessScore,
    conclusion: best.verdict,
    warnings: best.verdict === "ROBUSTA" ? [] : ["Nessuna strategia deve essere automatizzata senza ulteriori test e verifica sul broker."],
  };
}

export async function buildRuntimeStrategyLab(terminal: TerminalReport): Promise<StrategyLabReport> {
  const generatedAt = new Date().toISOString();
  const spyRows = await chart("SPY");
  const spyMap = new Map(spyRows.map((row) => [row.date, row.close]));
  const assets = [];
  const failures = [];
  for (let index = 0; index < terminal.assets.length; index += 5) {
    const batch = terminal.assets.slice(index, index + 5);
    const results = await Promise.allSettled(batch.map((asset) => assetReport(asset, spyMap)));
    results.forEach((result, offset) => {
      if (result.status === "fulfilled") assets.push(result.value);
      else failures.push(`${batch[offset].symbol}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    });
  }
  assets.sort((a, b) => b.bestRobustnessScore - a.bestRobustnessScore);
  const robustCount = assets.filter((asset) => asset.conclusion === "ROBUSTA").length;
  return {
    version: 1,
    generatedAt,
    mode: assets.length >= 15 ? "live" : assets.length ? "partial" : "bootstrap",
    source: {
      name: "Fenice Robust Strategy Lab",
      state: assets.length >= 15 ? "operativo" : assets.length ? "parziale" : "errore",
      detail: `${assets.length}/${terminal.assets.length} strumenti analizzati; ${robustCount} con almeno una famiglia ROBUSTA.`,
    },
    universeSize: terminal.assets.length,
    assetCount: assets.length,
    coveragePercent: terminal.assets.length ? Math.round(assets.length / terminal.assets.length * 100) : 0,
    robustCount,
    methodology: [
      "Storico giornaliero rettificato fino a cinque anni.",
      "Primo 60% sviluppo; ultimo 40% completamente fuori campione.",
      "Segnale della seduta precedente applicato alla seduta successiva.",
      "Confronto con SPY sulle stesse date.",
      "Tre varianti di parametri per famiglia.",
      `Costo simulato ${(COST * 100).toFixed(1)}% a ogni cambio di posizione.`,
      "Robustezza basata su rendimento mediano fuori campione, drawdown, Sharpe e stabilità tra parametri.",
    ],
    assets,
    warnings: [
      ...(failures.length ? [`Analisi non completata per ${failures.length} strumenti: ${failures.slice(0, 5).join("; ")}.`] : []),
      "Non sono inclusi imposte, spread specifici, slippage variabile o sospensioni di mercato.",
      "Un backtest robusto non garantisce risultati futuri.",
    ],
  };
}
