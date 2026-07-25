import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'terminal-intelligence.json');
const fundamentalPath = path.join(root, 'data', 'fundamental-research.json');
const snapshotPath = path.join(root, 'data', 'latest-snapshot.json');
const historyDir = path.join(root, 'data', 'history');
const now = new Date();
const CAPITAL_EURO = 10_000;
const TRANSACTION_COST = 0.001;

const universe = [
  ['SPY', 'SPY', 'S&P 500 ETF', 'ETF', 'USA'],
  ['QQQ', 'QQQ', 'Nasdaq 100 ETF', 'ETF', 'USA'],
  ['IWM', 'IWM', 'Russell 2000 ETF', 'ETF', 'USA'],
  ['GLD', 'GLD', 'Oro ETF', 'Materie prime', 'USA'],
  ['TLT', 'TLT', 'Treasury 20+ Year ETF', 'Obbligazioni', 'USA'],
  ['AAPL', 'AAPL', 'Apple', 'Azioni', 'USA'],
  ['MSFT', 'MSFT', 'Microsoft', 'Azioni', 'USA'],
  ['NVDA', 'NVDA', 'NVIDIA', 'Semiconduttori', 'USA'],
  ['GOOGL', 'GOOGL', 'Alphabet', 'Azioni', 'USA'],
  ['AMZN', 'AMZN', 'Amazon', 'Azioni', 'USA'],
  ['META', 'META', 'Meta Platforms', 'Azioni', 'USA'],
  ['TSM', 'TSM', 'Taiwan Semiconductor ADR', 'Semiconduttori', 'USA'],
  ['ASML', 'ASML', 'ASML ADR', 'Semiconduttori', 'USA'],
  ['CRSP', 'CRSP', 'CRISPR Therapeutics', 'Biotech', 'USA'],
  ['RXRX', 'RXRX', 'Recursion Pharmaceuticals', 'AI Biotech', 'USA'],
  ['NTLA', 'NTLA', 'Intellia Therapeutics', 'Biotech', 'USA'],
  ['BIOX', 'BIOX', 'Bioceres Crop Solutions', 'Agritech', 'USA'],
  ['BTC', 'BTC-USD', 'Bitcoin', 'Criptovaluta', 'Crypto globale'],
  ['ETH', 'ETH-USD', 'Ethereum', 'Criptovaluta', 'Crypto globale'],
];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const average = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : undefined;
};
const standardDeviation = (values) => {
  const mean = average(values);
  if (!Number.isFinite(mean) || values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function fetchJson(url, timeoutMs = 25_000) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json,text/plain,*/*',
          'user-agent': 'Mozilla/5.0 FeniceInvestmentSystem/4.0',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1200);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function movingAverage(values, period) {
  if (values.length < period) return undefined;
  return average(values.slice(-period));
}

function rollingMovingAverage(values, period) {
  const result = new Array(values.length).fill(undefined);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) result[index] = sum / period;
  }
  return result;
}

function rsiAt(values, period = 14) {
  if (values.length <= period) return undefined;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function rollingRsi(values, period = 14) {
  return values.map((_, index) => rsiAt(values.slice(0, index + 1), period));
}

function returnPercent(values, lookback) {
  if (values.length <= lookback) return undefined;
  const start = values.at(-(lookback + 1));
  const end = values.at(-1);
  return Number.isFinite(start) && start > 0 ? ((end / start) - 1) * 100 : undefined;
}

function annualizedVolatility(values, lookback = 20) {
  const selected = values.slice(-(lookback + 1));
  if (selected.length < 10) return undefined;
  const returns = [];
  for (let index = 1; index < selected.length; index += 1) returns.push(Math.log(selected[index] / selected[index - 1]));
  return standardDeviation(returns) * Math.sqrt(252) * 100;
}

function atrPercent(rows, period = 14) {
  const selected = rows.slice(-(period + 1));
  if (selected.length <= period) return undefined;
  const trueRanges = [];
  for (let index = 1; index < selected.length; index += 1) {
    const current = selected[index];
    const previousClose = selected[index - 1].close;
    trueRanges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previousClose),
      Math.abs(current.low - previousClose),
    ));
  }
  const price = rows.at(-1)?.close;
  return Number.isFinite(price) && price > 0 ? (average(trueRanges) / price) * 100 : undefined;
}

function maxDrawdownPercent(values) {
  let peak = values[0] || 1;
  let maxDrawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, (value / peak) - 1);
  }
  return maxDrawdown * 100;
}

function calculateSignal(technical, risk) {
  if (risk >= 82 || technical < 35) return 'NEGATIVO';
  if (technical >= 72 && risk <= 58) return 'FORTE';
  if (technical >= 60 && risk <= 70) return 'POSITIVO';
  if (technical >= 48) return 'NEUTRALE';
  return 'DEBOLE';
}

function buildReasons({ price, sma20, sma50, sma200, rsi14, oneMonth, sixMonth, maxDrawdown }) {
  const reasons = [];
  if (Number.isFinite(sma200)) reasons.push(price > sma200 ? 'Prezzo sopra la media mobile a 200 giorni.' : 'Prezzo sotto la media mobile a 200 giorni.');
  if (Number.isFinite(sma50) && Number.isFinite(sma200)) reasons.push(sma50 > sma200 ? 'Trend intermedio superiore al trend di lungo periodo.' : 'Trend intermedio ancora inferiore al trend di lungo periodo.');
  if (Number.isFinite(rsi14)) reasons.push(rsi14 >= 70 ? `RSI elevato (${round(rsi14, 1)}): possibile eccesso di breve.` : rsi14 <= 30 ? `RSI depresso (${round(rsi14, 1)}): forte debolezza o possibile recupero.` : `RSI equilibrato (${round(rsi14, 1)}).`);
  if (Number.isFinite(oneMonth) && Number.isFinite(sixMonth)) reasons.push(`Momentum: ${round(oneMonth, 1)}% a un mese e ${round(sixMonth, 1)}% a sei mesi.`);
  if (Number.isFinite(maxDrawdown)) reasons.push(`Drawdown massimo nell’ultimo anno: ${round(maxDrawdown, 1)}%.`);
  return reasons.slice(0, 5);
}

function strategyMetrics(id, label, closes, desiredPosition, benchmarkAnnualizedReturnPercent) {
  let equity = 1;
  let position = false;
  let entryPrice;
  let entries = 0;
  let wins = 0;
  let completedTrades = 0;
  let investedDays = 0;
  const equityCurve = [1];
  const dailyReturns = [];

  for (let index = 1; index < closes.length; index += 1) {
    const desired = Boolean(desiredPosition(index - 1));
    if (desired !== position) {
      equity *= 1 - TRANSACTION_COST;
      if (desired) {
        entries += 1;
        entryPrice = closes[index - 1];
      } else if (Number.isFinite(entryPrice)) {
        completedTrades += 1;
        if (closes[index - 1] > entryPrice) wins += 1;
        entryPrice = undefined;
      }
      position = desired;
    }
    const marketReturn = (closes[index] / closes[index - 1]) - 1;
    const strategyReturn = position ? marketReturn : 0;
    if (position) investedDays += 1;
    equity *= 1 + strategyReturn;
    dailyReturns.push(strategyReturn);
    equityCurve.push(equity);
  }

  if (position && Number.isFinite(entryPrice)) {
    completedTrades += 1;
    if (closes.at(-1) > entryPrice) wins += 1;
  }

  const years = Math.max(dailyReturns.length / 252, 1 / 252);
  const annualizedReturn = (equity ** (1 / years) - 1) * 100;
  const volatility = standardDeviation(dailyReturns) * Math.sqrt(252) * 100;
  const meanDailyReturn = average(dailyReturns) || 0;
  const dailyDeviation = standardDeviation(dailyReturns);
  const sharpe = dailyDeviation > 0 ? (meanDailyReturn / dailyDeviation) * Math.sqrt(252) : 0;

  return {
    id,
    label,
    totalReturnPercent: round((equity - 1) * 100, 1),
    annualizedReturnPercent: round(annualizedReturn, 1),
    benchmarkAnnualizedReturnPercent: round(benchmarkAnnualizedReturnPercent, 1),
    excessAnnualizedReturnPercent: round(annualizedReturn - benchmarkAnnualizedReturnPercent, 1),
    maxDrawdownPercent: round(maxDrawdownPercent(equityCurve), 1),
    volatilityPercent: round(volatility, 1),
    sharpe: round(sharpe, 2),
    trades: entries,
    winRatePercent: completedTrades ? round((wins / completedTrades) * 100, 1) : 0,
    exposurePercent: round((investedDays / Math.max(1, dailyReturns.length)) * 100, 1),
    transactionCostPercent: TRANSACTION_COST * 100,
    observations: dailyReturns.length,
  };
}

function buildBacktests(closes) {
  if (closes.length < 220) return [];
  const sma20 = rollingMovingAverage(closes, 20);
  const sma50 = rollingMovingAverage(closes, 50);
  const sma200 = rollingMovingAverage(closes, 200);
  const rsi14 = rollingRsi(closes, 14);
  const years = (closes.length - 1) / 252;
  const benchmarkAnnualized = ((closes.at(-1) / closes[0]) ** (1 / Math.max(years, 1 / 252)) - 1) * 100;

  return [
    strategyMetrics('buy-hold', 'Compra e mantieni', closes, () => true, benchmarkAnnualized),
    strategyMetrics(
      'trend-50-200',
      'Trend 50/200',
      closes,
      (index) => Number.isFinite(sma50[index]) && Number.isFinite(sma200[index]) && sma50[index] > sma200[index] && closes[index] > sma200[index],
      benchmarkAnnualized,
    ),
    strategyMetrics(
      'tactical-20-50',
      'Tattica 20/50 + RSI',
      closes,
      (index) => Number.isFinite(sma20[index]) && Number.isFinite(sma50[index]) && Number.isFinite(rsi14[index]) && sma20[index] > sma50[index] && closes[index] > sma20[index] && rsi14[index] >= 45 && rsi14[index] <= 72,
      benchmarkAnnualized,
    ),
  ];
}

async function fetchTechnical(definition) {
  const [symbol, yahooSymbol, name, assetClass, market] = definition;
  const encoded = encodeURIComponent(yahooSymbol);
  let data;
  let sourceHost = 'query1.finance.yahoo.com';
  try {
    data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2y&events=div%2Csplits&includeAdjustedClose=true`);
  } catch {
    sourceHost = 'query2.finance.yahoo.com';
    data = await fetchJson(`https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2y&events=div%2Csplits&includeAdjustedClose=true`);
  }
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(data?.chart?.error?.description || 'Storico vuoto');
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || quote.close || [];
  const rows = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = Number(adjusted[index] ?? quote.close?.[index]);
    const high = Number(quote.high?.[index] ?? close);
    const low = Number(quote.low?.[index] ?? close);
    if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(high) || !Number.isFinite(low)) continue;
    rows.push({ timestamp: Number(timestamps[index]), close, high, low });
  }
  if (rows.length < 60) throw new Error(`Solo ${rows.length} osservazioni valide`);

  const closes = rows.map((row) => row.close);
  const price = closes.at(-1);
  const sma20 = movingAverage(closes, 20);
  const sma50 = movingAverage(closes, 50);
  const sma200 = movingAverage(closes, 200);
  const rsi14 = rsiAt(closes, 14);
  const volatility20 = annualizedVolatility(closes, 20);
  const atr14 = atrPercent(rows, 14);
  const oneMonth = returnPercent(closes, 21);
  const threeMonth = returnPercent(closes, 63);
  const sixMonth = returnPercent(closes, 126);
  const oneYear = returnPercent(closes, 252);
  const oneYearCloses = closes.slice(-252);
  const high52 = Math.max(...oneYearCloses);
  const distance52 = ((price / high52) - 1) * 100;
  const maxDrawdown = maxDrawdownPercent(oneYearCloses);

  let trend = 50;
  if (Number.isFinite(sma20)) trend += price > sma20 ? 7 : -7;
  if (Number.isFinite(sma50)) trend += price > sma50 ? 11 : -11;
  if (Number.isFinite(sma200)) trend += price > sma200 ? 17 : -17;
  if (Number.isFinite(sma50) && Number.isFinite(sma200)) trend += sma50 > sma200 ? 12 : -12;
  trend = Math.round(clamp(trend));

  const momentum = Math.round(clamp(
    50 +
    clamp(oneMonth, -20, 20) * 0.65 +
    clamp(threeMonth, -35, 35) * 0.35 +
    clamp(sixMonth, -60, 60) * 0.2 +
    clamp(oneYear, -80, 100) * 0.08,
  ));

  const classRisk = assetClass === 'Criptovaluta' ? 58 : /Biotech/.test(assetClass) ? 48 : assetClass === 'ETF' ? 22 : assetClass === 'Obbligazioni' ? 20 : assetClass === 'Materie prime' ? 28 : 32;
  const risk = Math.round(clamp(
    classRisk +
    clamp(volatility20, 0, 120) * 0.42 +
    Math.abs(clamp(maxDrawdown, -80, 0)) * 0.28 +
    clamp(atr14, 0, 15) * 1.2,
  ));
  const technical = Math.round(clamp(trend * 0.45 + momentum * 0.35 + (100 - risk) * 0.2));
  const availableIndicators = [price, sma20, sma50, sma200, rsi14, volatility20, atr14, oneMonth, threeMonth, sixMonth, oneYear, maxDrawdown];
  const dataCompleteness = Math.round((availableIndicators.filter(Number.isFinite).length / availableIndicators.length) * 100);
  const observedAt = rows.at(-1)?.timestamp ? new Date(rows.at(-1).timestamp * 1000).toISOString() : now.toISOString();

  return {
    symbol,
    yahooSymbol,
    name,
    assetClass,
    market,
    currency: result.meta?.currency || 'USD',
    observedAt,
    source: `Yahoo Finance chart (${sourceHost})`,
    status: dataCompleteness >= 80 ? 'operativo' : 'parziale',
    price: round(price, price < 1 ? 6 : 2),
    returns: {
      oneMonthPercent: round(oneMonth, 1),
      threeMonthPercent: round(threeMonth, 1),
      sixMonthPercent: round(sixMonth, 1),
      oneYearPercent: round(oneYear, 1),
    },
    indicators: {
      sma20: round(sma20, 2),
      sma50: round(sma50, 2),
      sma200: round(sma200, 2),
      rsi14: round(rsi14, 1),
      volatility20Percent: round(volatility20, 1),
      atr14Percent: round(atr14, 1),
      distance52WeekHighPercent: round(distance52, 1),
      maxDrawdown1YPercent: round(maxDrawdown, 1),
    },
    scores: { trend, momentum, risk, technical, dataCompleteness },
    signal: calculateSignal(technical, risk),
    reasons: buildReasons({ price, sma20, sma50, sma200, rsi14, oneMonth, sixMonth, maxDrawdown }),
    warnings: rows.length < 252 ? ['Storico inferiore a un anno di borsa completo.'] : [],
    strategies: buildBacktests(closes),
  };
}

function isPreCommercial(company) {
  const sector = String(company?.sector || '').toLowerCase();
  const revenue = Number(company?.financials?.revenue || 0);
  const netIncome = Number(company?.financials?.netIncome);
  return /biotecnologia|farmaci|gene editing|scoperta di farmaci/.test(sector) && netIncome < 0 && revenue < 250_000_000;
}

function valuationFor(company, technical) {
  if (!company) return {
    status: 'non applicabile', method: 'Nessuna analisi fondamentale collegata', score: 50, confidence: technical.scores.dataCompleteness,
    rationale: ['ETF, materie prime e criptovalute richiedono metodi di valutazione diversi dai multipli societari.'], warnings: [],
  };
  if (isPreCommercial(company)) return {
    status: 'non applicabile', method: 'Società pre-commerciale', score: 35, confidence: company.scores.dataCompleteness,
    rationale: ['Utili e P/E non sono significativi prima della maturità commerciale.', 'La valutazione dipende da pipeline, probabilità cliniche, cassa e diluizione.'],
    warnings: ['Non viene prodotto un fair value tradizionale.'],
  };
  const eps = Number(company.financials?.dilutedEps);
  const currentPrice = Number(technical.price);
  const financialCurrency = company.financials?.currency;
  const technicalCurrency = technical.currency;
  if (!Number.isFinite(eps) || eps <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) return {
    status: 'dati insufficienti', method: 'Multiplo utili normalizzato', score: 45, confidence: company.scores.dataCompleteness,
    rationale: ['EPS positivo o prezzo corrente non disponibili.'], warnings: ['Valutazione non calcolabile con sufficiente affidabilità.'],
  };
  if (financialCurrency && technicalCurrency && financialCurrency !== technicalCurrency) return {
    status: 'non confrontabile', method: 'Multiplo utili normalizzato', currency: technicalCurrency, currentPrice, score: 50,
    confidence: Math.min(company.scores.dataCompleteness, technical.scores.dataCompleteness),
    rationale: [`Il prezzo è espresso in ${technicalCurrency}, mentre l’EPS SEC è espresso in ${financialCurrency}.`],
    warnings: ['È necessaria una conversione ADR/valuta verificata prima di calcolare il fair value.'],
  };
  const growth = Number(company.financials?.revenueGrowth3YPercent || 0);
  const quality = Number(company.scores?.quality || 50);
  const stageBase = company.businessStage === 'crescita' || growth >= 10 ? 23 : 18;
  const targetPe = clamp(stageBase + clamp(growth, -10, 35) * 0.35 + (quality - 60) * 0.08, 11, 40);
  const currentPe = currentPrice / eps;
  const fairBase = eps * targetPe;
  const fairLow = fairBase * 0.8;
  const fairHigh = fairBase * 1.2;
  const upside = ((fairBase / currentPrice) - 1) * 100;
  const score = Math.round(clamp(50 + clamp(upside, -60, 60) * 0.65 - Math.max(0, currentPe - targetPe) * 0.35, 5, 95));
  const confidence = Math.round((company.scores.dataCompleteness * 0.65 + technical.scores.dataCompleteness * 0.35));
  return {
    status: 'disponibile',
    method: 'Multiplo utili normalizzato per crescita e qualità',
    currency: technicalCurrency,
    currentPrice: round(currentPrice, 2),
    priceToEarnings: round(currentPe, 1),
    targetPriceToEarnings: round(targetPe, 1),
    fairValueLow: round(fairLow, 2),
    fairValueBase: round(fairBase, 2),
    fairValueHigh: round(fairHigh, 2),
    upsideBasePercent: round(upside, 1),
    score,
    confidence,
    rationale: [
      `P/E corrente indicativo ${round(currentPe, 1)} contro multiplo obiettivo ${round(targetPe, 1)}.`,
      `Fair value centrale indicativo ${round(fairBase, 2)} ${technicalCurrency}.`,
      `Intervallo prudenziale ${round(fairLow, 2)}–${round(fairHigh, 2)} ${technicalCurrency}.`,
    ],
    warnings: ['Il fair value è uno scenario quantitativo, non una previsione certa del prezzo.'],
  };
}

function unifiedAsset(technical, company, snapshotQuality) {
  const preCommercial = company && isPreCommercial(company);
  const fundamentalScore = company ? Number(company.scores?.overall || 0) : undefined;
  const technicalScore = technical.scores.technical;
  const valuation = valuationFor(company, technical);
  const valuationScore = valuation.status === 'disponibile' ? valuation.score : undefined;
  const completeness = Math.round(average([
    technical.scores.dataCompleteness,
    company?.scores?.dataCompleteness,
    valuation.confidence,
  ].filter(Number.isFinite)) || technical.scores.dataCompleteness);
  let unified;
  if (preCommercial) {
    const runway = Number(company.financials?.cashRunwayYears);
    const runwayScore = !Number.isFinite(runway) ? 25 : runway >= 2 ? 75 : runway >= 1 ? 50 : 20;
    unified = Math.min(58, fundamentalScore * 0.25 + technicalScore * 0.35 + (100 - technical.scores.risk) * 0.2 + runwayScore * 0.2);
  } else if (Number.isFinite(fundamentalScore)) {
    unified = Number.isFinite(valuationScore)
      ? fundamentalScore * 0.42 + technicalScore * 0.3 + valuationScore * 0.18 + completeness * 0.1
      : fundamentalScore * 0.5 + technicalScore * 0.32 + completeness * 0.18;
  } else {
    unified = technicalScore * 0.65 + (100 - technical.scores.risk) * 0.25 + snapshotQuality * 0.1;
  }
  unified -= Math.max(0, technical.scores.risk - 65) * 0.18;
  if (technical.assetClass === 'Criptovaluta') unified = Math.min(unified, 62);
  unified = Math.round(clamp(unified));
  const confidence = Math.round(clamp(completeness * 0.75 + snapshotQuality * 0.25));
  let decision;
  if (preCommercial) decision = 'SPECULATIVA';
  else if (unified >= (technical.assetClass === 'ETF' ? 72 : 76) && confidence >= 70 && technical.scores.risk <= 60 && ['FORTE', 'POSITIVO'].includes(technical.signal) && !(valuation.status === 'disponibile' && Number(valuation.upsideBasePercent) < -10)) decision = 'ACCUMULA';
  else if (unified >= 63 && technical.scores.risk <= 72) decision = 'MANTIENI';
  else if (unified >= 48) decision = 'ATTENDI';
  else decision = 'EVITA';
  const reason = decision === 'ACCUMULA'
    ? 'Fondamentali, trend, rischio e valutazione offrono una convergenza positiva; eventuale ingresso solo graduale.'
    : decision === 'MANTIENI'
      ? 'Tesi complessivamente valida, ma il margine di sicurezza o il momentum non giustificano un aumento deciso.'
      : decision === 'SPECULATIVA'
        ? 'Società pre-commerciale o asset ad alta incertezza: posizione eventuale molto piccola e subordinata a catalizzatori verificati.'
        : decision === 'ATTENDI'
          ? 'Il quadro non è abbastanza forte o coerente per un nuovo ingresso.'
          : 'Rapporto rischio/rendimento insufficiente secondo i dati disponibili.';
  return {
    symbol: technical.symbol,
    name: company?.name || technical.name,
    assetClass: technical.assetClass,
    businessStage: preCommercial ? 'pre-commerciale' : company?.businessStage,
    price: technical.price,
    currency: technical.currency,
    fundamentalScore,
    technicalScore,
    valuationScore,
    riskScore: technical.scores.risk,
    dataCompleteness: completeness,
    unifiedScore: unified,
    confidence,
    decision,
    reason,
    targetWeightPercent: 0,
    targetAmountEuro: 0,
    valuation,
    technical,
    warnings: [...new Set([...(technical.warnings || []), ...(company?.warnings || []), ...(valuation.warnings || [])])],
  };
}

function portfolioBuckets(snapshot) {
  const risk = Number(snapshot?.pulse?.risk ?? 55);
  const quality = Number(snapshot?.dataQuality ?? snapshot?.pulse?.confidence ?? 50);
  if (risk >= 65 || quality < 45) return { core: 55, growth: 15, speculative: 5, reserve: 25 };
  if (Number(snapshot?.pulse?.opportunity) >= 65 && risk <= 50 && quality >= 70) return { core: 50, growth: 35, speculative: 5, reserve: 10 };
  return { core: 55, growth: 25, speculative: 5, reserve: 15 };
}

function allocateAssets(assets, buckets) {
  let reserve = buckets.reserve;
  const distribute = (candidates, bucketPercent, cap) => {
    if (!candidates.length || bucketPercent <= 0) {
      reserve += bucketPercent;
      return;
    }
    let remaining = bucketPercent;
    const active = [...candidates];
    while (remaining > 0.001 && active.length) {
      const share = remaining / active.length;
      let allocatedThisRound = 0;
      for (let index = active.length - 1; index >= 0; index -= 1) {
        const asset = active[index];
        const room = cap - asset.targetWeightPercent;
        const addition = Math.min(share, room);
        if (addition > 0) {
          asset.targetWeightPercent += addition;
          allocatedThisRound += addition;
        }
        if (room - addition <= 0.001) active.splice(index, 1);
      }
      if (allocatedThisRound <= 0.001) break;
      remaining -= allocatedThisRound;
    }
    reserve += Math.max(0, remaining);
  };

  const eligible = assets.filter((asset) => asset.decision !== 'EVITA');
  const core = eligible.filter((asset) => ['ETF', 'Obbligazioni', 'Materie prime'].includes(asset.assetClass)).slice(0, 5);
  const growth = eligible.filter((asset) => !['ETF', 'Obbligazioni', 'Materie prime', 'Criptovaluta'].includes(asset.assetClass) && asset.businessStage !== 'pre-commerciale').slice(0, 6);
  const speculative = eligible.filter((asset) => asset.businessStage === 'pre-commerciale' || asset.assetClass === 'Criptovaluta').slice(0, 2);
  distribute(core, buckets.core, 25);
  distribute(growth, buckets.growth, 8);
  distribute(speculative, buckets.speculative, 2.5);
  for (const asset of assets) {
    asset.targetWeightPercent = round(asset.targetWeightPercent, 1) || 0;
    asset.targetAmountEuro = Math.round((CAPITAL_EURO * asset.targetWeightPercent) / 100);
  }
  return { reserve: round(reserve, 1) || 0 };
}

const previous = await readJson(reportPath, { assets: [] });
const fundamental = await readJson(fundamentalPath, { companies: [] });
const snapshot = await readJson(snapshotPath, {});
const previousBySymbol = new Map((previous.assets || []).map((asset) => [asset.symbol, asset]));
const technicalAssets = [];
const failures = [];

for (let index = 0; index < universe.length; index += 4) {
  const batch = universe.slice(index, index + 4);
  const results = await Promise.allSettled(batch.map(fetchTechnical));
  results.forEach((result, offset) => {
    const symbol = batch[offset][0];
    if (result.status === 'fulfilled') technicalAssets.push(result.value);
    else {
      failures.push(`${symbol}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      const old = previousBySymbol.get(symbol)?.technical;
      if (old) technicalAssets.push({ ...old, status: 'parziale', warnings: [...new Set([...(old.warnings || []), 'Ultimo ciclo prezzi fallito: riutilizzato il dato precedente.'])] });
    }
  });
  if (index + 4 < universe.length) await sleep(500);
}

const companies = new Map((fundamental.companies || []).map((company) => [company.ticker, company]));
const snapshotQuality = Number(snapshot.dataQuality ?? snapshot.pulse?.confidence ?? 50);
const assets = technicalAssets
  .map((technical) => unifiedAsset(technical, companies.get(technical.symbol), snapshotQuality))
  .sort((left, right) => right.unifiedScore - left.unifiedScore || left.riskScore - right.riskScore);
const buckets = portfolioBuckets(snapshot);
const allocation = allocateAssets(assets, buckets);
const validated = assets.filter((asset) => asset.technical.status !== 'errore').length;
const coveragePercent = Math.round((validated / universe.length) * 100);
const averageUnifiedScore = Math.round(average(assets.map((asset) => asset.unifiedScore)) || 0);
const technicalCompleteness = average(assets.map((asset) => asset.technical.scores.dataCompleteness)) || 0;
const dataQuality = Math.round(clamp(technicalCompleteness * 0.55 + Number(fundamental.coveragePercent || 0) * 0.25 + snapshotQuality * 0.2));
const state = coveragePercent >= 85 ? 'operativo' : assets.length ? 'parziale' : 'errore';
const report = {
  version: Number(previous.version || 0) + 1,
  generatedAt: now.toISOString(),
  mode: coveragePercent >= 85 && dataQuality >= 65 ? 'live' : assets.length ? 'partial' : 'bootstrap',
  capitalEuro: CAPITAL_EURO,
  source: {
    name: 'Fenice Technical, Valuation and Strategy Engine',
    state,
    detail: `${validated}/${universe.length} strumenti tecnici validati; ${assets.filter((asset) => Number.isFinite(asset.fundamentalScore)).length} collegati ai fondamentali.`,
    ...(assets.length ? { lastSuccessAt: now.toISOString() } : {}),
  },
  universeSize: universe.length,
  assetCount: assets.length,
  coveragePercent,
  averageUnifiedScore,
  dataQuality,
  marketRegime: snapshot.regime || snapshot.pulse?.verdict || 'NON DETERMINATO',
  methodology: [
    'Storico giornaliero fino a due anni, indicatori calcolati solo con dati disponibili fino alla data osservata.',
    'Trend: medie mobili 20, 50 e 200 giorni. Momentum: rendimenti a 1, 3, 6 e 12 mesi.',
    'Rischio: volatilità, ATR, drawdown e classe dello strumento.',
    'Backtest senza look-ahead: il segnale del giorno precedente determina l’esposizione del giorno successivo.',
    `Costi simulati pari allo ${(TRANSACTION_COST * 100).toFixed(1)}% per ogni cambio di posizione.`,
    'Valutazione relativa solo quando prezzo ed EPS sono positivi e nella stessa valuta.',
    'Società pre-commerciali valutate separatamente e sempre classificate come speculative.',
    'L’allocazione è una proposta di studio: Fenice non invia ordini al broker.',
  ],
  portfolio: [
    { id: 'core', label: 'Nucleo diversificato', targetPercent: buckets.core, targetAmountEuro: Math.round(CAPITAL_EURO * buckets.core / 100), rationale: 'ETF, obbligazioni e strumenti ampi con limiti di concentrazione.' },
    { id: 'growth', label: 'Crescita selezionata', targetPercent: buckets.growth, targetAmountEuro: Math.round(CAPITAL_EURO * buckets.growth / 100), rationale: 'Azioni mature o in crescita con conferma fondamentale e tecnica.' },
    { id: 'speculative', label: 'Opportunità speculative', targetPercent: buckets.speculative, targetAmountEuro: Math.round(CAPITAL_EURO * buckets.speculative / 100), rationale: 'Biotech pre-commerciali e crypto con tetto massimo rigoroso.' },
    { id: 'reserve', label: 'Riserva strategica', targetPercent: allocation.reserve, targetAmountEuro: Math.round(CAPITAL_EURO * allocation.reserve / 100), rationale: 'Liquidità non assegnata o liberata dai limiti di rischio e concentrazione.' },
  ],
  assets,
  warnings: [
    ...(failures.length ? [`Dati tecnici non acquisiti per ${failures.length} strumenti: ${failures.slice(0, 4).join('; ')}.`] : []),
    'I prezzi gratuiti possono essere ritardati e non sostituiscono un feed ufficiale di borsa.',
    'I risultati dei backtest sono storici, includono ipotesi semplificate e non garantiscono rendimenti futuri.',
    'Fair value e punteggi sono scenari quantitativi da sottoporre a verifica umana.',
  ],
};

await mkdir(historyDir, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const historyDate = now.toISOString().slice(0, 10);
await writeFile(path.join(historyDir, `${historyDate}-terminal.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Fenice Terminal: ${assets.length}/${universe.length} assets, coverage ${coveragePercent}%, quality ${dataQuality}, score ${averageUnifiedScore}.`);
