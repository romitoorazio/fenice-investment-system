import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import {
  GLOBAL_MARKET_SENTINELS,
  certifyGlobalInstrument,
  isTwelveDataGlobalPaperCandidate,
  twelveDataGlobalQuoteUrl,
  verifyTwelveDataGlobalQuote,
} from "../lib/trading/global-market-data-certification.ts";
import {
  deduplicateExecutionEvidence,
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
  yahooSymbolForInstrument,
} from "../lib/trading/execution-market-data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const evidencePath = path.join(dataDir, "execution-market-evidence.json");
const certificationPath = path.join(dataDir, "global-market-data-certification.json");
const twelveDataApiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const probeLimit = Math.max(0, Math.min(14, Number(process.env.FENICE_GLOBAL_EXECUTION_PROBES || 14) || 14));
const minIntervalMs = Math.max(1_000, Math.min(60_000, Number(process.env.FENICE_TWELVE_DATA_MIN_INTERVAL_MS || 9_000) || 9_000));
const maxRateLimitRetries = Math.max(0, Math.min(3, Number(process.env.FENICE_TWELVE_DATA_429_RETRIES || 2) || 2));
const timeoutMs = Math.max(2_000, Math.min(20_000, Number(process.env.FENICE_GLOBAL_MARKETDATA_TIMEOUT_MS || 8_000) || 8_000));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
let nextTwelveRequestAt = 0;
let rateLimitEvents = 0;
let rateLimitRetries = 0;

async function readJson(name, fallback) {
  return readJsonState(path.join(dataDir, name), fallback);
}

function retryAfterMs(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(0, seconds * 1000));
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.min(60_000, Math.max(0, dateMs - Date.now())) : 0;
}

async function requestJson(url, { paceTwelve = false } = {}) {
  if (paceTwelve) {
    const delayMs = Math.max(0, nextTwelveRequestAt - Date.now());
    if (delayMs > 0) await sleep(delayMs);
    nextTwelveRequestAt = Date.now() + minIntervalMs;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/1.9 global-market-certification" },
    });
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.httpStatus = response.status;
      error.retryAfterMs = retryAfterMs(response);
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function requestTwelve(url) {
  let attempt = 0;
  while (true) {
    try {
      return await requestJson(url, { paceTwelve: true });
    } catch (error) {
      if (Number(error?.httpStatus) !== 429 || attempt >= maxRateLimitRetries) throw error;
      rateLimitEvents += 1;
      const backoffMs = Math.max(Number(error?.retryAfterMs) || 0, minIntervalMs * (2 ** attempt));
      rateLimitRetries += 1;
      attempt += 1;
      await sleep(backoffMs);
    }
  }
}

async function fetchTwelveGlobal(instrument) {
  if (!twelveDataApiKey) throw new Error("TWELVE_DATA_NOT_CONFIGURED");
  if (!isTwelveDataGlobalPaperCandidate(instrument)) throw new Error("TWELVE_DATA_GLOBAL_NOT_A_CANDIDATE");
  const data = await requestTwelve(twelveDataGlobalQuoteUrl(instrument, twelveDataApiKey));
  const verified = verifyTwelveDataGlobalQuote(instrument, data, Date.now(), 120);
  if (!verified.accepted || !verified.evidence) {
    const reason = verified.reasons.length ? verified.reasons.join("; ") : "TWELVE_DATA_GLOBAL_QUOTE_REJECTED";
    const error = new Error(reason);
    error.verification = verified;
    throw error;
  }
  return { evidence: verified.evidence, verification: verified };
}

async function fetchYahooValidation(instrument) {
  const providerSymbol = yahooSymbolForInstrument(instrument);
  if (!providerSymbol) throw new Error("YAHOO_GLOBAL_UNSUPPORTED_SYMBOL");
  const data = await requestJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?interval=1m&range=1d`);
  const result = data?.chart?.result?.[0];
  const price = Number(result?.meta?.regularMarketPrice);
  const timestamp = Number(result?.meta?.regularMarketTime);
  const returnedCurrency = String(result?.meta?.currency || "").trim().toUpperCase();
  const expectedCurrency = String(instrument.currency || "").trim().toUpperCase();
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0) throw new Error("INVALID_YAHOO_GLOBAL_QUOTE");
  if (!returnedCurrency || returnedCurrency !== expectedCurrency) throw new Error("YAHOO_GLOBAL_CURRENCY_MISMATCH");
  const observedAt = new Date(timestamp * 1000).toISOString();
  const evidence = normalizeExecutionEvidence({
    symbol: normalizeExecutionSymbol(instrument.symbol),
    currency: expectedCurrency,
    assetClass: instrument.assetClass,
    source: `Yahoo Finance global cross-check (${instrument.exchangeMic}); validation only`,
    sourceFamily: "yahoo",
    eligibility: "VALIDATION_ONLY",
    price,
    observedAt,
    provenanceVerified: false,
    provenanceMethod: `public-yahoo-symbol:${providerSymbol}`,
  });
  if (!evidence) throw new Error("INVALID_YAHOO_GLOBAL_EVIDENCE");
  return evidence;
}

function targetKey(instrument) {
  return `${normalizeExecutionSymbol(instrument.symbol)}:${String(instrument.exchangeMic || "").toUpperCase()}`;
}

const [existingEvidence, queue, master] = await Promise.all([
  readJsonState(evidencePath, { version: 11, generatedAt: null, observations: [], errors: [], capabilities: {}, policy: {} }),
  readJson("paper-order-queue.json", { orders: [] }),
  readJson("instrument-master.json", { instruments: [] }),
]);

const masterByTicker = new Map(
  (Array.isArray(master?.instruments) ? master.instruments : []).map((item) => [String(item?.ticker || "").toUpperCase(), item]),
);
const queuedTargets = (Array.isArray(queue?.orders) ? queue.orders : [])
  .map((order) => masterByTicker.get(String(order?.symbol || "").toUpperCase()))
  .filter(Boolean)
  .filter((instrument) => String(instrument?.country || "").toUpperCase() !== "US")
  .filter(isTwelveDataGlobalPaperCandidate)
  .map((instrument) => ({
    symbol: instrument.ticker,
    name: instrument.name || instrument.ticker,
    exchangeMic: instrument.exchangeMic,
    country: instrument.country,
    currency: instrument.currency,
    assetClass: instrument.assetClass,
    tier: String(instrument.region || "").toLowerCase() === "europe" ? "EUROPE_CORE" : "DEVELOPED",
  }));

const targetMap = new Map();
for (const item of [...queuedTargets, ...GLOBAL_MARKET_SENTINELS]) {
  if (!targetMap.has(targetKey(item))) targetMap.set(targetKey(item), item);
}
const targets = [...targetMap.values()].slice(0, probeLimit);
const newObservations = [];
const probeResults = [];
const errors = [];

for (const instrument of targets) {
  const result = {
    symbol: instrument.symbol,
    name: instrument.name,
    exchangeMic: instrument.exchangeMic,
    country: instrument.country,
    currency: instrument.currency,
    tier: instrument.tier,
    twelveData: { attempted: false, accepted: false, eligibility: "VALIDATION_ONLY" },
    yahoo: { attempted: true, accepted: false, eligibility: "VALIDATION_ONLY" },
  };

  try {
    const yahooEvidence = await fetchYahooValidation(instrument);
    newObservations.push(yahooEvidence);
    result.yahoo.accepted = true;
  } catch (error) {
    errors.push({ symbol: instrument.symbol, exchangeMic: instrument.exchangeMic, provider: "yahoo", code: String(error?.message || "FETCH_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120) });
  }

  if (twelveDataApiKey) {
    result.twelveData.attempted = true;
    try {
      const { evidence, verification } = await fetchTwelveGlobal(instrument);
      newObservations.push(evidence);
      result.twelveData.accepted = true;
      result.twelveData.eligibility = evidence.eligibility;
      result.twelveData.fresh = verification.fresh;
      result.twelveData.identity = verification.identity;
    } catch (error) {
      result.twelveData.reasons = error?.verification?.reasons || [String(error?.message || "FETCH_FAILED")];
      errors.push({ symbol: instrument.symbol, exchangeMic: instrument.exchangeMic, provider: "twelve-data", code: String(error?.message || "FETCH_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120) });
    }
  }

  probeResults.push(result);
}

const mergedObservations = deduplicateExecutionEvidence([
  ...(Array.isArray(existingEvidence?.observations) ? existingEvidence.observations : []),
  ...newObservations,
]);
const nowMs = Date.now();
const certifications = targets.map((instrument) => certifyGlobalInstrument(instrument, mergedObservations, nowMs));
const summary = {
  totalTargets: targets.length,
  certified: certifications.filter((item) => item.state === "CERTIFIED").length,
  degraded: certifications.filter((item) => item.state === "DEGRADED").length,
  blocked: certifications.filter((item) => item.state === "BLOCKED").length,
  allowNewRiskMarkets: certifications.filter((item) => item.allowNewRisk).length,
  paperEligibleTwelveData: mergedObservations.filter((item) => item.sourceFamily === "twelve-data" && item.eligibility === "PAPER" && targets.some((target) => normalizeExecutionSymbol(target.symbol) === item.symbol)).length,
};
const generatedAt = new Date().toISOString();
const globalCertification = {
  version: 1,
  generatedAt,
  mode: "PAPER_ONLY",
  liveTradingReleased: false,
  providerPolicy: {
    twelveData: "PAPER candidate only after authenticated quote has exact symbol, exact MIC, exact currency and <=120s provider market timestamp",
    yahoo: "cross-check only; never satisfies PAPER quorum",
    alphaVantage: "not used for international realtime certification because realtime/delayed entitlement is US-market scoped",
    quorum: "two independent PAPER-eligible source families required before new risk; three preferred",
  },
  targets,
  probes: probeResults,
  certifications,
  summary,
  errors,
  rateLimit: { minIntervalMs, maxRateLimitRetries, events: rateLimitEvents, retries: rateLimitRetries },
};

await writeJsonStateAtomic(certificationPath, globalCertification);
await writeJsonStateAtomic(evidencePath, {
  ...existingEvidence,
  version: Math.max(12, Number(existingEvidence?.version || 0)),
  generatedAt,
  observations: mergedObservations,
  errors: [...(Array.isArray(existingEvidence?.errors) ? existingEvidence.errors : []), ...errors],
  capabilities: {
    ...(existingEvidence?.capabilities || {}),
    globalMarketCertificationEnabled: true,
    globalMarketProbeCount: targets.length,
    globalMarketSentinelCount: GLOBAL_MARKET_SENTINELS.length,
    globalMarketTwelveDataConfigured: Boolean(twelveDataApiKey),
    globalMarketCertifiedCount: summary.certified,
    globalMarketDegradedCount: summary.degraded,
    globalMarketBlockedCount: summary.blocked,
    globalMarketLiveTradingReleased: false,
  },
  globalCertification,
});

console.log(JSON.stringify({ generatedAt, summary, twelveDataConfigured: Boolean(twelveDataApiKey), errors: errors.length }, null, 2));
