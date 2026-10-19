/**
 * World PAPER V7 data-rights discovery.
 * Sanitised observer. No broker, orders, activation of entitlements, or prices
 * are published. A single upstream feed cannot satisfy 2-source PAPER quorum.
 */
export const WORLD_V7_PILOT = Object.freeze({
  XTKS: Object.freeze({ symbol: "7203", exchangeMic: "XTKS", currency: "JPY", region: "asia-pacific", market: "Tokyo" }),
  XMIL: Object.freeze({ symbol: "ENEL", exchangeMic: "XMIL", currency: "EUR", region: "europe", market: "Milan" }),
  XETR: Object.freeze({ symbol: "SIE", exchangeMic: "XETR", currency: "EUR", region: "europe", market: "Frankfurt/Xetra" }),
});
const MAX_AGE_MS = 120_000;
const PROVIDER = "twelve-data";
function utcInstant(value) {
  const ms = typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}
function isProviderError(payload) {
  return !payload || typeof payload !== "object" || Array.isArray(payload) ||
    payload.status === "error" || typeof payload.code === "number" && payload.code >= 400;
}
function providerErrorCode(payload) {
  const code = Number(payload?.code);
  if (code === 429) return "RATE_LIMIT";
  if (code === 401 || code === 403) return "NO_ACCESS";
  if (code === 400 || code === 404) return "NOT_FOUND_OR_INVALID_IDENTIFIER";
  return "PROVIDER_ERROR";
}
export function classifyMarketState(target, payload, requestedAt) {
  const nowMs = utcInstant(requestedAt);
  if (!target || nowMs === null) return { status: "INVALID_REQUEST_CLOCK", reportedOpen: null, observedAt: null, exactMic: false };
  if (Array.isArray(payload)) {
    const exact = payload.filter(x=>x && x.code === target.exchangeMic);
    if (exact.length !== 1 || typeof exact[0].is_market_open !== "boolean")
      return { status: "UNVERIFIED_RESPONSE", reportedOpen: null, observedAt: requestedAt, exactMic: false };
    return { status: "PROVIDER_REPORTED", reportedOpen: exact[0].is_market_open,
      observedAt: requestedAt, exactMic: true, provider: PROVIDER, authoritativeExchangeProof: false };
  }
  return { status: isProviderError(payload) ? providerErrorCode(payload) : "UNVERIFIED_RESPONSE",
    reportedOpen: null, observedAt: requestedAt, exactMic: false };
}
export function classifyQuote(target, payload, requestedAt) {
  const now = utcInstant(requestedAt);
  const base = { status: "UNVERIFIED", provider: PROVIDER, returnedSymbolMatched: false,
    returnedMicMatched: false, currencyMatched: false, tradeTimestamp: null,
    ageSeconds: null, providerPricePresent: false, pricingRightsVerified: false,
    realtimeEntitled: false, paperEligible: false, observationOnly: true };
  if (!target || now === null) return { ...base, status: "INVALID_REQUEST_CLOCK" };
  if (isProviderError(payload)) return { ...base, status: providerErrorCode(payload) };
  const returnedMic = String(payload.mic_code || payload.exchange_mic || payload.mic || "").toUpperCase().trim();
  const returnedSymbolMatched = payload.symbol === target.symbol;
  const returnedMicMatched = returnedMic === target.exchangeMic; // Request MIC does not prove response MIC.
  const currencyMatched = payload.currency === target.currency;
  // Do not guess exchange-local time from an ambiguous "datetime" string.
  const ts = Number(payload.timestamp);
  const tradeTime = Number.isSafeInteger(ts) && ts > 0 ? ts * 1000 : NaN;
  const seconds = Number(payload.close);
  const ageSeconds = Number.isFinite(tradeTime) ? (now - tradeTime) / 1000 : null;
  const providerPricePresent = Number.isFinite(seconds) && seconds > 0;
  const timestampFresh = ageSeconds !== null && ageSeconds >= 0 && ageSeconds <= MAX_AGE_MS / 1000;
  const quoteValid = returnedSymbolMatched && returnedMicMatched && currencyMatched && timestampFresh && providerPricePresent;
  let status = "DATA_GAP";
  if (!returnedSymbolMatched) status = "SYMBOL_MISMATCH";
  else if (!returnedMicMatched) status = "MIC_UNVERIFIED";
  else if (!currencyMatched) status = "CURRENCY_MISMATCH";
  else if (!providerPricePresent) status = "PRICE_UNAVAILABLE";
  else if (ageSeconds === null) status = "TIMESTAMP_MISSING";
  else if (!timestampFresh) status = "STALE_OR_FUTURE_TRADE";
  else status = "FRESH_RESEARCH_QUOTE_RIGHTS_UNVERIFIED";
  return { ...base, status,
    returnedSymbolMatched, returnedMicMatched, currencyMatched, providerPricePresent,
    tradeTimestamp: Number.isFinite(tradeTime) ? new Date(tradeTime).toISOString() : null,
    ageSeconds: ageSeconds === null ? null : Math.round(ageSeconds),
    researchFresh: quoteValid, // Still not a PAPER provider-rights admission.
  };
}
export function emptyPilotObservation(venue, nowIso, status = "CREDENTIAL_NOT_CONFIGURED") {
  const target = WORLD_V7_PILOT[venue];
  if (!target || utcInstant(nowIso) === null) throw new Error("INVALID_WORLD_V7_OBSERVATION_REQUEST");
  return {
    schemaVersion: 1, recordedAt: nowIso, venue: target.exchangeMic,
    target: { symbol: target.symbol, mic: target.exchangeMic, currency: target.currency, region: target.region },
    provider: PROVIDER, mode: "PROVIDER_ACCESS_DIAGNOSTIC_ONLY",
    state: { status, reportedOpen: null, observedAt: null, exactMic: false },
    quote: { status, providerPricePresent: false, tradeTimestamp: null, paperEligible: false },
    blockers: ["SECOND_INDEPENDENT_ENTITLED_QUOTE_MISSING", "PAPER_RIGHTS_NOT_VERIFIED", "VENUE_OPEN_AUTHORITY_NOT_CERTIFIED"],
    quoteFamiliesApproved: 0, paperReady: false, liveTradingAllowed: false, brokerConnectivityAllowed: false,
    privatePricePublished: false,
  };
}
export function buildPilotObservation(venue, nowIso, rawState, rawQuote) {
  const item = emptyPilotObservation(venue, nowIso, "REQUESTED");
  item.state = classifyMarketState(WORLD_V7_PILOT[venue], rawState, nowIso);
  item.quote = classifyQuote(WORLD_V7_PILOT[venue], rawQuote, nowIso);
  if (item.state.status !== "PROVIDER_REPORTED") item.blockers.push("PROVIDER_MARKET_STATE_MISSING");
  else if (item.state.reportedOpen === false) item.blockers.push("PROVIDER_REPORTED_CLOSED");
  if (item.quote.status !== "FRESH_RESEARCH_QUOTE_RIGHTS_UNVERIFIED") item.blockers.push(item.quote.status);
  if (item.target.currency !== "EUR") item.blockers.push("INDEPENDENT_FX_EUR_QUOTE_MISSING");
  return item;
}
