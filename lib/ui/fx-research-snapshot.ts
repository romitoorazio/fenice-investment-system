/**
 * EUR/USD daily CLOSE data is research-only; it is never a current executable
 * FX quote and cannot satisfy the PAPER USD/EUR execution provenance gate.
 *
 * Yahoo's timestamp[] and indicators.quote[].close[] are aligned by index.
 * Never pair "last non-null close" with timestamp.at(-1), and never fabricate
 * observation time when a provider timestamp is absent.
 */
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const MAX_RESEARCH_AGE_SECONDS = 7 * 86_400;
const CURRENT_DAILY_AGE_SECONDS = 24 * 3600;

export function extractYahooEurUsdResearchSnapshot(payload: unknown, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < Date.UTC(2000, 0, 1)) {
    throw new Error("INVALID_FX_CLOCK");
  }
  if (!object(payload) || !object(payload.chart)) throw new Error("FX_PROVIDER_PAYLOAD_INVALID");
  const result = Array.isArray(payload.chart.result) ? payload.chart.result[0] : null;
  if (!object(result) || !Array.isArray(result.timestamp)) throw new Error("FX_TIMESTAMP_MISSING");
  const indicator = object(result.indicators) && Array.isArray(result.indicators.quote)
    ? result.indicators.quote[0] : null;
  const closes = object(indicator) && Array.isArray(indicator.close) ? indicator.close : null;
  if (!closes || closes.length !== result.timestamp.length) throw new Error("FX_QUOTE_TIMESTAMP_MISMATCH");
  let latest: { rate: number; observedMs: number } | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const rate = closes[i];
    const seconds = result.timestamp[i];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds < 946684800) continue;
    const observedMs = seconds * 1000;
    if (!Number.isSafeInteger(observedMs) || observedMs > now) continue;
    if (!latest || observedMs > latest.observedMs) latest = { rate, observedMs };
  }
  if (!latest) throw new Error("FX_PAIR_WITH_VALID_TIMESTAMP_MISSING");
  const ageSeconds = (now - latest.observedMs) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_RESEARCH_AGE_SECONDS) {
    throw new Error("FX_RESEARCH_PRICE_EXPIRED");
  }
  return {
    eurUsd: latest.rate,
    observedAt: new Date(latest.observedMs).toISOString(),
    source: "Yahoo Finance EURUSD=X",
    status: ageSeconds <= CURRENT_DAILY_AGE_SECONDS ? "operativo" : "parziale",
    quoteKind: "HISTORICAL_DAILY_CLOSE" as const,
    ageSeconds: Math.round(ageSeconds),
    staleForIntraday: ageSeconds > CURRENT_DAILY_AGE_SECONDS,
    researchOnly: true as const,
    paperFxEligible: false as const,
    liveTradingAllowed: false as const,
  };
}
