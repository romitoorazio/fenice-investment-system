/**
 * Read-only global market-session awareness for Fenice research.
 * Regular hours are INDICATIVE: weekends, exchange holidays, shortened
 * sessions, instrument halts and venue-specific entitlement are not proven.
 * Only a fresh, internally consistent Alpaca PAPER clock may prove the
 * US-equities aggregate session. Neither calendar inference nor this module
 * can authorize PAPER orders, broker access, or LIVE execution.
 */
export type MarketTruth = "OPEN" | "CLOSED" | "UNKNOWN";
export type IndicativePhase = "REGULAR_WINDOW" | "OUTSIDE_REGULAR_WINDOW" | "UNMAPPED";

export type PaperMarketClock = {
  generatedAt?: string;
  configured?: boolean;
  liveTradingAllowed?: boolean;
  evidence?: {
    venue?: string;
    state?: string;
    source?: string;
    observedAt?: string;
    authoritative?: boolean;
  };
  decision?: { allowed?: boolean; state?: string; ageSeconds?: number };
};

type Hours = readonly [number, number];
type VenueSpec = {
  mic: string;
  name: string;
  timeZone: string;
  regularMinutes: readonly Hours[];
  sourceUrl: string;
};

const toMinute = (hour: number, minute = 0) => hour * 60 + minute;
const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

export const VENUE_SCHEDULES: readonly VenueSpec[] = [
  { mic: "XNYS", name: "NYSE", timeZone: "America/New_York",
    regularMinutes: [[toMinute(9, 30), toMinute(16)]],
    sourceUrl: "https://www.nyse.com/trade/trading-information" },
  { mic: "XNAS", name: "Nasdaq US", timeZone: "America/New_York",
    regularMinutes: [[toMinute(9, 30), toMinute(16)]],
    sourceUrl: "https://www.nasdaq.com/market-activity/stock-market-holiday-schedule" },
  { mic: "ARCX", name: "NYSE Arca", timeZone: "America/New_York",
    regularMinutes: [[toMinute(9, 30), toMinute(16)]],
    sourceUrl: "https://www.nyse.com/trade/trading-information" },
  { mic: "XMIL", name: "Euronext Milan", timeZone: "Europe/Rome",
    regularMinutes: [[toMinute(9), toMinute(17, 30)]],
    sourceUrl: "https://www.borsaitaliana.it/azioni/mercati/negoziazioni/negoziazioni/negoziazioni.htm" },
  { mic: "XPAR", name: "Euronext Paris", timeZone: "Europe/Paris",
    regularMinutes: [[toMinute(9, 1), toMinute(17, 30)]],
    sourceUrl: "https://www.euronext.com/en/trading/trading-hours-holidays" },
  { mic: "XETR", name: "Xetra", timeZone: "Europe/Berlin",
    regularMinutes: [[toMinute(9), toMinute(17, 30)]],
    sourceUrl: "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours" },
  { mic: "XTKS", name: "Tokyo Stock Exchange", timeZone: "Asia/Tokyo",
    regularMinutes: [[toMinute(9), toMinute(11, 30)], [toMinute(12, 30), toMinute(15, 30)]],
    sourceUrl: "https://www.jpx.co.jp/english/equities/trading/domestic/01.html" },
  { mic: "XSHG", name: "Shanghai Stock Exchange", timeZone: "Asia/Shanghai",
    regularMinutes: [[toMinute(9, 30), toMinute(11, 30)], [toMinute(13), toMinute(14, 57)]],
    sourceUrl: "https://english.sse.com.cn/start/trading/schedule/" },
  { mic: "XNSE", name: "NSE India", timeZone: "Asia/Kolkata",
    regularMinutes: [[toMinute(9, 15), toMinute(15, 30)]],
    sourceUrl: "https://www.nseindia.com/resources/exchange-communication-holidays" },
];

const byMic = new Map(VENUE_SCHEDULES.map((row) => [row.mic, row]));
const US_MIC = new Set(["XNAS", "XNYS", "ARCX"]);
const MAX_SESSION_AGE_SECONDS = 120;
const quoteFamilies = ["alpaca", "twelve-data"] as const;

function parseAgeSeconds(value: unknown, now: number): number {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? (now - time) / 1000 : Number.POSITIVE_INFINITY;
}
function isRecent(value: unknown, now: number) {
  const age = parseAgeSeconds(value, now);
  return Number.isFinite(age) && age >= -5 && age <= MAX_SESSION_AGE_SECONDS;
}
function localParts(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(now));
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "";
  return {
    weekday: part("weekday"),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

/**
 * Infer a possible regular trading window, NEVER an authoritative open state.
 * The source calendar for exchange holidays/early closes is NOT connected.
 */
export function indicativeVenuePhase(mic: string, now = Date.now()): IndicativePhase {
  const spec = byMic.get(String(mic || "").toUpperCase());
  if (!spec || !Number.isFinite(now)) return "UNMAPPED";
  const local = localParts(now, spec.timeZone);
  if (!WEEKDAYS.has(local.weekday)) return "OUTSIDE_REGULAR_WINDOW";
  const minute = local.hour * 60 + local.minute;
  return spec.regularMinutes.some(([start, end]) => minute >= start && minute < end)
    ? "REGULAR_WINDOW"
    : "OUTSIDE_REGULAR_WINDOW";
}

/**
 * Do not accept merely configured, OLD, future-dated or contradictory clocks.
 * Source and venue identities must be explicit and trusted.
 */
export function verifyUsPaperClock(clock: PaperMarketClock | null | undefined, now = Date.now()) {
  const state = String(clock?.evidence?.state || "").toUpperCase();
  const open = state === "OPEN";
  const closed = state === "CLOSED";
  const reportedAge = clock?.decision?.ageSeconds;
  const trusted = Number.isFinite(now)
    && clock?.configured === true
    && clock?.liveTradingAllowed === false
    && clock?.evidence?.venue === "US_EQUITIES"
    && clock?.evidence?.source === "Alpaca Paper Trading Clock"
    && clock?.evidence?.authoritative === true
    && (open || closed)
    && clock?.decision?.state === state
    && clock?.decision?.allowed === open
    && typeof reportedAge === "number"
    && Number.isFinite(reportedAge)
    && reportedAge >= 0 && reportedAge <= MAX_SESSION_AGE_SECONDS
    && isRecent(clock.generatedAt, now)
    && isRecent(clock.evidence.observedAt, now);

  return {
    truth: trusted ? (open ? "OPEN" : "CLOSED") as MarketTruth : "UNKNOWN" as MarketTruth,
    authoritative: trusted,
    source: trusted ? "Alpaca Paper Trading Clock" : null,
    observedAt: trusted ? clock?.evidence?.observedAt ?? null : null,
    reason: trusted ? null : "US_CLOCK_MISSING_STALE_OR_CONTRADICTORY",
  };
}

export function resolveVenueSession(
  mic: string,
  usClock: PaperMarketClock | null | undefined,
  now = Date.now(),
) {
  const upperMic = String(mic || "").trim().toUpperCase();
  const spec = byMic.get(upperMic);
  const indicativePhase = indicativeVenuePhase(upperMic, now);
  const usTruth = US_MIC.has(upperMic) ? verifyUsPaperClock(usClock, now) : null;
  const state: MarketTruth = usTruth?.truth || "UNKNOWN";
  const authoritative = usTruth?.authoritative === true;
  const paperQuoteRefreshCandidate = US_MIC.has(upperMic) && state === "OPEN" && authoritative;
  return {
    mic: upperMic,
    name: spec?.name ?? "Unmapped venue",
    timeZone: spec?.timeZone ?? null,
    indicativePhase,
    state,
    authoritative,
    stateSource: usTruth?.source ?? null,
    stateObservedAt: usTruth?.observedAt ?? null,
    regularHoursSource: spec?.sourceUrl ?? null,
    calendarHolidayVerified: false,
    instrumentHaltVerified: false,
    researchAllowed: true,
    paperQuoteRefreshCandidate,
    dataProviderCandidates: paperQuoteRefreshCandidate ? [...quoteFamilies] : [],
    nextAction: paperQuoteRefreshCandidate ? "REFRESH_AND_VERIFY_PAPER_QUOTES" :
      indicativePhase === "REGULAR_WINDOW" ? "RESEARCH_ONLY_AWAIT_AUTHORITATIVE_CLOCK" : "RESEARCH_ONLY",
    executionAuthorized: false,
    liveTradingAllowed: false,
    reason: usTruth?.reason ?? "VENUE_CLOCK_NOT_CONNECTED",
  };
}
