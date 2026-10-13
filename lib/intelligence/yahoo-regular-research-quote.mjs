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
