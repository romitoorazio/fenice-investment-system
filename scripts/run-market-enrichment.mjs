import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'latest-snapshot.json');
const now = new Date();
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const universe = [
  ['SPY', 'S&P 500 ETF', 'ETF'],
  ['QQQ', 'Nasdaq 100 ETF', 'ETF'],
  ['IWM', 'Russell 2000 ETF', 'ETF'],
  ['GLD', 'Oro ETF', 'Materie prime'],
  ['TLT', 'Treasury 20+ Year ETF', 'Obbligazioni'],
  ['AAPL', 'Apple', 'Azioni'],
  ['MSFT', 'Microsoft', 'Azioni'],
  ['NVDA', 'NVIDIA', 'Azioni'],
  ['GOOGL', 'Alphabet', 'Azioni'],
  ['AMZN', 'Amazon', 'Azioni'],
  ['META', 'Meta Platforms', 'Azioni'],
  ['TSM', 'Taiwan Semiconductor', 'Semiconduttori'],
  ['ASML', 'ASML Holding', 'Semiconduttori'],
  ['CRSP', 'CRISPR Therapeutics', 'Biotech'],
  ['RXRX', 'Recursion Pharmaceuticals', 'AI Biotech'],
  ['NTLA', 'Intellia Therapeutics', 'Biotech'],
];

const stableSymbols = new Set(['USDT', 'USDC', 'DAI', 'USDE', 'USDS', 'USD1', 'USDG', 'USYC', 'PYUSD', 'FDUSD', 'TUSD', 'USDP', 'RLUSD', 'EURC', 'EURT']);
const majorCrypto = new Set(['BTC', 'ETH']);
const establishedCrypto = new Set(['SOL', 'BNB', 'LINK', 'XRP', 'ADA', 'AVAX', 'DOT']);
const speculativeCrypto = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK']);
const megaCaps = new Set(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSM', 'ASML']);

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 FeniceInvestmentSystem/2.1',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function scoreTraditional(symbol, assetClass, changePercent = 0) {
  const base = assetClass === 'ETF'
    ? 63
    : assetClass === 'Semiconduttori'
      ? 61
      : assetClass === 'Azioni'
        ? (megaCaps.has(symbol) ? 60 : 56)
        : assetClass === 'AI Biotech'
          ? 55
          : assetClass === 'Biotech'
            ? 51
            : assetClass === 'Obbligazioni'
              ? 57
              : 56;
  const riskBase = assetClass === 'Biotech' || assetClass === 'AI Biotech'
    ? 69
    : assetClass === 'Semiconduttori'
      ? 58
      : assetClass === 'Azioni'
        ? 54
        : assetClass === 'ETF'
          ? 44
          : 48;
  return {
    score: Math.round(clamp(base + clamp(changePercent, -6, 6) * 1.4, 30, 78)),
    risk: Math.round(clamp(riskBase + Math.abs(changePercent) * 2.2, 30, 90)),
  };
}

function scoreCrypto(item) {
  const symbol = String(item.symbol || '').toUpperCase();
  const name = String(item.name || '').toLowerCase();
  const change = Number(item.changePercent || 0);
  if (stableSymbols.has(symbol) || /stablecoin|global dollar|paypal usd/.test(name)) {
    return { ...item, classification: 'stablecoin', score: 15, risk: Math.max(42, Number(item.risk) || 42) };
  }
  const base = majorCrypto.has(symbol) ? 51 : establishedCrypto.has(symbol) ? 46 : speculativeCrypto.has(symbol) ? 36 : 42;
  const ceiling = majorCrypto.has(symbol) ? 62 : establishedCrypto.has(symbol) ? 56 : speculativeCrypto.has(symbol) ? 46 : 52;
  const riskFloor = majorCrypto.has(symbol) ? 62 : establishedCrypto.has(symbol) ? 67 : speculativeCrypto.has(symbol) ? 80 : 72;
  return {
    ...item,
    score: Math.round(clamp(base + clamp(change, -8, 8) * 1.1, 22, ceiling)),
    risk: Math.round(clamp(Math.max(riskFloor, Number(item.risk) || riskFloor), 45, 95)),
  };
}

async function fetchYahooReading(symbol, name, assetClass) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=15m&range=5d&events=div%2Csplits`;
  const data = await fetchJson(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(data?.chart?.error?.description || 'Risposta prezzi vuota');
  const meta = result.meta || {};
  const closes = result.indicators?.quote?.[0]?.close || [];
  const finiteCloses = closes.filter(value => Number.isFinite(value));
  const price = Number(meta.regularMarketPrice ?? finiteCloses.at(-1));
  const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? finiteCloses.at(-2));
  if (!Number.isFinite(price)) throw new Error('Prezzo non valido');
  const changePercent = Number.isFinite(previousClose) && previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;
  const scored = scoreTraditional(symbol, assetClass, changePercent);
  const observedAt = meta.regularMarketTime
    ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
    : result.timestamp?.length
      ? new Date(Number(result.timestamp.at(-1)) * 1000).toISOString()
      : now.toISOString();
  return {
    symbol,
    name,
    assetClass,
    market: meta.exchangeName || 'Mercato USA',
    price,
    currency: meta.currency || 'USD',
    changePercent: Math.round(changePercent * 100) / 100,
    source: 'Yahoo Finance chart fallback',
    observedAt,
    ...scored,
  };
}

async function collectTraditional() {
  const readings = [];
  const failures = [];
  for (let index = 0; index < universe.length; index += 4) {
    const batch = universe.slice(index, index + 4);
    const results = await Promise.allSettled(batch.map(([symbol, name, assetClass]) => fetchYahooReading(symbol, name, assetClass)));
    results.forEach((result, offset) => {
      const symbol = batch[offset][0];
      if (result.status === 'fulfilled') readings.push(result.value);
      else failures.push(`${symbol}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    });
    if (index + 4 < universe.length) await sleep(450);
  }
  return { readings, failures };
}

function sourcePriority(source) {
  if (source === 'Alpha Vantage') return 5;
  if (source === 'Yahoo Finance chart fallback') return 4;
  if (source === 'Stooq public fallback' || source === 'Stooq fallback') return 2;
  return 1;
}

function normalizeMarkets(markets) {
  const bySymbol = new Map();
  for (const raw of markets) {
    const symbol = String(raw.symbol || '').toUpperCase();
    if (!symbol) continue;
    let item = { ...raw, symbol };
    if (item.assetClass === 'Criptovaluta') item = scoreCrypto(item);
    else {
      const scored = scoreTraditional(symbol, item.assetClass, Number(item.changePercent || 0));
      item = { ...item, ...scored };
    }
    const existing = bySymbol.get(symbol);
    if (!existing || sourcePriority(item.source) > sourcePriority(existing.source) || (sourcePriority(item.source) === sourcePriority(existing.source) && item.score > existing.score)) {
      bySymbol.set(symbol, item);
    }
  }
  return [...bySymbol.values()].sort((a, b) => {
    if (a.classification === 'stablecoin' && b.classification !== 'stablecoin') return 1;
    if (b.classification === 'stablecoin' && a.classification !== 'stablecoin') return -1;
    return b.score - a.score || a.risk - b.risk;
  });
}

function updateProvider(snapshot, value) {
  const index = snapshot.providers.findIndex(item => item.id === value.id);
  if (index >= 0) snapshot.providers[index] = { ...snapshot.providers[index], ...value };
  else snapshot.providers.push(value);
}

function simplifyWarnings(snapshot) {
  const gdelt = snapshot.providers.find(item => item.id === 'gdelt');
  const sec = snapshot.providers.find(item => item.id === 'sec');
  const cleaned = (snapshot.warnings || []).filter(warning => {
    const text = String(warning);
    return !text.startsWith('GDELT') && !text.startsWith('SEC EDGAR') && !text.includes('solo crypto') && !text.includes('Copertura di mercato concentrata');
  });
  if (gdelt?.state === 'errore') cleaned.push('GDELT è temporaneamente limitato; notizie e rischi continuano a essere coperti dalle altre fonti operative.');
  if (sec?.state === 'errore') cleaned.push('SEC EDGAR non è raggiungibile dall’ultimo ciclo GitHub; i segnali regolamentari sono quindi incompleti.');
  snapshot.warnings = [...new Set(cleaned)];
}

function recalculateQuality(snapshot) {
  const providers = snapshot.providers || [];
  const providerWeight = { operativo: 1, parziale: 0.55, errore: 0, 'non configurato': 0 };
  const providerScore = providers.length ? providers.reduce((sum, provider) => sum + (providerWeight[provider.state] ?? 0.1), 0) / providers.length : 0;
  const traditional = snapshot.markets.filter(item => item.assetClass !== 'Criptovaluta').length;
  const nonStableCrypto = snapshot.markets.filter(item => item.assetClass === 'Criptovaluta' && item.classification !== 'stablecoin').length;
  const macro = (snapshot.macro || []).length;
  const fresh = snapshot.markets.filter(item => {
    const date = new Date(item.observedAt || 0).getTime();
    return Number.isFinite(date) && Date.now() - date <= 36 * 60 * 60 * 1000;
  }).length;
  const marketCoverage = clamp((traditional / 16) * 70 + (Math.min(nonStableCrypto, 12) / 12) * 30, 0, 100) / 100;
  const macroCoverage = clamp(macro / 7, 0, 1);
  const freshness = snapshot.markets.length ? clamp(fresh / snapshot.markets.length, 0, 1) : 0;
  const quality = Math.round(clamp((providerScore * 0.42 + marketCoverage * 0.28 + macroCoverage * 0.15 + freshness * 0.15) * 100));
  snapshot.dataQuality = quality;
  snapshot.pulse = snapshot.pulse || {};
  snapshot.pulse.confidence = quality;
  snapshot.mode = quality >= 75 ? 'live' : quality >= 50 ? 'partial' : 'bootstrap';
  snapshot.freshness = {
    generatedAt: snapshot.generatedAt,
    checkedAt: now.toISOString(),
    freshReadings: fresh,
    totalReadings: snapshot.markets.length,
    status: freshness >= 0.75 ? 'near-real-time' : freshness >= 0.45 ? 'aggiornato' : 'stale',
  };
}

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
snapshot.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
snapshot.markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];
snapshot.warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];

const { readings, failures } = await collectTraditional();
snapshot.markets.push(...readings);
updateProvider(snapshot, {
  id: 'market-enrichment',
  name: 'Market Enrichment',
  state: readings.length >= 12 ? 'operativo' : readings.length ? 'parziale' : 'errore',
  coverage: ['ETF', 'azioni globali', 'semiconduttori', 'biotech', 'oro', 'obbligazioni'],
  detail: `${readings.length}/${universe.length} strumenti tradizionali acquisiti nel secondo canale prezzi.`,
  ...(readings.length ? { lastSuccessAt: now.toISOString() } : {}),
});

snapshot.markets = normalizeMarkets(snapshot.markets);
simplifyWarnings(snapshot);
if (failures.length && readings.length < 12) snapshot.warnings.push(`Secondo canale prezzi parziale: ${failures.slice(0, 3).join('; ')}.`);
recalculateQuality(snapshot);
snapshot.reliability = {
  ...(snapshot.reliability || {}),
  marketEnrichmentAt: now.toISOString(),
  marketEnrichmentReadings: readings.length,
  traditionalMarkets: snapshot.markets.filter(item => item.assetClass !== 'Criptovaluta').length,
  cryptoMarkets: snapshot.markets.filter(item => item.assetClass === 'Criptovaluta' && item.classification !== 'stablecoin').length,
  stablecoinsExcludedFromRanking: snapshot.markets.filter(item => item.classification === 'stablecoin').length,
  cadence: 'hourly',
};
snapshot.headline = `${snapshot.markets.length} strumenti, ${(snapshot.discoveries || []).length} segnali emergenti, ${(snapshot.macro || []).length} indicatori macro e ${snapshot.providers.filter(item => item.state === 'operativo').length} fonti operative.`;
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
console.log('Fenice market enrichment completed', { readings: readings.length, quality: snapshot.dataQuality, freshness: snapshot.freshness.status });
