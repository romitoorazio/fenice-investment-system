import { readFile, writeFile } from "node:fs/promises";

const snapshotPath = "data/latest-snapshot.json";
const qualityPath = "data/intelligence-quality.json";
const timeoutMs = 10_000;

const pairs = {
  BTC: { coinbase: "BTC-USD", kraken: "XBTUSD" },
  ETH: { coinbase: "ETH-USD", kraken: "ETHUSD" },
  SOL: { coinbase: "SOL-USD", kraken: "SOLUSD" },
  XRP: { coinbase: "XRP-USD", kraken: "XRPUSD" },
  ADA: { coinbase: "ADA-USD", kraken: "ADAUSD" },
  DOGE: { coinbase: "DOGE-USD", kraken: "DOGEUSD" },
  LTC: { coinbase: "LTC-USD", kraken: "LTCUSD" },
  BCH: { coinbase: "BCH-USD", kraken: "BCHUSD" },
};

function canonicalSymbol(value) {
  return String(value || "").trim().toUpperCase().split(/[.:-]/)[0].replace(/[^A-Z0-9]/g, "");
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

async function json(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/3.5 exchange-validation" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function coinbase(symbol, product) {
  const data = await json(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`);
  const price = finite(data?.price);
  if (!price) throw new Error(`Coinbase invalid ticker for ${symbol}`);
  return { symbol, source: "Coinbase Exchange public market data", price, currency: "USD", observedAt: data?.time || new Date().toISOString() };
}

async function kraken(symbol, pair) {
  const data = await json(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`);
  if (Array.isArray(data?.error) && data.error.length) throw new Error(`Kraken ${data.error.join(",")}`);
  const row = Object.values(data?.result || {})[0];
  const price = finite(row?.c?.[0]);
  if (!price) throw new Error(`Kraken invalid ticker for ${symbol}`);
  return { symbol, source: "Kraken Spot public market data", price, currency: "USD", observedAt: new Date().toISOString() };
}

function primaryCryptoEvidence(snapshot) {
  const candidates = [
    ...(Array.isArray(snapshot.marketObservations) ? snapshot.marketObservations : []),
    ...(Array.isArray(snapshot.markets) ? snapshot.markets : []),
  ];
  const evidence = [];
  for (const item of candidates) {
    if (item?.assetClass !== "Criptovaluta") continue;
    const symbol = canonicalSymbol(item.symbol);
    if (!pairs[symbol]) continue;
    const price = finite(item.price);
    if (!price) continue;
    evidence.push({
      symbol,
      source: String(item.source || "Fenice primary crypto source"),
      price,
      currency: String(item.currency || "USD").toUpperCase(),
      observedAt: item.observedAt,
    });
  }
  return evidence;
}

function buildChecks(evidence) {
  const grouped = new Map();
  for (const item of evidence) {
    const list = grouped.get(item.symbol) || [];
    if (!list.some((existing) => existing.source === item.source)) list.push(item);
    grouped.set(item.symbol, list);
  }
  const checks = [];
  for (const [symbol, rows] of grouped) {
    if (rows.length < 2) continue;
    const prices = rows.map((row) => row.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const midpoint = (min + max) / 2 || 1;
    const spreadPercent = ((max - min) / midpoint) * 100;
    checks.push({
      instrument: `${symbol}:USD`,
      sources: rows.map((row) => row.source),
      observations: rows.length,
      minPrice: min,
      maxPrice: max,
      spreadPercent: Number(spreadPercent.toFixed(4)),
      status: spreadPercent <= 0.75 ? "confermato" : spreadPercent <= 2 ? "attenzione" : "divergente",
    });
  }
  return checks.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

async function main() {
  const [snapshot, quality] = await Promise.all([
    readFile(snapshotPath, "utf8").then(JSON.parse),
    readFile(qualityPath, "utf8").then(JSON.parse),
  ]);
  const baseEvidence = primaryCryptoEvidence(snapshot);
  const symbols = [...new Set(baseEvidence.map((item) => item.symbol))].slice(0, 8);
  const tasks = [];
  for (const symbol of symbols) {
    const mapping = pairs[symbol];
    tasks.push(coinbase(symbol, mapping.coinbase));
    tasks.push(kraken(symbol, mapping.kraken));
  }
  const settled = await Promise.allSettled(tasks);
  const exchangeEvidence = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const evidence = [...baseEvidence, ...exchangeEvidence];
  const checks = buildChecks(evidence);
  const divergent = checks.filter((item) => item.status === "divergente").length;
  const confirmed = checks.filter((item) => item.status === "confermato").length;
  const sources = [...new Set(evidence.map((item) => item.source))];
  const sourceCounts = sources.map((source) => evidence.filter((item) => item.source === source).length);
  const concentration = evidence.length && sourceCounts.length ? Math.max(...sourceCounts) / evidence.length : 1;
  const confirmedRatio = checks.length ? confirmed / checks.length : 0;
  const grade = Math.max(0, Math.min(100, Math.round(
    20
      + Math.min(30, sources.length * 10)
      + Math.min(25, checks.length * 4)
      + confirmedRatio * 25
      - Math.min(30, divergent * 12)
      - (concentration > 0.6 ? 15 : concentration > 0.45 ? 8 : 0),
  )));

  const validation = {
    generatedAt: new Date().toISOString(),
    grade,
    sources: sources.sort(),
    sourceCount: sources.length,
    checkedInstruments: checks.length,
    confirmed,
    divergent,
    sourceConcentrationPercent: Math.round(concentration * 100),
    checks,
    exchangeObservations: exchangeEvidence.length,
    failedExchangeRequests: settled.filter((result) => result.status === "rejected").length,
    brokerNativeMarketDataPresent: false,
    executionGradeEligible: false,
    note: "Public exchange validation improves cross-checking but does not replace broker-native/licensed execution-grade market data for live trading.",
  };

  quality.exchangeMarketValidation = validation;
  quality.policy = {
    ...(quality.policy || {}),
    publicExchangeValidationRequired: true,
    brokerNativeMarketDataRequiredForLive: true,
  };
  snapshot.exchangeMarketValidation = validation;
  snapshot.warnings = [...new Set([
    ...(snapshot.warnings || []),
    ...(validation.grade < 90 ? ["Validazione prezzi exchange non ancora a livello richiesto per il live."] : []),
    "Il live richiede dati broker-native/licenziati: le fonti pubbliche restano solo validazione indipendente.",
  ])];

  await Promise.all([
    writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"),
    writeFile(qualityPath, `${JSON.stringify(quality, null, 2)}\n`, "utf8"),
  ]);
  console.log(`Exchange market validation: ${grade}/100; sources=${sources.length}; checks=${checks.length}; divergent=${divergent}; brokerNative=false`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
