import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import { buildDirectaExecutionEvidence } from "../lib/trading/directa-execution-evidence.ts";
import {
  classifyExecutionPaperEligibility,
  deduplicateExecutionEvidence,
  isAlpacaPaperCandidate,
  isAlphaVantageIntradayCandidate,
  isTwelveDataPaperCandidate,
  isTwelveDataUsRealtimeVenue,
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
  parseProviderLocalTimestamp,
  stooqSymbolForInstrument,
  yahooSymbolForInstrument,
} from "../lib/trading/execution-market-data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const outputPath = path.join(dataDir, "execution-market-evidence.json");
const directaSnapshotPath = String(
  process.env.DIRECTA_EXECUTION_SNAPSHOT_PATH || path.join(homedir(), ".fenice", "directa-datafeed-snapshot.json"),
).trim();
const twelveDataApiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const alphaVantageApiKey = String(process.env.ALPHA_VANTAGE_API_KEY || "").trim();
const alpacaApiKeyId = String(process.env.APCA_API_KEY_ID || process.env.ALPACA_API_KEY || "").trim();
const alpacaApiSecretKey = String(process.env.APCA_API_SECRET_KEY || process.env.ALPACA_API_SECRET || "").trim();
const alpacaConfigured = Boolean(alpacaApiKeyId && alpacaApiSecretKey);
const twelveDataProbeLimit = Math.max(0, Math.min(6, Number(process.env.FENICE_TWELVE_DATA_EXECUTION_PROBES || 3) || 3));
const alphaVantageProbeLimit = Math.max(0, Math.min(3, Number(process.env.FENICE_ALPHA_VANTAGE_EXECUTION_PROBES || 3) || 3));
const alpacaProbeLimit = Math.max(0, Math.min(6, Number(process.env.FENICE_ALPACA_EXECUTION_PROBES || 3) || 3));

async function readJson(name, fallback) {
  return readJsonState(path.join(dataDir, name), fallback);
}

function masterIdentifier(instrument, type) {
  const expectedType = String(type || "").trim().toLowerCase();
  const identifiers = Array.isArray(instrument?.identifiers) ? instrument.identifiers : [];
  const match = identifiers.find((item) => String(item?.type || "").trim().toLowerCase() === expectedType);
  return String(match?.value || "").trim().toUpperCase() || undefined;
}

async function request(url, { format = "json", timeoutMs = 8000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: format === "json" ? "application/json" : "text/csv,text/plain,*/*",
        "user-agent": "FeniceInvestmentSystem/1.4 execution-market-validation",
        ...headers,
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
  const observedAt = new Date(timestamp * 1000).toISOString();
  const eligibility = classifyExecutionPaperEligibility({
    source: "Yahoo Finance public quote validation",
    sourceFamily: "yahoo",
    observedAt,
    realtime: true,
  }, Date.now(), 120);
  return normalizeExecutionEvidence({
    symbol: instrument.symbol,
    currency: result?.meta?.currency || instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: "Yahoo Finance public quote validation; PAPER entitlement unproven",
    sourceFamily: "yahoo",
    eligibility,
    price,
    observedAt,
    provenanceVerified: false,
    provenanceMethod: "unverified-public-quote",
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
    source: "Stooq end-of-day validation",
    sourceFamily: "stooq",
    eligibility: "VALIDATION_ONLY",
    price: quote.price,
    observedAt: quote.observedAt,
    provenanceVerified: false,
    provenanceMethod: "end-of-day-validation-only",
  });
}

async function fetchTwelveData(instrument) {
  if (!twelveDataApiKey) throw new Error("TWELVE_DATA_NOT_CONFIGURED");
  if (!isTwelveDataPaperCandidate(instrument)) throw new Error("TWELVE_DATA_NOT_A_PAPER_CANDIDATE");
  const providerSymbol = normalizeExecutionSymbol(instrument.symbol);
  if (!providerSymbol) throw new Error("UNSUPPORTED_SYMBOL");
  const data = await request(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(providerSymbol)}&interval=1min&apikey=${encodeURIComponent(twelveDataApiKey)}`);
  if (String(data?.status || "").toLowerCase() === "error" || data?.code) throw new Error("TWELVE_DATA_API_ERROR");
  const returnedSymbol = normalizeExecutionSymbol(data?.symbol);
  if (returnedSymbol && returnedSymbol !== providerSymbol) throw new Error("TWELVE_DATA_SYMBOL_MISMATCH");
  if (!isTwelveDataUsRealtimeVenue(data || {})) throw new Error("TWELVE_DATA_NON_US_REALTIME_VENUE");
  const price = Number(data?.close ?? data?.price);
  const timestamp = Number(data?.timestamp);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("INVALID_TWELVE_DATA_QUOTE");
  }
  const observedAt = new Date(timestamp * 1000).toISOString();
  const eligibility = classifyExecutionPaperEligibility({
    source: "Twelve Data US realtime venue-verified quote",
    sourceFamily: "twelve-data",
    observedAt,
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  }, Date.now(), 120);
  return normalizeExecutionEvidence({
    symbol: providerSymbol,
    currency: data?.currency || instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: eligibility === "PAPER"
      ? "Twelve Data US realtime venue-verified paper validation"
      : "Twelve Data US quote failed PAPER freshness/provenance gate",
    sourceFamily: "twelve-data",
    eligibility,
    price,
    observedAt,
    provenanceVerified: true,
    provenanceMethod: "provider-response-us-realtime-venue",
  });
}

async function fetchAlphaVantageIntraday(instrument) {
  if (!alphaVantageApiKey) throw new Error("ALPHA_VANTAGE_NOT_CONFIGURED");
  if (!isAlphaVantageIntradayCandidate(instrument)) throw new Error("ALPHA_VANTAGE_NOT_A_PAPER_CANDIDATE");
  const providerSymbol = normalizeExecutionSymbol(instrument.symbol);
  if (!providerSymbol) throw new Error("UNSUPPORTED_SYMBOL");
  const data = await request(`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(providerSymbol)}&interval=1min&outputsize=compact&entitlement=realtime&apikey=${encodeURIComponent(alphaVantageApiKey)}`, { timeoutMs: 12000 });
  if (data?.["Error Message"]) throw new Error("ALPHA_VANTAGE_API_ERROR");
  if (data?.Note) throw new Error("ALPHA_VANTAGE_RATE_LIMIT");
  if (data?.Information) {
    const information = String(data.Information);
    if (/premium|realtime|entitlement|subscription/i.test(information)) {
      throw new Error("ALPHA_VANTAGE_REALTIME_ENTITLEMENT_REQUIRED");
    }
    throw new Error("ALPHA_VANTAGE_INFORMATION");
  }
  const meta = data?.["Meta Data"] || {};
  const returnedSymbol = normalizeExecutionSymbol(meta?.["2. Symbol"]);
  if (!returnedSymbol || returnedSymbol !== providerSymbol) throw new Error("ALPHA_VANTAGE_SYMBOL_MISMATCH");
  const series = data?.["Time Series (1min)"];
  if (!series || typeof series !== "object") throw new Error("ALPHA_VANTAGE_INTRADAY_MISSING");
  const lastRefreshed = String(meta?.["3. Last Refreshed"] || "").trim();
  const latestKey = series[lastRefreshed] ? lastRefreshed : Object.keys(series).sort().at(-1);
  const timeZone = String(meta?.["6. Time Zone"] || "").trim();
  const observedAt = parseProviderLocalTimestamp(latestKey, timeZone);
  const row = latestKey ? series[latestKey] : null;
  const price = Number(row?.["4. close"]);
  if (!observedAt || !Number.isFinite(price) || price <= 0) throw new Error("INVALID_ALPHA_VANTAGE_INTRADAY_QUOTE");
  const eligibility = classifyExecutionPaperEligibility({
    source: "Alpha Vantage explicit realtime-entitlement request",
    sourceFamily: "alpha-vantage",
    observedAt,
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  }, Date.now(), 120);
  return normalizeExecutionEvidence({
    symbol: providerSymbol,
    currency: instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: eligibility === "PAPER"
      ? "Alpha Vantage realtime-entitled paper validation"
      : "Alpha Vantage realtime request failed PAPER freshness/provenance gate",
    sourceFamily: "alpha-vantage",
    eligibility,
    price,
    observedAt,
    provenanceVerified: true,
    provenanceMethod: "explicit-realtime-entitlement-response",
  });
}

async function fetchAlpaca(instrument) {
  if (!alpacaConfigured) throw new Error("ALPACA_NOT_CONFIGURED");
  if (!isAlpacaPaperCandidate(instrument)) throw new Error("ALPACA_NOT_A_PAPER_CANDIDATE");
  const providerSymbol = normalizeExecutionSymbol(instrument.symbol);
  if (!providerSymbol) throw new Error("UNSUPPORTED_SYMBOL");
  const data = await request(
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(providerSymbol)}/quotes/latest?feed=iex`,
    {
      headers: {
        "APCA-API-KEY-ID": alpacaApiKeyId,
        "APCA-API-SECRET-KEY": alpacaApiSecretKey,
      },
    },
  );
  const quote = data?.quote;
  const bid = Number(quote?.bp);
  const ask = Number(quote?.ap);
  const observedAt = String(quote?.t || "").trim();
  if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask <= 0 || ask < bid) {
    throw new Error("INVALID_ALPACA_IEX_QUOTE");
  }
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("INVALID_ALPACA_IEX_TIMESTAMP");
  const price = (bid + ask) / 2;
  const eligibility = classifyExecutionPaperEligibility({
    source: "Alpaca Basic IEX realtime latest quote",
    sourceFamily: "alpaca",
    observedAt,
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  }, Date.now(), 120);
  return normalizeExecutionEvidence({
    symbol: providerSymbol,
    currency: instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: eligibility === "PAPER"
      ? "Alpaca Basic IEX realtime paper validation"
      : "Alpaca IEX quote failed PAPER freshness/provenance gate",
    sourceFamily: "alpaca",
    eligibility,
    price,
    observedAt,
    provenanceVerified: true,
    provenanceMethod: "authenticated-alpaca-iex-latest-quote",
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
  const eligibility = classifyExecutionPaperEligibility({
    source: "Coinbase Exchange timestamped public ticker",
    sourceFamily: "coinbase",
    observedAt,
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: false,
  }, Date.now(), 120);
  return normalizeExecutionEvidence({
    symbol,
    currency: "USD",
    assetClass: instrument.assetClass,
    source: "Coinbase Exchange timestamped public ticker; PAPER provenance not independently verified",
    sourceFamily: "coinbase",
    eligibility,
    price,
    observedAt,
    provenanceVerified: false,
    provenanceMethod: "public-ticker-validation-only",
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
    source: "Kraken ticker validation; provider quote timestamp unavailable",
    sourceFamily: "kraken",
    eligibility: "VALIDATION_ONLY",
    price,
    observedAt: new Date().toISOString(),
    provenanceVerified: false,
    provenanceMethod: "retrieval-time-only-validation",
  });
}

const [queue, terminal, master, directaSnapshot] = await Promise.all([
  readJson("paper-order-queue.json", { orders: [] }),
  readJson("terminal-intelligence.json", { assets: [] }),
  readJson("instrument-master.json", { instruments: [] }),
  readJsonState(directaSnapshotPath, null),
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
    isin: masterIdentifier(masterInstrument, "isin"),
    country: masterInstrument.country,
  };
});

const twelveDataProbeSymbols = new Set(
  instruments
    .filter(isTwelveDataPaperCandidate)
    .slice(0, twelveDataProbeLimit)
    .map((instrument) => instrument.symbol),
);
const alphaVantageProbeSymbols = new Set(
  instruments
    .filter(isAlphaVantageIntradayCandidate)
    .slice(0, alphaVantageProbeLimit)
    .map((instrument) => instrument.symbol),
);
const alpacaProbeSymbols = new Set(
  instruments
    .filter(isAlpacaPaperCandidate)
    .slice(0, alpacaProbeLimit)
    .map((instrument) => instrument.symbol),
);
const directaEvidence = buildDirectaExecutionEvidence(directaSnapshot, instruments);
const observations = [...directaEvidence.observations];
const errors = [];
if (directaSnapshot && !directaEvidence.accepted) {
  for (const reason of directaEvidence.reasons) {
    errors.push({
      symbol: "*",
      provider: "directa",
      code: String(reason).replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 80),
    });
  }
}

for (const instrument of instruments) {
  const tasks = [
    ["yahoo", () => fetchYahoo(instrument)],
    ["stooq", () => fetchStooq(instrument)],
  ];
  if (twelveDataApiKey && twelveDataProbeSymbols.has(instrument.symbol)) {
    tasks.push(["twelve-data", () => fetchTwelveData(instrument)]);
  }
  if (alphaVantageApiKey && alphaVantageProbeSymbols.has(instrument.symbol)) {
    tasks.push(["alpha-vantage", () => fetchAlphaVantageIntraday(instrument)]);
  }
  if (alpacaConfigured && alpacaProbeSymbols.has(instrument.symbol)) {
    tasks.push(["alpaca", () => fetchAlpaca(instrument)]);
  }
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
const twelveDataEvidence = deduplicated.filter((item) => item.sourceFamily === "twelve-data");
const alphaVantageEvidence = deduplicated.filter((item) => item.sourceFamily === "alpha-vantage");
const alpacaEvidence = deduplicated.filter((item) => item.sourceFamily === "alpaca");
const directaObservations = deduplicated.filter((item) => item.sourceFamily === "directa");
const coinbaseEvidence = deduplicated.filter((item) => item.sourceFamily === "coinbase");
const krakenEvidence = deduplicated.filter((item) => item.sourceFamily === "kraken");
const report = {
  version: 10,
  generatedAt: new Date().toISOString(),
  requestedSymbols: instruments.map((instrument) => instrument.symbol),
  observations: deduplicated,
  errors,
  capabilities: {
    directaLocalSnapshotDetected: Boolean(directaSnapshot),
    directaLocalSnapshotAccepted: directaEvidence.accepted,
    directaLocalSnapshotAgeMs: directaEvidence.snapshotAgeMs,
    directaRealtimeEntitlementConfirmed: directaEvidence.realtimeEntitlementConfirmed,
    directaConfirmedRealtimeMarketMics: directaEvidence.confirmedRealtimeMarketMics,
    directaIdentityVerifiedQuotes: directaEvidence.identityVerifiedQuotes,
    directaIdentityRejectedQuotes: directaEvidence.identityRejectedQuotes,
    directaWarnings: directaEvidence.warnings,
    directaPaperFreshObservations: directaObservations.filter((item) => item.eligibility === "PAPER").length,
    directaValidationOnlyObservations: directaObservations.filter((item) => item.eligibility === "VALIDATION_ONLY").length,
    directaPaperRule: "Directa is optional for PAPER certification; when present, PAPER evidence requires loopback read-only DAPI, trading writes blocked, explicit market entitlement, matching instrument identity, and <=120-second quote freshness",
    twelveDataConfigured: Boolean(twelveDataApiKey),
    twelveDataCandidateCount: instruments.filter(isTwelveDataPaperCandidate).length,
    twelveDataProbeLimit,
    twelveDataProbedSymbols: [...twelveDataProbeSymbols],
    twelveDataPaperFreshObservations: twelveDataEvidence.filter((item) => item.eligibility === "PAPER").length,
    twelveDataValidationOnlyObservations: twelveDataEvidence.filter((item) => item.eligibility === "VALIDATION_ONLY").length,
    twelveDataFreeRealtimeScope: "US-listed equities/ETFs only; recognized realtime venue, verified provider-specific PAPER provenance and <=120-second freshness are required",
    alpacaConfigured,
    alpacaCandidateCount: instruments.filter(isAlpacaPaperCandidate).length,
    alpacaProbeLimit,
    alpacaProbedSymbols: [...alpacaProbeSymbols],
    alpacaPaperFreshObservations: alpacaEvidence.filter((item) => item.eligibility === "PAPER").length,
    alpacaValidationOnlyObservations: alpacaEvidence.filter((item) => item.eligibility === "VALIDATION_ONLY").length,
    alpacaPaperRule: "Alpaca Basic IEX latest quote; authenticated IEX feed, positive bid/ask midpoint, provider timestamp, verified provenance and <=120-second freshness required",
    alphaVantageConfigured: Boolean(alphaVantageApiKey),
    alphaVantageProbeLimit,
    alphaVantageProbedSymbols: [...alphaVantageProbeSymbols],
    alphaVantagePaperFreshObservations: alphaVantageEvidence.filter((item) => item.eligibility === "PAPER").length,
    alphaVantageValidationOnlyObservations: alphaVantageEvidence.filter((item) => item.eligibility === "VALIDATION_ONLY").length,
    alphaVantagePaperRule: "explicit entitlement=realtime request must succeed; this route may require a paid provider entitlement and is not required for zero-cost PAPER certification",
    yahooPaperRule: "freshness alone is insufficient; Yahoo remains VALIDATION_ONLY until explicit PAPER provenance/entitlement is proven",
    coinbasePaperObservations: coinbaseEvidence.filter((item) => item.eligibility === "PAPER").length,
    coinbasePaperRule: "timestamped public ticker remains VALIDATION_ONLY until provider-specific PAPER provenance is independently verified",
    krakenPaperObservations: krakenEvidence.filter((item) => item.eligibility === "PAPER").length,
    krakenPaperRule: "Ticker endpoint lacks a provider quote timestamp, so evidence remains VALIDATION_ONLY even when retrieval is recent",
    directPaidFeedRequired: false,
  },
  policy: {
    independentSourceFamiliesRequiredBeforeNewRisk: 2,
    preferredIndependentSourceFamilies: 3,
    validationOnlySourcesNeverSatisfyPaperQuorum: true,
    untaggedLegacyEvidenceDefaultsToValidationOnly: true,
    liveEligibilityMustBeExplicit: true,
    providerVenueMustBeVerifiedBeforePaperEligibility: true,
    delayedIntradayEvidenceNeverSatisfiesPaperQuorum: true,
    providerBudgetsMustNotWeakenFreshnessOrIndependence: true,
    paperEligibilityRequiresExplicitRealtimeAndEntitlement: true,
    paperEligibilityRequiresVerifiedProvenance: true,
    localBrokerEvidenceMustProveReadOnlyBoundary: true,
    localBrokerEvidenceMustMatchInstrumentIdentity: true,
    localBrokerMarketEntitlementMustBeExplicit: true,
    liveTradingAllowed: false,
  },
};

await writeJsonStateAtomic(outputPath, report);
console.log(`Fenice execution market-data: symbols=${instruments.length}, observations=${deduplicated.length}, errors=${errors.length}, directa=${directaSnapshot ? (directaEvidence.accepted ? "accepted" : "rejected") : "not-present"}, directaFresh=${report.capabilities.directaPaperFreshObservations}/${directaObservations.length}, twelveData=${twelveDataApiKey ? "configured" : "optional-unconfigured"}, twelveDataFresh=${report.capabilities.twelveDataPaperFreshObservations}/${twelveDataEvidence.length}, alpaca=${alpacaConfigured ? "configured" : "optional-unconfigured"}, alpacaFresh=${report.capabilities.alpacaPaperFreshObservations}/${alpacaEvidence.length}, alphaVantage=${alphaVantageApiKey ? "configured" : "optional-unconfigured"}, alphaFresh=${report.capabilities.alphaVantagePaperFreshObservations}/${alphaVantageEvidence.length}, coinbasePaper=${report.capabilities.coinbasePaperObservations}/${coinbaseEvidence.length}, krakenPaper=${report.capabilities.krakenPaperObservations}/${krakenEvidence.length}.`);
