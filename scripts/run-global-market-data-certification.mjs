import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import { resolveGlobalPaperEntitlementProof } from "../lib/trading/global-market-data-entitlement.ts";
import {
  applyGlobalMarketStateGate,
  twelveDataMarketStateUrl,
  verifyTwelveDataGlobalMarketState,
} from "../lib/trading/global-market-state.ts";
import {
  GLOBAL_MARKET_SENTINELS,
  certifyGlobalInstrument,
  isGlobalObservationSessionWindowOpen,
  isTwelveDataGlobalPaperCandidate,
  twelveDataGlobalQuoteUrl,
  verifyTwelveDataGlobalQuote,
} from "../lib/trading/global-market-data-certification.ts";
import {
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
  yahooSymbolForInstrument,
} from "../lib/trading/execution-market-data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const evidencePath = path.join(dataDir, "execution-market-evidence.json");
const certificationPath = path.join(dataDir, "global-market-data-certification.json");
const twelveDataApiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const observeOnly = process.argv.includes("--observe-only") || String(process.env.FENICE_GLOBAL_OBSERVE_ONLY || "").trim() === "1";
if (!observeOnly) throw new Error("GLOBAL_PAPER_CORE_MUTATION_DISABLED_DURING_ACTIVE_V6");
const probeLimit = Math.max(0, Math.min(14, Number(process.env.FENICE_GLOBAL_EXECUTION_PROBES || 14) || 14));
const minIntervalMs = Math.max(1_000, Math.min(60_000, Number(process.env.FENICE_TWELVE_DATA_MIN_INTERVAL_MS || 9_000) || 9_000));
const maxRateLimitRetries = Math.max(0, Math.min(3, Number(process.env.FENICE_TWELVE_DATA_429_RETRIES || 2) || 2));
const timeoutMs = Math.max(2_000, Math.min(20_000, Number(process.env.FENICE_GLOBAL_MARKETDATA_TIMEOUT_MS || 8_000) || 8_000));
const requireOpenSession = String(process.env.FENICE_GLOBAL_REQUIRE_OPEN_SESSION || "1").trim() !== "0";
const approvedPaperMics = String(process.env.FENICE_TWELVE_DATA_GLOBAL_PAPER_MICS || "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const entitlementEvidenceRef = String(process.env.FENICE_TWELVE_DATA_GLOBAL_ENTITLEMENT_REF || "").trim();
const entitlementEvidenceSha256 = String(process.env.FENICE_TWELVE_DATA_GLOBAL_ENTITLEMENT_SHA256 || "").trim().toLowerCase();
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
  const normalized = normalizeExecutionEvidence({
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
  if (!normalized) throw new Error("INVALID_YAHOO_GLOBAL_EVIDENCE");
  return { ...normalized, exchangeMic: String(instrument.exchangeMic || "").trim().toUpperCase() };
}

function deduplicateGlobalEvidence(values) {
  const map = new Map();
  for (const item of values) {
    const exchangeMic = String(item?.exchangeMic || "").trim().toUpperCase();
    const normalized = normalizeExecutionEvidence(item || {});
    if (!normalized || !exchangeMic) continue;
    const candidate = { ...normalized, exchangeMic };
    const key = `${candidate.symbol}:${exchangeMic}:${candidate.sourceFamily}`;
    const previous = map.get(key);
    if (!previous || Date.parse(candidate.observedAt) > Date.parse(previous.observedAt)) map.set(key, candidate);
  }
  return [...map.values()];
}

function targetKey(instrument) {
  return `${normalizeExecutionSymbol(instrument.symbol)}:${String(instrument.exchangeMic || "").toUpperCase()}`;
}

const [existingEvidence, queue, master, entitlementRegistry] = await Promise.all([
  readJsonState(evidencePath, { version: 11, generatedAt: null, observations: [], errors: [], capabilities: {}, policy: {} }),
  readJson("paper-order-queue.json", { orders: [] }),
  readJson("instrument-master.json", { instruments: [] }),
  readJson("global-market-data-entitlements.json", {
    version: 1,
    policy: "DEFAULT_DENY_DUAL_CONTROL",
    provider: "twelve-data",
    updatedAt: null,
    entitlements: [],
  }),
]);

async function fetchTwelveGlobal(instrument) {
  if (!twelveDataApiKey) throw new Error("TWELVE_DATA_NOT_CONFIGURED");
  if (!isTwelveDataGlobalPaperCandidate(instrument)) throw new Error("TWELVE_DATA_GLOBAL_NOT_A_CANDIDATE");
  const data = await requestTwelve(twelveDataGlobalQuoteUrl(instrument, twelveDataApiKey));
  const entitlementProof = resolveGlobalPaperEntitlementProof(
    entitlementRegistry,
    instrument.exchangeMic,
    {
      approvedMics: approvedPaperMics,
      evidenceRef: entitlementEvidenceRef,
      evidenceSha256: entitlementEvidenceSha256,
    },
    Date.now(),
  );
  const verified = verifyTwelveDataGlobalQuote(instrument, data, Date.now(), 120, entitlementProof);
  if (entitlementProof.reasons.length) {
    verified.reasons = [...new Set([...verified.reasons, ...entitlementProof.reasons])];
  }

  let marketState = null;
  if (verified.accepted && verified.evidence?.eligibility === "PAPER") {
    try {
      const marketStateRaw = await requestTwelve(twelveDataMarketStateUrl(instrument.exchangeMic, twelveDataApiKey));
      marketState = verifyTwelveDataGlobalMarketState(instrument.exchangeMic, marketStateRaw, Date.now());
    } catch (error) {
      marketState = verifyTwelveDataGlobalMarketState(instrument.exchangeMic, null, Date.now());
      marketState.reasons = [...new Set([...marketState.reasons, `market_state fetch failed: ${String(error?.message || "FETCH_FAILED")}`])];
    }
    verified.evidence = applyGlobalMarketStateGate(verified.evidence, marketState);
    verified.eligibility = verified.evidence.eligibility === "PAPER" ? "PAPER" : "VALIDATION_ONLY";
    if (!marketState.paperSessionAllowed) {
      verified.reasons = [...new Set([
        ...verified.reasons,
        ...marketState.reasons,
        "PAPER downgraded because exact-MIC market_state is not confirmed open",
      ])];
    }
  }

  if (!verified.accepted || !verified.evidence) {
    const reason = verified.reasons.length ? verified.reasons.join("; ") : "TWELVE_DATA_GLOBAL_QUOTE_REJECTED";
    const error = new Error(reason);
    error.verification = verified;
    throw error;
  }
  return { evidence: verified.evidence, verification: verified, entitlementProof, marketState };
}

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
const catalogTargets = [...targetMap.values()];
const targets = catalogTargets
  .filter((instrument) => !requireOpenSession || isGlobalObservationSessionWindowOpen(instrument.exchangeMic, Date.now()))
  .slice(0, probeLimit);
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
    twelveData: {
      attempted: false,
      accepted: false,
      eligibility: "VALIDATION_ONLY",
      persistedEntitlementVerified: false,
      runtimeEntitlementMatched: false,
      marketStateChecked: false,
      exactMicMarketOpen: false,
      paperSessionAllowed: false,
    },
    yahoo: { attempted: true, accepted: false, eligibility: "VALIDATION_ONLY" },
  };

  try {
    const yahooEvidence = await fetchYahooValidation(instrument);
    newObservations.push(yahooEvidence);
    result.yahoo.accepted = true;
    result.yahoo.observedAt = yahooEvidence.observedAt;
  } catch (error) {
    errors.push({ symbol: instrument.symbol, exchangeMic: instrument.exchangeMic, provider: "yahoo", code: String(error?.message || "FETCH_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120) });
  }

  if (twelveDataApiKey) {
    result.twelveData.attempted = true;
    try {
      const { evidence, verification, entitlementProof, marketState } = await fetchTwelveGlobal(instrument);
      newObservations.push(evidence);
      result.twelveData.accepted = true;
      result.twelveData.eligibility = evidence.eligibility;
      result.twelveData.fresh = verification.fresh;
      result.twelveData.identity = verification.identity;
      result.twelveData.observedAt = evidence.observedAt;
      result.twelveData.persistedEntitlementVerified = entitlementProof.persistedEvidenceFound;
      result.twelveData.runtimeEntitlementMatched = entitlementProof.runtimeClaimMatched;
      result.twelveData.marketStateChecked = Boolean(marketState);
      result.twelveData.exactMicMarketOpen = marketState?.marketOpen === true;
      result.twelveData.paperSessionAllowed = marketState?.paperSessionAllowed === true;
      result.twelveData.marketStateReasons = marketState?.reasons || [];
    } catch (error) {
      result.twelveData.reasons = error?.verification?.reasons || [String(error?.message || "FETCH_FAILED")];
      errors.push({ symbol: instrument.symbol, exchangeMic: instrument.exchangeMic, provider: "twelve-data", code: String(error?.message || "FETCH_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120) });
    }
  }

  probeResults.push(result);
}

const mergedObservations = deduplicateGlobalEvidence([
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
  yahooValidated: probeResults.filter((item) => item.yahoo.accepted).length,
  twelveDataAccepted: probeResults.filter((item) => item.twelveData.accepted).length,
  paperEligibleTwelveData: newObservations.filter((item) => item.sourceFamily === "twelve-data" && item.eligibility === "PAPER").length,
  exactMicMarketStateOpen: probeResults.filter((item) => item.twelveData.paperSessionAllowed).length,
};
const generatedAt = new Date().toISOString();
const persistedEntitlements = Array.isArray(entitlementRegistry?.entitlements) ? entitlementRegistry.entitlements : [];
const globalCertification = {
  version: 4,
  generatedAt,
  mode: observeOnly ? "OBSERVATION_ONLY" : "PAPER_CANDIDATE_COLLECTION",
  paperCoreMutation: !observeOnly,
  liveTradingReleased: false,
  brokerConnectivityAllowed: false,
  providerPolicy: {
    twelveData: "validation-only by default; PAPER requires exact-MIC persisted VERIFIED entitlement evidence plus matching runtime MIC/reference/SHA-256 claim, authenticated exact identity, <=120s quote timestamp, and exact-MIC market_state confirmed open",
    yahoo: "broad global cross-check only; never satisfies PAPER quorum",
    alphaVantage: "not used for international realtime certification because realtime/delayed entitlement is US-market scoped",
    quorum: "two independent PAPER-eligible source families required before new risk; three preferred",
    entitlementControl: "DEFAULT_DENY_DUAL_CONTROL; runtime variables alone cannot promote market data to PAPER",
    sessionControl: "FAIL_CLOSED_EXACT_MIC_MARKET_STATE; a weekday/session window only suppresses probes and never proves an exchange is open",
  },
  targets,
  targetSelection: {
    catalogTargets: catalogTargets.length,
    selectedTargets: targets.length,
    requireOpenSession,
    persistedEntitlementRecords: persistedEntitlements.length,
    runtimeEntitlementClaimConfigured: Boolean(entitlementEvidenceRef && entitlementEvidenceSha256 && approvedPaperMics.length),
    entitlementEvidenceConfigured: Boolean(persistedEntitlements.length && entitlementEvidenceRef && entitlementEvidenceSha256 && approvedPaperMics.length),
    paperEntitlementDualControl: true,
    exactMicMarketStateGate: true,
  },
  probes: probeResults,
  certifications,
  summary,
  errors,
  rateLimit: { minIntervalMs, maxRateLimitRetries, events: rateLimitEvents, retries: rateLimitRetries },
};

await writeJsonStateAtomic(certificationPath, globalCertification);
if (!observeOnly) {
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
      globalPaperEntitlementDualControl: true,
      globalExactMicMarketStateGate: true,
    },
    globalCertification,
  });
}

console.log(JSON.stringify({ generatedAt, mode: globalCertification.mode, summary, twelveDataConfigured: Boolean(twelveDataApiKey), errors: errors.length }, null, 2));