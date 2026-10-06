import {
  classifyExecutionPaperEligibility,
  isAlpacaPaperCandidate,
  isTwelveDataPaperCandidate,
  isTwelveDataUsRealtimeVenue,
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
  type ExecutionInstrument,
  type ExecutionMarketEvidence,
} from "../trading/execution-market-data.ts";
import { evaluateMarketSession, type MarketSessionDecision, type MarketSessionEvidence } from "../trading/market-session.ts";

export type PaperReviewProviderCredentials = {
  alpacaKeyId?: string;
  alpacaSecretKey?: string;
  twelveDataApiKey?: string;
};

export type PaperReviewFxEvidence = {
  provider: "twelve-data";
  baseCurrency: "EUR";
  generatedAt: string;
  provenanceVerified: true;
  liveTradingAllowed: false;
  brokerConnectivityAllowed: false;
  ratesToEuro: Record<string, { rate: number; observedAt: string; source: string }>;
};

export type FreshPaperReviewContext = {
  version: 1;
  generatedAt: string;
  purpose: string;
  safety: {
    readOnly: true;
    writesAllowed: false;
    brokerSubmissionAllowed: false;
    liveTradingAllowed: false;
    certificationEvidenceMutationAllowed: false;
  };
  requestedSymbols: string[];
  observations: ExecutionMarketEvidence[];
  marketSession: {
    configured: boolean;
    liveTradingAllowed: false;
    evidence: MarketSessionEvidence;
    decision: MarketSessionDecision;
  };
  fx: PaperReviewFxEvidence | null;
  errors: string[];
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const PAPER_MAX_AGE_SECONDS = 120;
const SESSION_MAX_AGE_SECONDS = 60;
const MAX_REVIEW_SYMBOLS = 3;

const clean = (value: unknown) => String(value ?? "").trim();
const code = (value: unknown) => clean(value).replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 96) || "UNKNOWN_ERROR";

function uniqueInstruments(values: readonly ExecutionInstrument[]): ExecutionInstrument[] {
  const seen = new Set<string>();
  const rows: ExecutionInstrument[] = [];
  for (const item of Array.isArray(values) ? values : []) {
    const symbol = normalizeExecutionSymbol(item?.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({ ...item, symbol });
    if (rows.length >= MAX_REVIEW_SYMBOLS) break;
  }
  return rows;
}

async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  timeoutMs = 5_000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_JSON_OBJECT");
    return body as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function providerTimestamp(value: unknown): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const parsed = new Date(numeric * 1000);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function freshTimestamp(value: unknown, now: number, maxAgeSeconds: number): string | null {
  const raw = clean(value);
  const parsed = Date.parse(raw);
  const ageSeconds = Number.isFinite(parsed) ? (now - parsed) / 1000 : Number.POSITIVE_INFINITY;
  return Number.isFinite(parsed) && ageSeconds >= 0 && ageSeconds <= maxAgeSeconds
    ? new Date(parsed).toISOString()
    : null;
}

async function fetchAlpacaClock(
  fetchImpl: FetchLike,
  credentials: PaperReviewProviderCredentials,
  now: number,
): Promise<{ configured: boolean; evidence: MarketSessionEvidence; decision: MarketSessionDecision }> {
  const keyId = clean(credentials.alpacaKeyId);
  const secret = clean(credentials.alpacaSecretKey);
  const fallbackEvidence: MarketSessionEvidence = {
    venue: "US_EQUITIES",
    state: "UNKNOWN",
    source: "Alpaca Paper Trading Clock",
    observedAt: new Date(now).toISOString(),
    authoritative: false,
  };
  if (!keyId || !secret) {
    return {
      configured: false,
      evidence: fallbackEvidence,
      decision: evaluateMarketSession(fallbackEvidence, { maxAgeSeconds: SESSION_MAX_AGE_SECONDS }, now),
    };
  }

  const body = await requestJson(fetchImpl, "https://paper-api.alpaca.markets/v2/clock", {
    headers: {
      accept: "application/json",
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secret,
      "user-agent": "FeniceInvestmentSystem/1.9 paper-review-readonly",
    },
  });
  const observedAt = freshTimestamp(body.timestamp, now, SESSION_MAX_AGE_SECONDS);
  const state = body.is_open === true ? "OPEN" : body.is_open === false ? "CLOSED" : "UNKNOWN";
  const evidence: MarketSessionEvidence = {
    venue: "US_EQUITIES",
    state,
    source: "Alpaca Paper Trading Clock",
    observedAt: observedAt ?? new Date(now).toISOString(),
    authoritative: observedAt !== null && typeof body.is_open === "boolean",
  };
  return {
    configured: true,
    evidence,
    decision: evaluateMarketSession(evidence, { maxAgeSeconds: SESSION_MAX_AGE_SECONDS }, now),
  };
}

async function fetchAlpacaQuote(
  fetchImpl: FetchLike,
  credentials: PaperReviewProviderCredentials,
  instrument: ExecutionInstrument,
  now: number,
): Promise<ExecutionMarketEvidence> {
  const keyId = clean(credentials.alpacaKeyId);
  const secret = clean(credentials.alpacaSecretKey);
  if (!keyId || !secret) throw new Error("ALPACA_MARKET_DATA_NOT_CONFIGURED");
  if (!isAlpacaPaperCandidate(instrument)) throw new Error("ALPACA_INSTRUMENT_NOT_PAPER_SUPPORTED");
  const symbol = normalizeExecutionSymbol(instrument.symbol);
  const body = await requestJson(
    fetchImpl,
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=iex`,
    {
      headers: {
        accept: "application/json",
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secret,
        "user-agent": "FeniceInvestmentSystem/1.9 paper-review-readonly",
      },
    },
  );
  const quote = body.quote && typeof body.quote === "object" ? body.quote as Record<string, unknown> : {};
  const bid = Number(quote.bp);
  const ask = Number(quote.ap);
  const observedAt = freshTimestamp(quote.t, now, PAPER_MAX_AGE_SECONDS);
  if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask <= 0 || ask < bid || !observedAt) {
    throw new Error("INVALID_OR_STALE_ALPACA_IEX_QUOTE");
  }
  const eligibility = classifyExecutionPaperEligibility({
    source: "Alpaca Basic IEX realtime latest quote paper review",
    sourceFamily: "alpaca",
    observedAt,
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  }, now, PAPER_MAX_AGE_SECONDS);
  const normalized = normalizeExecutionEvidence({
    symbol,
    currency: instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: "Alpaca Basic IEX realtime latest quote paper review",
    sourceFamily: "alpaca",
    eligibility,
    price: (bid + ask) / 2,
    observedAt,
    provenanceVerified: true,
    provenanceMethod: "authenticated-alpaca-iex-latest-quote-readonly-review",
  });
  if (!normalized || normalized.eligibility !== "PAPER") throw new Error("ALPACA_QUOTE_NOT_PAPER_ELIGIBLE");
  return normalized;
}

async function fetchTwelveDataQuote(
  fetchImpl: FetchLike,
  credentials: PaperReviewProviderCredentials,
  instrument: ExecutionInstrument,
  now: number,
): Promise<ExecutionMarketEvidence> {
  const apiKey = clean(credentials.twelveDataApiKey);
  if (!apiKey) throw new Error("TWELVE_DATA_NOT_CONFIGURED");
  if (!isTwelveDataPaperCandidate(instrument)) throw new Error("TWELVE_DATA_INSTRUMENT_NOT_PAPER_SUPPORTED");
  const symbol = normalizeExecutionSymbol(instrument.symbol);
  const body = await requestJson(
    fetchImpl,
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&interval=1min&apikey=${encodeURIComponent(apiKey)}`,
    { headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/1.9 paper-review-readonly" } },
  );
  if (String(body.status || "").toLowerCase() === "error" || body.code) throw new Error("TWELVE_DATA_API_ERROR");
  const returnedSymbol = normalizeExecutionSymbol(body.symbol);
  if (returnedSymbol && returnedSymbol !== symbol) throw new Error("TWELVE_DATA_SYMBOL_MISMATCH");
  if (!isTwelveDataUsRealtimeVenue(body)) throw new Error("TWELVE_DATA_NON_US_REALTIME_VENUE");
  const price = Number(body.close ?? body.price);
  const observedAt = freshTimestamp(
    providerTimestamp(body.last_quote_at) ?? providerTimestamp(body.timestamp),
    now,
    PAPER_MAX_AGE_SECONDS,
  );
  if (!Number.isFinite(price) || price <= 0 || !observedAt) throw new Error("INVALID_OR_STALE_TWELVE_DATA_QUOTE");
  const eligibility = classifyExecutionPaperEligibility({
    source: "Twelve Data US realtime venue-verified paper review",
    sourceFamily: "twelve-data",
    observedAt,
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  }, now, PAPER_MAX_AGE_SECONDS);
  const normalized = normalizeExecutionEvidence({
    symbol,
    currency: clean(body.currency) || instrument.currency || "USD",
    assetClass: instrument.assetClass,
    source: "Twelve Data US realtime venue-verified paper review",
    sourceFamily: "twelve-data",
    eligibility,
    price,
    observedAt,
    provenanceVerified: true,
    provenanceMethod: "provider-response-us-realtime-venue-readonly-review",
  });
  if (!normalized || normalized.eligibility !== "PAPER") throw new Error("TWELVE_DATA_QUOTE_NOT_PAPER_ELIGIBLE");
  return normalized;
}

async function fetchFx(
  fetchImpl: FetchLike,
  credentials: PaperReviewProviderCredentials,
  currencies: Set<string>,
  now: number,
): Promise<PaperReviewFxEvidence | null> {
  const rates: Record<string, { rate: number; observedAt: string; source: string }> = {
    EUR: { rate: 1, observedAt: new Date(now).toISOString(), source: "identity" },
  };
  if (!currencies.has("USD")) {
    return {
      provider: "twelve-data",
      baseCurrency: "EUR",
      generatedAt: new Date(now).toISOString(),
      provenanceVerified: true,
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
      ratesToEuro: rates,
    };
  }
  const apiKey = clean(credentials.twelveDataApiKey);
  if (!apiKey) return null;
  const body = await requestJson(
    fetchImpl,
    `https://api.twelvedata.com/exchange_rate?symbol=USD%2FEUR&timezone=UTC&apikey=${encodeURIComponent(apiKey)}`,
    { headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/1.9 paper-review-readonly" } },
  );
  const rate = Number(body.rate);
  const observedAt = freshTimestamp(providerTimestamp(body.timestamp), now, PAPER_MAX_AGE_SECONDS);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 5 || !observedAt) return null;
  rates.USD = { rate, observedAt, source: "Twelve Data /exchange_rate USD/EUR read-only review" };
  return {
    provider: "twelve-data",
    baseCurrency: "EUR",
    generatedAt: new Date(now).toISOString(),
    provenanceVerified: true,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    ratesToEuro: rates,
  };
}

export async function fetchFreshPaperReviewContext({
  instruments,
  credentials,
  now = Date.now(),
  fetchImpl = fetch,
}: {
  instruments: readonly ExecutionInstrument[];
  credentials: PaperReviewProviderCredentials;
  now?: number;
  fetchImpl?: FetchLike;
}): Promise<FreshPaperReviewContext> {
  if (!Number.isFinite(now)) throw new Error("INVALID_REVIEW_CONTEXT_CLOCK");
  const requested = uniqueInstruments(instruments);
  const errors: string[] = [];
  const observations: ExecutionMarketEvidence[] = [];

  let marketSession: FreshPaperReviewContext["marketSession"];
  try {
    const session = await fetchAlpacaClock(fetchImpl, credentials, now);
    marketSession = { ...session, liveTradingAllowed: false };
    if (!session.configured) errors.push("ALPACA_CLOCK_NOT_CONFIGURED");
    if (!session.decision.allowed) errors.push("MARKET_SESSION_NOT_OPEN_OR_FRESH");
  } catch (error) {
    const evidence: MarketSessionEvidence = {
      venue: "US_EQUITIES",
      state: "UNKNOWN",
      source: "Alpaca Paper Trading Clock",
      observedAt: new Date(now).toISOString(),
      authoritative: false,
    };
    marketSession = {
      configured: clean(credentials.alpacaKeyId) !== "" && clean(credentials.alpacaSecretKey) !== "",
      liveTradingAllowed: false,
      evidence,
      decision: evaluateMarketSession(evidence, { maxAgeSeconds: SESSION_MAX_AGE_SECONDS }, now),
    };
    errors.push(`ALPACA_CLOCK_${code(error instanceof Error ? error.message : error)}`);
  }

  for (const instrument of requested) {
    const symbol = normalizeExecutionSymbol(instrument.symbol);
    try {
      observations.push(await fetchAlpacaQuote(fetchImpl, credentials, instrument, now));
    } catch (error) {
      errors.push(`${symbol}:ALPACA:${code(error instanceof Error ? error.message : error)}`);
    }
    try {
      observations.push(await fetchTwelveDataQuote(fetchImpl, credentials, instrument, now));
    } catch (error) {
      errors.push(`${symbol}:TWELVE_DATA:${code(error instanceof Error ? error.message : error)}`);
    }
  }

  const currencies = new Set(requested.map((item) => clean(item.currency || "USD").toUpperCase()));
  let fx: PaperReviewFxEvidence | null = null;
  try {
    fx = await fetchFx(fetchImpl, credentials, currencies, now);
    if (!fx) errors.push("FX_NOT_FRESH_OR_CONFIGURED");
  } catch (error) {
    errors.push(`FX_${code(error instanceof Error ? error.message : error)}`);
  }

  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    purpose: "Read-only fresh context for local PAPER proposal review. Never stages, transmits or certifies an order.",
    safety: {
      readOnly: true,
      writesAllowed: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
      certificationEvidenceMutationAllowed: false,
    },
    requestedSymbols: requested.map((item) => normalizeExecutionSymbol(item.symbol)),
    observations,
    marketSession,
    fx,
    errors: [...new Set(errors)],
  };
}

export function paperReviewCredentialsFromEnvironment(env: NodeJS.ProcessEnv = process.env): PaperReviewProviderCredentials {
  return {
    alpacaKeyId: clean(env.APCA_API_KEY_ID || env.ALPACA_API_KEY),
    alpacaSecretKey: clean(env.APCA_API_SECRET_KEY || env.ALPACA_API_SECRET),
    twelveDataApiKey: clean(env.TWELVE_DATA_API_KEY),
  };
}
