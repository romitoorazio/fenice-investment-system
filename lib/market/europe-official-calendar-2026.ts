/**
 * Fenice static EU cash-market calendar overlay for calendar year 2026 only.
 * Source evidence: official exchange public calendars (reviewed 2026-10-09).
 * This is a calendar schedule, NEVER a live matching-engine heartbeat or
 * security-halt confirmation. Annual tables may be amended by the venue.
 *
 * Milan: https://www.borsaitaliana.it/borsaitaliana/calendario-e-orari-di-negoziazione/calendario-borsa-orari-di-negoziazione.en.htm
 * Paris: https://www.euronext.com/en/trading/trading-hours-holidays
 * Xetra: https://www.cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours
 */
export type CalendarState =
  | "OFFICIAL_CLOSED"
  | "SPECIAL_HOURS_UNCONFIRMED"
  | "NO_LISTED_CLOSURE"
  | "CALENDAR_NOT_VERIFIED";

type CalendarSpec = {
  sourceUrl: string;
  closed: ReadonlySet<string>;
  special: ReadonlySet<string>;
};

const calendar2026: Record<string, CalendarSpec> = {
  XMIL: {
    sourceUrl: "https://www.borsaitaliana.it/borsaitaliana/calendario-e-orari-di-negoziazione/calendario-borsa-orari-di-negoziazione.en.htm",
    closed: new Set([
      "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01",
      "2026-12-24", "2026-12-25", "2026-12-31",
    ]),
    special: new Set(),
  },
  XPAR: {
    sourceUrl: "https://www.euronext.com/en/trading/trading-hours-holidays",
    closed: new Set([
      "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-12-25",
    ]),
    // Euronext: year-end cash equities are half sessions; the definitive
    // closing hour is instrument/auction-dependent and must be sourced before
    // any execution-grade gate may use these dates.
    special: new Set(["2026-12-24", "2026-12-31"]),
  },
  XETR: {
    sourceUrl: "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours",
    closed: new Set([
      "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01",
      "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31",
    ]),
    // Deutsche Börse warns of potentially different hours on 30 December.
    special: new Set(["2026-12-30"]),
  },
};

const zones: Record<string, string> = {
  XMIL: "Europe/Rome",
  XPAR: "Europe/Paris",
  XETR: "Europe/Berlin",
};

function venueDateAndWeekday(now: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(now));
  const get = (name: string) => parts.find((x) => x.type === name)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
  };
}

/** Calendar evidence helps users interpret trading windows; it never grants OPEN. */
export function getEuropeanOfficialCalendarStatus(mic: string, now = Date.now()) {
  const venue = String(mic || "").trim().toUpperCase();
  const spec = calendar2026[venue];
  const zone = zones[venue];
  if (!spec || !zone || !Number.isFinite(now)) {
    return {
      state: "CALENDAR_NOT_VERIFIED" as CalendarState,
      localDate: null as string | null,
      sourceUrl: spec?.sourceUrl || null,
      reason: "VENUE_OR_TIME_UNSUPPORTED",
      verifiedAnnualCalendar: false,
      provesExchangeOpen: false,
      authorizesOrders: false,
    };
  }
  const local = venueDateAndWeekday(now, zone);
  const auditedYear = local.date.startsWith("2026-");
  let state: CalendarState = "CALENDAR_NOT_VERIFIED";
  let reason = "CALENDAR_YEAR_NOT_AUDITED";
  if (auditedYear) {
    if (local.weekday === "Sat" || local.weekday === "Sun") {
      state = "OFFICIAL_CLOSED";
      reason = "WEEKEND";
    } else if (spec.closed.has(local.date)) {
      state = "OFFICIAL_CLOSED";
      reason = "PUBLISHED_2026_FULL_DAY_CLOSURE";
    } else if (spec.special.has(local.date)) {
      state = "SPECIAL_HOURS_UNCONFIRMED";
      reason = "PUBLISHED_2026_SPECIAL_HOURS_REQUIRE_VERIFICATION";
    } else {
      state = "NO_LISTED_CLOSURE";
      reason = "NO_PUBLISHED_2026_CLOSURE_FOR_DATE";
    }
  }
  return {
    state,
    localDate: local.date,
    sourceUrl: spec.sourceUrl,
    reason,
    verifiedAnnualCalendar: auditedYear,
    provesExchangeOpen: false,
    authorizesOrders: false,
  };
}
