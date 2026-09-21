import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import {
  deduplicateExecutionEvidence,
  normalizeExecutionEvidence,
  stooqSymbolForInstrument,
  yahooSymbolForInstrument,
} from "../lib/trading/execution-market-data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const outputPath = path.join(dataDir, "execution-market-evidence.json");

async function readJson(name, fallback) {
  return readJsonState(path.join(dataDir, name), fallback);
}

async function request(url, { format = "json", timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: format === "json" ? "application/json" : "text/csv,text/plain,*/*",
        "user-agent": "FeniceInvestmentSystem/1.0 execution-market-validation",
      },
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return format === "json" ? await response.json() : await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseStooqCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length < 2 || /N\/D/i.test(lines.at(-1))) return null;
  const headers = lines[0].split(",").map((item) => item.trim());
  const values = lines.at(-1).split(",").map((item) => item.trim());
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  const price = Number(row.Close);
  if (!Number.isFinite(price) || price <= 0) return null;
  const observedAt = row.Date
    ? new Date(`${row.Date}T${row.Time && row.Time !== "N/D" ? row.Time : "00:00:00"}Z`).toISOString()
    : null;
  return observedAt ? { price, observedAt } : null;
}

async function fetchYahoo(instrument) {
  const providerSymbol = yahooSymbolForInstrument(instrument);
  if (!providerSymbol) throw new Error("UNSUPPORTED_SYMBOL");
  const data = await request(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?interval=1m&range=1d`);
  const result = data?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice);
  const timestamp = Number(result?.meta?.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("INVALID_YAHOO_QUOTE");
  }
  return normalizeExecutionEvidence({
    symbol: instrument.symbol,
    currency: result?.meta?.currency || instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: "Yahoo Finance execution validation",
    price,
    observedAt: new Date(timestamp * 1000).toISOString(),
  });
}

async function fetchStooq(instrument) {
  const providerSymbol = stooqSymbolForInstrument(instrument);
  if (!providerSymbol) throw new Error("UNSUPPORTED_SYMBOL");
  const text = await request(`https://stooq.com/q/l/?s=${encodeURIComponent(providerSymbol)}&f=sd2t2ohlcv&h&e=csv`, { format: "text" });
  const quote = parseStooqCsv(text);
  if (!quote) throw new Error("INVALID_STOOQ_QUOTE");
  return normalizeExecutionEvidence({
    symbol: instrument.symbol,
    currency: instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: "Stooq execution validation",
    price: quote.price,
    observedAt: quote.observedAt,
  });
}

async function fetchCoinbase(instrument) {
  const symbol = String(instrument.symbol || "").toUpperCase();
  const data = await request(`https://api.exchange.coinbase.com/products/${encodeURIComponent(`${symbol}-USD`)}/ticker`);
  const price = Number(data?.price);
  const observedAt = data?.time;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(Date.parse(String(observedAt || "")))) {
    throw new Error("INVALID_COINBASE_QUOTE");
  }
  return normalizeExecutionEvidence({
    symbol,
    currency: "USD",
    assetClass: instrument.assetClass,
    source: "Coinbase Exchange execution validation",
    price,
    observedAt,
  });
}

async function fetchKraken(instrument) {
  const symbol = String(instrument.symbol || "").toUpperCase();
  const pair = symbol === "BTC" ? "XBTUSD" : `${symbol}USD`;
  const data = await request(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`);
  if (!Array.isArray(data?.error) || data.error.length) throw new Error("KRAKEN_API_ERROR");
  const result = data?.result && typeof data.result === "object" ? Object.values(data.result)[0] : null;
  const price = Number(result?.c?.[0]);
  if (!Number.isFinite(price) || price <= 0) throw new Error("INVALID_KRAKEN_QUOTE");
  return normalizeExecutionEvidence({
    symbol,
    currency: "USD",
    assetClass: instrument.assetClass,
    source: "Kraken execution validation",
    price,
    observedAt: new Date().toISOString(),
  });
}

const [queue, terminal, master] = await Promise.all([
  readJson("paper-order-queue.json", { orders: [] }),
  readJson("terminal-intelligence.json", { assets: [] }),
  readJson("instrument-master.json", { instruments: [] }),
]);

const masterByTicker = new Map(
  (Array.isArray(master.instruments) ? master.instruments : []).map((instrument) => [String(instrument.ticker || "").toUpperCase(), instrument]),
);
const terminalBySymbol = new Map(
  (Array.isArray(terminal.assets) ? terminal.assets : []).map((asset) => [String(asset.symbol || "").toUpperCase(), asset]),
);

const requested = new Set(
  (Array.isArray(queue.orders) ? queue.orders : [])
    .map((order) => String(order?.symbol || "").toUpperCase())
    .filter(Boolean),
);
if (requested.size === 0) {
  for (const asset of (Array.isArray(terminal.assets) ? terminal.assets : []).slice(0, 12)) {
    const symbol = String(asset?.symbol || "").toUpperCase();
    if (symbol) requested.add(symbol);
  }
}

const instruments = [...requested].map((symbol) => {
  const masterInstrument = masterByTicker.get(symbol) || {};
  const terminalAsset = terminalBySymbol.get(symbol) || {};
  return {
    symbol,
    currency: masterInstrument.currency || terminalAsset.currency || "USD",
    assetClass: masterInstrument.assetClass || terminalAsset.assetClass || terminalAsset.category || "unknown",
    exchangeMic: masterInstrument.exchangeMic,
  };
});

const observations = [];
const errors = [];
for (const instrument of instruments) {
  const tasks = [
    ["yahoo", () => fetchYahoo(instrument)],
    ["stooq", () => fetchStooq(instrument)],
  ];
  const assetClass = String(instrument.assetClass || "").toLowerCase();
  if (assetClass === "crypto" || assetClass === "criptovaluta") {
    tasks.push(["coinbase", () => fetchCoinbase(instrument)]);
    tasks.push(["kraken", () => fetchKraken(instrument)]);
  }

  const settled = await Promise.allSettled(tasks.map(([, task]) => task()));
  for (let index = 0; index < settled.length; index += 1) {
    const provider = tasks[index][0];
    const result = settled[index];
    if (result.status === "fulfilled" && result.value) observations.push(result.value);
    else if (result.status === "rejected") {
      errors.push({
        symbol: instrument.symbol,
        provider,
        code: String(result.reason?.message || "FETCH_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 80),
      });
    }
  }
}

const deduplicated = deduplicateExecutionEvidence(observations);
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  requestedSymbols: instruments.map((instrument) => instrument.symbol),
  observations: deduplicated,
  errors,
  policy: {
    independentSourcesRequiredBeforeNewRisk: 2,
    preferredIndependentSources: 3,
    liveTradingAllowed: false,
  },
};

await writeJsonStateAtomic(outputPath, report);
console.log(`Fenice execution market-data: symbols=${instruments.length}, observations=${deduplicated.length}, errors=${errors.length}.`);
