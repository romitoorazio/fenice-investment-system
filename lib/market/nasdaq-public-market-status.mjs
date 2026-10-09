/**
 * Nasdaq's public US market-info page is an advisory market-state signal.
 * It is NOT an exchange trading halt feed, licensed live clock, quote or
 * execution authority. Its freshness and local trading window are checked
 * before presenting a "reported open" label.
 */
export const NASDAQ_PUBLIC_MARKET_INFO = "https://api.nasdaq.com/api/market-info";
const MAX_HTTP_AGE_SECONDS = 90;
const COOLDOWN_MS = 30_000;

function unknown(reason) {
  return {
    state: "UNKNOWN",
    source: "Nasdaq public market-info",
    sourceUrl: NASDAQ_PUBLIC_MARKET_INFO,
    observedAt: null,
    confidence: "ADVISORY_ONLY",
    reason,
    executionAuthoritative: false,
    liveTradingAllowed: false,
  };
}

function nyDateAndMinute(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(now));
  const pick = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    date: [pick("year"),pick("month"),pick("day")].join("-"),
    minute: Number(pick("hour")) * 60 + Number(pick("minute")),
  };
}

function localWindow(raw, expectedDate) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}$/.exec(String(raw || ""));
  if (!match || match[1] !== expectedDate) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute : null;
}

export function interpretNasdaqPublicMarketInfo(payload, headers, now = Date.now()) {
  if (!Number.isFinite(now)) return unknown("INVALID_CLOCK");
  const reportedAt = Date.parse(String(headers?.get?.("date") || ""));
  const reportedAge = Number(headers?.get?.("age") || 0);
  if (!Number.isFinite(reportedAt) || now < reportedAt - 5000 ||
      now - reportedAt > MAX_HTTP_AGE_SECONDS * 1000 ||
      !Number.isFinite(reportedAge) || reportedAge < 0 || reportedAge > MAX_HTTP_AGE_SECONDS) {
    return unknown("PUBLIC_STATUS_HTTP_FRESHNESS_UNPROVEN");
  }
  const data = payload?.data;
  if (payload?.status?.rCode !== 200 || data?.country !== "U.S.") {
    return unknown("INVALID_PROVIDER_PAYLOAD");
  }
  const raw = String(data.mrktStatus ?? "").trim().toLowerCase();
  const indicator = String(data.marketIndicator ?? "").trim().toLowerCase();
  const state = raw === "open" && indicator === "market open" ? "OPEN" :
    raw === "closed" && indicator === "market closed" ? "CLOSED" : "UNKNOWN";
  if (state === "UNKNOWN") return unknown("INCONSISTENT_PUBLIC_STATUS");

  if (state === "OPEN") {
    if (data.isBusinessDay !== true) return unknown("OPEN_WITHOUT_BUSINESS_DAY");
    const local = nyDateAndMinute(now);
    const openedAt = localWindow(data.openRaw, local.date);
    const closedAt = localWindow(data.closeRaw, local.date);
    if (openedAt === null || closedAt === null || openedAt >= closedAt ||
        local.minute < openedAt || local.minute >= closedAt) {
      return unknown("PUBLIC_OPEN_OUTSIDE_REPORTED_WINDOW");
    }
  }
  return {
    state,
    source: "Nasdaq public market-info",
    sourceUrl: NASDAQ_PUBLIC_MARKET_INFO,
    observedAt: new Date(reportedAt).toISOString(),
    confidence: "ADVISORY_ONLY",
    reason: null,
    executionAuthoritative: false,
    liveTradingAllowed: false,
  };
}

export async function fetchNasdaqPublicMarketStatus({
  fetcher = fetch,
  now = Date.now(),
  signal,
} = {}) {
  try {
    const result = await fetcher(NASDAQ_PUBLIC_MARKET_INFO, {
      method: "GET",
      signal,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "FeniceInvestmentSystem/1.9 market-status-research",
        "cache-control": "no-cache",
      },
    });
    if (!result?.ok) return unknown("PUBLIC_STATUS_HTTP_FAILURE");
    const payload = await result.json();
    return interpretNasdaqPublicMarketInfo(payload, result.headers, now);
  } catch {
    return unknown("PUBLIC_STATUS_UNAVAILABLE");
  }
}

// Per-instance cache reduces provider load under concurrent dashboard/API calls.
// On error the result stays UNKNOWN. Stale responses NEVER become OPEN.
let cached = null;
export async function getNasdaqPublicMarketStatus(now = Date.now()) {
  if (cached?.expiresAt > now) return cached.promise;
  const promise = fetchNasdaqPublicMarketStatus({
    now,
    signal: AbortSignal.timeout(5000),
  });
  cached = { expiresAt: now + COOLDOWN_MS, promise };
  return promise;
}
