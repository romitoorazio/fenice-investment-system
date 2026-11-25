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
const META_SOURCE = "Yahoo Finance chart META regularMarketPrice/regularMarketTime";
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
    source: META_SOURCE,
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
    source: META_SOURCE,
    evidenceType: "YAHOO_WORLD_REGULAR_TRADE_RESEARCH_ONLY",
    feedCount: 1, exactMicExecutionVerified: false,
    executionEligible: false, paperCertificationEligible: false,
    brokerSubmissionAllowed: false, liveTradingAllowed: false,
  };
}

// Recheck a persisted observation at the Committee's decision time. The two
// evidence types keep worldwide listings out of the US-only shadow evaluator.
export function committeeSessionResearchQuote(asset, snapshotAt, decisionMs) {
  const technical = asset?.technical;
  if (!technical || !asset.symbol || technical.symbol !== asset.symbol
      || technical.currency !== asset.currency) return null;
  const world = technical.researchOnly === true;
  const quote = world ? technical.worldIntradayResearchQuote : technical.researchQuote;
  if (!quote || !positive(quote.price) || quote.source !== META_SOURCE || quote.feedCount !== 1
      || quote.executionEligible !== false || quote.paperCertificationEligible !== false
      || quote.brokerSubmissionAllowed !== false || quote.liveTradingAllowed !== false) return null;

  const observedMs = Date.parse(quote.observedAt);
  const snapshotMs = Date.parse(snapshotAt);
  if (!Number.isFinite(observedMs) || new Date(observedMs).toISOString() !== quote.observedAt
      || !Number.isFinite(snapshotMs) || new Date(snapshotMs).toISOString() !== snapshotAt
      || !Number.isSafeInteger(decisionMs) || observedMs > snapshotMs || snapshotMs > decisionMs
      || decisionMs - observedMs > MAX_AGE_MS) return null;

  if (world) {
    const listing = WORLD_YAHOO_RESEARCH_SYMBOLS[technical.exchangeMic + ":" + asset.symbol];
    if (!listing || listing.query !== technical.yahooSymbol || listing.currency !== asset.currency
        || quote.evidenceType !== "YAHOO_WORLD_REGULAR_TRADE_RESEARCH_ONLY"
        || quote.currency !== asset.currency || quote.exchangeMic !== technical.exchangeMic
        || quote.exactMicExecutionVerified !== false) return null;
  } else if (technical.market !== "USA" || asset.currency !== "USD"
      || quote.evidenceType !== "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY") return null;

  return {
    price: quote.price, observedAt: quote.observedAt, source: META_SOURCE,
    evidenceType: quote.evidenceType, feedCount: 1,
    ...(world ? {exchangeMic: quote.exchangeMic, currency: quote.currency, exactMicExecutionVerified: false} : {}),
    referencePriceSemantics: technical.timestampSemantics === "DAILY_CANDLE_SESSION_BUCKET_NOT_LAST_TRADE"
      ? "DAILY_ADJUSTED_CANDLE_CLOSE" : null,
    executionEligible: false, paperCertificationEligible: false,
    brokerSubmissionAllowed: false, liveTradingAllowed: false,
  };
}
