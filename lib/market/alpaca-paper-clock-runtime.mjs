/**
 * Server-only HTTP GET diagnostic for the already configured Alpaca PAPER clock.
 * Credentials stay in encrypted server environment variables, never in JSON,
 * logs, frontend code, or Next.js public variables.
 *
 * This module does not expose a trading or order API.
 */
export const ALPACA_PAPER_CLOCK_ENDPOINT = "https://paper-api.alpaca.markets/v2/clock";
const MAX_CLOCK_AGE_SECONDS = 90;
const REQUEST_TIMEOUT_MS = 5000;
const MIN_CACHE_MS = 15000;

function checkedTime(now) {
  return Number.isFinite(now) ? new Date(now).toISOString() : null;
}
function noClock(now, configured, reason) {
  const timestamp = checkedTime(now) || new Date(0).toISOString();
  return {
    version: 1,
    generatedAt: timestamp,
    configured: configured === true,
    evidence: {
      venue: "US_EQUITIES",
      state: "UNKNOWN",
      source: "Alpaca Paper Trading Clock",
      observedAt: timestamp,
      authoritative: false,
    },
    decision: { allowed: false, reasons: [reason], ageSeconds: 999999, state: "UNKNOWN" },
    nextOpen: null,
    nextClose: null,
    diagnosticOnly: true,
    brokerConnectivityAllowed: false,
    liveTradingAllowed: false,
    error: reason,
  };
}
function validTimestamp(value) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function evaluateAlpacaClockResponse(data, now = Date.now()) {
  const providerTime = validTimestamp(data?.timestamp);
  const timestampMs = Date.parse(providerTime || "");
  const ageSeconds = (now - timestampMs) / 1000;
  const validTime = Number.isFinite(now) && providerTime !== null && Number.isFinite(ageSeconds)
    && ageSeconds >= -5 && ageSeconds <= MAX_CLOCK_AGE_SECONDS;
  const validOpen = typeof data?.is_open === "boolean";
  if (!validTime || !validOpen) return noClock(now, true, !validOpen ? "INVALID_ALPACA_CLOCK_STATE" : "STALE_OR_INVALID_ALPACA_CLOCK");
  const state = data.is_open ? "OPEN" : "CLOSED";
  const observed = Number(ageSeconds.toFixed(3));
  return {
    version: 1,
    generatedAt: checkedTime(now),
    configured: true,
    evidence: {
      venue: "US_EQUITIES", state,
      source: "Alpaca Paper Trading Clock",
      observedAt: providerTime,
      authoritative: true,
    },
    decision: {
      allowed: state === "OPEN",
      reasons: state === "OPEN" ? [] : ["market is closed"],
      ageSeconds: Math.max(0, observed),
      state,
    },
    nextOpen: validTimestamp(data.next_open),
    nextClose: validTimestamp(data.next_close),
    diagnosticOnly: true,
    brokerConnectivityAllowed: false,
    liveTradingAllowed: false,
    error: null,
  };
}

/**
 * Only GET /v2/clock on PAPER host is allowed here.
 * Never inject a live trading URL or permit callers to choose the endpoint.
 */
export async function fetchAlpacaPaperClock({
  keyId = "",
  secretKey = "",
  fetcher = fetch,
  now = Date.now(),
} = {}) {
  const configured = typeof keyId === "string" && keyId.trim().length > 0
    && typeof secretKey === "string" && secretKey.trim().length > 0;
  if (!configured) return noClock(now, false, "ALPACA_PAPER_CLOCK_NOT_CONFIGURED");
  try {
    const response = await fetcher(ALPACA_PAPER_CLOCK_ENDPOINT, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        "APCA-API-KEY-ID": keyId.trim(),
        "APCA-API-SECRET-KEY": secretKey.trim(),
      },
    });
    if (!response?.ok) return noClock(now, true, "ALPACA_PAPER_CLOCK_HTTP_ERROR");
    const data = await response.json();
    return evaluateAlpacaClockResponse(data, now);
  } catch {
    // No response body or exception text: these could contain sensitive data.
    return noClock(now, true, "ALPACA_PAPER_CLOCK_REQUEST_FAILED");
  }
}

let cached = null;
export async function getAlpacaPaperClock(now = Date.now()) {
  const keyId = String(process.env.APCA_API_KEY_ID || "").trim();
  const secretKey = String(process.env.APCA_API_SECRET_KEY || "").trim();
  if (!keyId || !secretKey) return noClock(now, false, "ALPACA_PAPER_CLOCK_NOT_CONFIGURED");
  // Do not cache credentials, log credentials or return them to route callers.
  if (!cached || cached.expiresAt <= now) {
    cached = {
      expiresAt: now + MIN_CACHE_MS,
      promise: fetchAlpacaPaperClock({ keyId, secretKey, now }),
    };
  }
  const result = await cached.promise;
  const ageMs = now - Date.parse(result?.evidence?.observedAt || "");
  if (result.evidence.authoritative && (!Number.isFinite(ageMs) || ageMs < -5000 || ageMs > MAX_CLOCK_AGE_SECONDS * 1000)) {
    return noClock(now, true, "ALPACA_PAPER_CLOCK_CACHE_EXPIRED");
  }
  if (result.evidence.authoritative) {
    return {
      ...result,
      generatedAt: checkedTime(now),
      decision: {
        ...result.decision,
        ageSeconds: Number((Math.max(0, ageMs) / 1000).toFixed(3)),
      },
    };
  }
  return result;
}
