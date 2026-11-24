import { WORLD_YAHOO_RESEARCH_SYMBOLS, verifiesWorldYahooResearchMeta, normalizeWorldYahooResearchPrice } from "./world-terminal-universe.mjs";

/**
 * Read-only Yahoo chart META quote, distinct from 1d OHLC candle timestamps.
 * The first timestamp of a daily OHLC bar is its SESSION BUCKET, not a price
 * observation and can NEVER create a forward SHADOW research trade.
 *
 * This quote is one provider's self-reported regular-session last trade:
 * research-only, no broker, PAPER evidence or execution permission.
 */
const MAX_AGE_MS = 30 * 60_000;
const toMillis = (seconds) =>
  typeof seconds === "number" && Number.isSafeInteger(seconds) &&
  seconds >= 946684800 && seconds < 4102444800 ? seconds * 1000 : null;
const positive = (value) => typeof value === "number" &&
  Number.isFinite(value) && value > 0;

export function yahooRegularSessionResearchQuote(meta, {
  yahooSymbol,
  market,
  now = new Date(),
} = {}) {
  const currentTime = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(currentTime) || !meta || market !== "USA" ||
    typeof yahooSymbol !== "string" || !yahooSymbol ||
    meta.symbol !== yahooSymbol || meta.currency !== "USD" ||
    !positive(meta.regularMarketPrice)) return null;

  const observedMs = toMillis(meta.regularMarketTime);
  const sessionStart = toMillis(meta.currentTradingPeriod?.regular?.start);
  const sessionEnd = toMillis(meta.currentTradingPeriod?.regular?.end);
  if (observedMs === null || sessionStart === null || sessionEnd === null ||
    sessionEnd <= sessionStart || observedMs < sessionStart ||
    observedMs > sessionEnd || observedMs > currentTime ||
    currentTime - observedMs > MAX_AGE_MS) return null;
  return {
    price: meta.regularMarketPrice,
    observedAt: new Date(observedMs).toISOString(),
    source: "Yahoo Finance chart META regularMarketPrice/regularMarketTime",
    evidenceType: "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY",
    feedCount: 1,
    executionEligible: false,
    paperCertificationEligible: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
  };
}

/** Separate foreign-listing observation: never a V7 shadow or execution quote. */
export function yahooWorldIntradayResearchQuote(meta, definition, now = new Date()) {
  const marker = definition?.[5];
  const mapped = WORLD_YAHOO_RESEARCH_SYMBOLS[marker?.exchangeMic + ":" + definition?.[0]];
  if (marker?.researchOnly !== true || !mapped ||
      definition[1] !== mapped.query || marker.providerTicker !== mapped.query ||
      marker.currency !== mapped.currency ||
      marker.providerCurrency !== (mapped.providerCurrency ?? mapped.currency) ||
      marker.priceScaleToListing !== (mapped.priceScaleToListing ?? 1) ||
      !verifiesWorldYahooResearchMeta(meta, definition) ||
      !positive(meta?.regularMarketPrice)) return null;
  const currentTime = now instanceof Date ? now.getTime() : NaN;
  const observedMs = toMillis(meta.regularMarketTime);
  const sessionStart = toMillis(meta.currentTradingPeriod?.regular?.start);
  const sessionEnd = toMillis(meta.currentTradingPeriod?.regular?.end);
  if (!Number.isFinite(currentTime) || observedMs === null ||
      sessionStart === null || sessionEnd === null || sessionEnd <= sessionStart ||
      observedMs < sessionStart || observedMs > sessionEnd ||
      observedMs > currentTime || currentTime - observedMs > MAX_AGE_MS) return null;
  const price = normalizeWorldYahooResearchPrice(meta.regularMarketPrice, definition);
  if (!positive(price)) return null;
  return {
    price, currency: marker.currency, exchangeMic: marker.exchangeMic,
    observedAt: new Date(observedMs).toISOString(),
    source: "Yahoo Finance chart META regularMarketPrice/regularMarketTime",
    evidenceType: "YAHOO_WORLD_REGULAR_TRADE_RESEARCH_ONLY",
    feedCount: 1, exactMicExecutionVerified: false,
    executionEligible: false, paperCertificationEligible: false,
    brokerSubmissionAllowed: false, liveTradingAllowed: false,
  };
}
