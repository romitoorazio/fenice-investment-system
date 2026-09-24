import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import {
  classifyExecutionPaperEligibility,
  deduplicateExecutionEvidence,
  isTwelveDataPaperCandidate,
  isTwelveDataUsRealtimeVenue,
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
} from "../lib/trading/execution-market-data.ts";
import { parseTwelveDataQuoteTime, unwrapTwelveDataBatchQuote } from "../lib/trading/twelve-data-batch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const evidencePath = path.join(dataDir, "execution-market-evidence.json");
const masterPath = path.join(dataDir, "instrument-master.json");
const fxEvidencePath = path.join(dataDir, "paper-fx-evidence.json");
const apiKey = String(process.env.TWELVE_DATA_API_KEY || "").trim();
const probeLimit = Math.max(0, Math.min(8, Number(process.env.FENICE_TWELVE_DATA_BATCH_PROBES || 4) || 4));
const maxRetries = Math.max(0, Math.min(3, Number(process.env.FENICE_TWELVE_DATA_BATCH_429_RETRIES || 2) || 2));
const retryBaseMs = Math.max(1000, Math.min(60_000, Number(process.env.FENICE_TWELVE_DATA_BATCH_RETRY_MS || 10_000) || 10_000));
const fxFreshnessSeconds = 120;
const fxFreshnessRetries = Math.max(0, Math.min(4, Number(process.env.FENICE_TWELVE_DATA_FX_FRESHNESS_RETRIES || 3) || 3));
const fxFreshnessRetryMs = Math.max(5000, Math.min(30_000, Number(process.env.FENICE_TWELVE_DATA_FX_FRESHNESS_RETRY_MS || 15_000) || 15_000));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

function masterIdentifier(instrument, type) {
  const expectedType = String(type || "").trim().toLowerCase();
  const identifiers = Array.isArray(instrument?.identifiers) ? instrument.identifiers : [];
  const match = identifiers.find((item) => String(item?.type || "").trim().toLowerCase() === expectedType);
  return String(match?.value || "").trim().toUpperCase() || undefined;
}

function retryAfterMs(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(0, seconds * 1000));
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.min(60_000, Math.max(0, dateMs - Date.now())) : 0;
}

let rateLimitEvents = 0;
let rateLimitRetries = 0;
async function requestJson(url) {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "FeniceInvestmentSystem/1.9 twelve-data-paper-evidence",
        },
      });
      if (response.status === 429) {
        rateLimitEvents += 1;
        if (attempt >= maxRetries) throw new Error("HTTP_429");
        rateLimitRetries += 1;
        const backoff = Math.max(retryAfterMs(response), retryBaseMs * (2 ** attempt));
        await sleep(backoff);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

async function fetchFreshUsdEur() {
  if (!apiKey) throw new Error("PAPER_FX_TWELVE_DATA_KEY_MISSING");
  const url = `https://api.twelvedata.com/exchange_rate?symbol=USD%2FEUR&timezone=UTC&apikey=${encodeURIComponent(apiKey)}`;
  let lastAge = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt <= fxFreshnessRetries; attempt += 1) {
    const payload = await requestJson(url);
    const rate = Number(payload?.rate);
    const timestamp = Number(payload?.timestamp);
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(timestamp) || timestamp <= 0) {
      throw new Error("PAPER_FX_INVALID_TWELVE_DATA_RESPONSE");
    }

    const observedAt = new Date(timestamp * 1000).toISOString();
    const ageSeconds = Math.max(0, (Date.now() - timestamp * 1000) / 1000);
    lastAge = ageSeconds;
    if (ageSeconds <= fxFreshnessSeconds) {
      return { rate, timestamp, observedAt, ageSeconds, freshnessAttempt: attempt + 1 };
    }

    if (attempt < fxFreshnessRetries) {
      console.log(`Fenice PAPER FX: stale ${ageSeconds.toFixed(1)}s > ${fxFreshnessSeconds}s; retrying fresh USD/EUR (${attempt + 1}/${fxFreshnessRetries + 1}).`);
      await sleep(fxFreshnessRetryMs);
    }
  }

  throw new Error(`PAPER_FX_STALE_${Number.isFinite(lastAge) ? lastAge.toFixed(1) : "INF"}S`);
}

const [evidence, master] = await Promise.all([
  readJsonState(evidencePath, null),
  readJsonState(masterPath, { instruments: [] }),
]);
if (!evidence || typeof evidence !== "object") throw new Error("TWELVE_DATA_BATCH_EVIDENCE_MISSING_BASE_REPORT");

const masterByTicker = new Map(
  (Array.isArray(master?.instruments) ? master.instruments : []).map((instrument) => [
    normalizeExecutionSymbol(instrument?.ticker || instrument?.symbol),
    instrument,
  ]),
);
const probeUniverse = Array.isArray(evidence?.capabilities?.probeUniverse)
  ? evidence.capabilities.probeUniverse
  : Array.isArray(evidence?.requestedSymbols) ? evidence.requestedSymbols : [];
const candidates = probeUniverse
  .map((symbol) => {
    const normalized = normalizeExecutionSymbol(symbol);
    const source = masterByTicker.get(normalized) || {};
    return {
      symbol: normalized,
      currency: source.currency || "USD",
      assetClass: source.assetClass || "unknown",
      exchangeMic: source.exchangeMic,
      isin: masterIdentifier(source, "isin"),
      country: source.country,
    };
  })
  .filter((instrument) => instrument.symbol && isTwelveDataPaperCandidate(instrument))
  .slice(0, probeLimit);

const withoutTwelve = (Array.isArray(evidence.observations) ? evidence.observations : [])
  .filter((item) => String(item?.sourceFamily || "").toLowerCase() !== "twelve-data");
const nonTwelveErrors = (Array.isArray(evidence.errors) ? evidence.errors : [])
  .filter((item) => String(item?.provider || "").toLowerCase() !== "twelve-data");
const refreshed = [];
const batchErrors = [];

if (apiKey && candidates.length > 0) {
  const symbols = candidates.map((instrument) => instrument.symbol);
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(","))}&interval=1min&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const payload = await requestJson(url);
    if (String(payload?.status || "").toLowerCase() === "error" || payload?.code) {
      throw new Error("TWELVE_DATA_BATCH_API_ERROR");
    }

    for (const instrument of candidates) {
      const row = unwrapTwelveDataBatchQuote(payload, instrument.symbol);
      if (!row) {
        batchErrors.push({ symbol: instrument.symbol, provider: "twelve-data", code: "TWELVE_DATA_BATCH_SYMBOL_MISSING" });
        continue;
      }
      const returnedSymbol = normalizeExecutionSymbol(row?.symbol || instrument.symbol);
      if (returnedSymbol !== instrument.symbol) {
        batchErrors.push({ symbol: instrument.symbol, provider: "twelve-data", code: "TWELVE_DATA_SYMBOL_MISMATCH" });
        continue;
      }
      if (!isTwelveDataUsRealtimeVenue(row)) {
        batchErrors.push({ symbol: instrument.symbol, provider: "twelve-data", code: "TWELVE_DATA_NON_US_REALTIME_VENUE" });
        continue;
      }
      const price = Number(row?.close ?? row?.price);
      const quoteTime = parseTwelveDataQuoteTime(row);
      if (!Number.isFinite(price) || price <= 0 || !quoteTime.observedAt) {
        batchErrors.push({ symbol: instrument.symbol, provider: "twelve-data", code: "INVALID_TWELVE_DATA_BATCH_QUOTE" });
        continue;
      }

      const eligibility = quoteTime.paperTimestampVerified
        ? classifyExecutionPaperEligibility({
          source: "Twelve Data batch US realtime venue-verified quote",
          sourceFamily: "twelve-data",
          observedAt: quoteTime.observedAt,
          realtime: true,
          entitlement: "PAPER",
          provenanceVerified: true,
        }, Date.now(), 120)
        : "VALIDATION_ONLY";
      const normalized = normalizeExecutionEvidence({
        symbol: instrument.symbol,
        currency: row?.currency || instrument.currency || "USD",
        assetClass: instrument.assetClass,
        source: eligibility === "PAPER"
          ? `Twelve Data batch US realtime /quote with provider ${quoteTime.source}`
          : "Twelve Data batch /quote retained as validation-only because provider timestamp evidence is absent or stale",
        sourceFamily: "twelve-data",
        eligibility,
        price,
        observedAt: quoteTime.observedAt,
        provenanceVerified: true,
        provenanceMethod: quoteTime.paperTimestampVerified
          ? `provider-batch-quote-${quoteTime.source}-us-realtime-venue`
          : "provider-batch-quote-timestamp-missing-validation-only",
      });
      if (normalized) refreshed.push(normalized);
    }
  } catch (error) {
    const code = String(error?.message || "TWELVE_DATA_BATCH_FETCH_FAILED").replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 80);
    for (const instrument of candidates) batchErrors.push({ symbol: instrument.symbol, provider: "twelve-data", code });
  }
}

const observations = deduplicateExecutionEvidence([...withoutTwelve, ...refreshed]);
const twelveEvidence = observations.filter((item) => item.sourceFamily === "twelve-data");
const capabilities = {
  ...(evidence.capabilities || {}),
  twelveDataConfigured: Boolean(apiKey),
  twelveDataProbeMode: "single-http-batch-snapshot",
  twelveDataCandidateCount: probeUniverse
    .map((symbol) => {
      const normalized = normalizeExecutionSymbol(symbol);
      const source = masterByTicker.get(normalized) || {};
      return { symbol: normalized, assetClass: source.assetClass, exchangeMic: source.exchangeMic };
    })
    .filter(isTwelveDataPaperCandidate).length,
  twelveDataProbeLimit: probeLimit,
  twelveDataProbedSymbols: candidates.map((instrument) => instrument.symbol),
  twelveDataPaperFreshObservations: twelveEvidence.filter((item) => item.eligibility === "PAPER").length,
  twelveDataValidationOnlyObservations: twelveEvidence.filter((item) => item.eligibility === "VALIDATION_ONLY").length,
  twelveDataBatchCreditsRequested: candidates.length,
  twelveDataBatchRequests: apiKey && candidates.length ? 1 + rateLimitRetries : 0,
  twelveDataRateLimitEvents: rateLimitEvents,
  twelveDataRateLimitRetries: rateLimitRetries,
  twelveDataTimestampPolicy: "PAPER accepts provider last_quote_at when present or the documented /quote timestamp at interval=1min; venue, realtime entitlement, verified provenance and <=120-second freshness remain mandatory",
  twelveDataRateLimitPolicy: "one coherent multi-symbol batch request; 429 uses Retry-After/exponential backoff; freshness and provenance are never relaxed",
  twelveDataFreeRealtimeScope: "US-listed equities/ETFs only; recognized realtime venue, provider /quote timestamp, verified provenance and <=120-second freshness are required",
};

const report = {
  ...evidence,
  generatedAt: new Date().toISOString(),
  observations,
  errors: [...nonTwelveErrors, ...batchErrors],
  capabilities,
  policy: {
    ...(evidence.policy || {}),
    providerBatchSnapshotsMustUseProviderTimestamps: true,
    quoteEndpointTimestampMayConferPaperFreshness: true,
    candleOpenTimestampNeverConfersPaperFreshness: true,
    liveTradingAllowed: false,
  },
};
await writeJsonStateAtomic(evidencePath, report);

const fx = await fetchFreshUsdEur();
const fxGeneratedAt = new Date().toISOString();
await writeJsonStateAtomic(fxEvidencePath, {
  version: 1,
  generatedAt: fxGeneratedAt,
  baseCurrency: "EUR",
  provider: "twelve-data",
  provenanceVerified: true,
  ratesToEuro: {
    EUR: { rate: 1, observedAt: fxGeneratedAt, source: "identity" },
    USD: { rate: fx.rate, observedAt: fx.observedAt, source: "Twelve Data /exchange_rate USD/EUR" },
  },
  maxAgeSeconds: fxFreshnessSeconds,
  freshnessAttempt: fx.freshnessAttempt,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
});

console.log(`Fenice Twelve Data batch refresh: symbols=${candidates.length}, paperFresh=${capabilities.twelveDataPaperFreshObservations}/${twelveEvidence.length}, errors=${batchErrors.length}, 429=${rateLimitEvents}/${rateLimitRetries}, mode=${capabilities.twelveDataProbeMode}, USD/EUR=${fx.rate}, fxAge=${fx.ageSeconds.toFixed(1)}s, fxAttempt=${fx.freshnessAttempt}.`);
