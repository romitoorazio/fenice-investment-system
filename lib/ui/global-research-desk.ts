import { resolveVenueSession, type PaperMarketClock } from "../market/venue-session-intelligence.ts";

type Region = { id: string; name: string; countries: string[] };
type ReferenceRegion = {
  regionId: string; targetCountries: number; providerMatchedCountries: number;
  instrumentCount: number;
};
type CatalogueCountry = { regionId?: string; providerCovered?: boolean; instrumentCount?: number; instrumentTypes?: Record<string, number | undefined> };
type Reference = {
  generatedAt?: string;
  countryCoverage?: CatalogueCountry[];
  regionCoverage?: ReferenceRegion[];
  safety?: { researchOnly?: boolean; paperExecutionAllowed?: boolean;
    liveTradingAllowed?: boolean; brokerConnectivityAllowed?: boolean;
    isolatedFromPaperV6InstrumentMaster?: boolean; changesPaperV6Fingerprint?: boolean };
};
export const GLOBAL_DESK_VENUES = [
  { mic: "XASX", regionId: "asia-pacific" }, { mic: "XTKS", regionId: "asia-pacific" },
  { mic: "XHKG", regionId: "asia-pacific" }, { mic: "XSHG", regionId: "asia-pacific" },
  { mic: "XSES", regionId: "asia-pacific" }, { mic: "XNSE", regionId: "asia-pacific" },
  { mic: "XJSE", regionId: "middle-east-africa" },
  { mic: "XLON", regionId: "europe" }, { mic: "XETR", regionId: "europe" },
  { mic: "XMIL", regionId: "europe" }, { mic: "XPAR", regionId: "europe" },
  { mic: "BVMF", regionId: "latin-america-caribbean" },
  { mic: "XTSE", regionId: "north-america" }, { mic: "XNYS", regionId: "north-america" },
  { mic: "XNAS", regionId: "north-america" },
] as const;

const referenceMs = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
};
const localClock = (now: number, zone: string) => new Intl.DateTimeFormat("it-IT", {
  timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(now);

export function buildGlobalResearchDesk(
  universe: { regions?: Region[] } | null | undefined,
  reference: Reference | null | undefined,
  now: number = Date.now(),
  usPaperClock: PaperMarketClock | null = null,
) {
  const validNow = Number.isSafeInteger(now) && now >= 0 && now <= 8.64e15;
  const assessedNow = validNow ? now : Date.now();
  const asOf = referenceMs(reference?.generatedAt);
  const ageHours = validNow && asOf !== null ? (now - asOf) / 3_600_000 : NaN;
  // A reference catalogue is never a real-time quote; 72h is a review priority,
  // not an exchange entitlement or a trading freshness limit.
  const referenceState = !validNow || !Number.isFinite(ageHours) || ageHours < 0
    ? "UNVERIFIED" as const
    : ageHours > 72 ? "REVIEW_OUTDATED" as const : "REFERENCE_ONLY" as const;
  const locksValid = reference?.safety?.researchOnly === true
    && reference?.safety?.paperExecutionAllowed === false
    && reference?.safety?.liveTradingAllowed === false
    && reference?.safety?.brokerConnectivityAllowed === false
    && reference?.safety?.isolatedFromPaperV6InstrumentMaster === true
    && reference?.safety?.changesPaperV6Fingerprint === false;
  const regions = (Array.isArray(universe?.regions) ? universe.regions : []).filter(region =>
    GLOBAL_DESK_VENUES.some(venue => venue.regionId === region.id));
  const coverage = new Map((Array.isArray(reference?.regionCoverage) ? reference.regionCoverage : [])
    .map(region => [region.regionId, region]));
  const rows = GLOBAL_DESK_VENUES.map(venue => {
    const status = resolveVenueSession(venue.mic, usPaperClock, assessedNow);
    return {
      regionId: venue.regionId, mic: venue.mic, name: status.name,
      localTime: status.timeZone ? localClock(assessedNow, status.timeZone) : null,
      regularHoursSource: status.regularHoursSource,
      indicativePhase: validNow ? status.indicativePhase : "UNMAPPED" as const,
      calendarState: validNow ? status.calendarState : "CALENDAR_NOT_VERIFIED" as const,
      marketTruth: validNow ? status.state : "UNKNOWN" as const,
      authoritativeMarketClock: validNow && status.authoritative === true,
      // Research windows indicate when to seek a source, not proof of market open.
      researchWindowCandidate: validNow && status.indicativePhase === "REGULAR_WINDOW"
        && status.calendarState !== "OFFICIAL_CLOSED"
        && status.calendarState !== "SPECIAL_HOURS_UNCONFIRMED",
      orderSubmissionAllowed: false as const, paperExecutionAllowed: false as const,
      brokerConnectivityAllowed: false as const, liveTradingAllowed: false as const,
    };
  });
  const byRegion = regions.map(region => {
    const selected = rows.filter(row => row.regionId === region.id);
    const ref = coverage.get(region.id);
    const targetCountries = Array.isArray(region.countries) ? region.countries.length : 0;
    const refValid = locksValid && ref !== undefined
      && Number.isSafeInteger(ref.targetCountries) && ref.targetCountries === targetCountries
      && Number.isSafeInteger(ref.providerMatchedCountries) && ref.providerMatchedCountries >= 0
      && ref.providerMatchedCountries <= targetCountries
      && Number.isSafeInteger(ref.instrumentCount) && ref.instrumentCount >= 0;
    // A provider universe may contain warrants, preferred shares and other
    // securities. Show ordinary-share references separately, NEVER eligible buys.
    const countries = Array.isArray(reference?.countryCoverage)
      ? reference.countryCoverage.filter(x => x?.regionId === region.id && x.providerCovered === true) : [];
    const validCatalogue = refValid && countries.every(x =>
      Number.isSafeInteger(x.instrumentCount) && x.instrumentCount! >= 0
      && Number.isSafeInteger(x.instrumentTypes?.["Common Stock"] ?? 0)
      && Number.isSafeInteger(x.instrumentTypes?.Warrant ?? 0)
      && (x.instrumentTypes?.["Common Stock"] ?? 0) >= 0
      && (x.instrumentTypes?.Warrant ?? 0) >= 0
      && (x.instrumentTypes?.["Common Stock"] ?? 0) + (x.instrumentTypes?.Warrant ?? 0) <= x.instrumentCount!)
      && countries.length === ref?.providerMatchedCountries
      && countries.reduce((n,x)=>n+(x.instrumentCount??0),0) === ref?.instrumentCount;
    const ordinaryShareReferences = validCatalogue
      ? countries.reduce((n,x)=>n+(x.instrumentTypes?.["Common Stock"]??0),0) : null;
    const warrantReferences = validCatalogue
      ? countries.reduce((n,x)=>n+(x.instrumentTypes?.Warrant??0),0) : null;
    const windowsNow = selected.filter(x => x.researchWindowCandidate).length;
    const attention = !refValid || referenceState === "UNVERIFIED"
      ? "VERIFY_REFERENCE" as const
      : windowsNow > 0 ? "REVIEW_NOW" as const
      : "PREPARE_RESEARCH" as const;
    return {
      id: region.id, name: region.name,
      targetCountries, matchedCountries: refValid ? ref!.providerMatchedCountries : null,
      referenceInstrumentCount: refValid ? ref!.instrumentCount : null,
      ordinaryShareReferences, warrantReferences,
      curatedVenues: selected.length, indicativeResearchWindows: windowsNow,
      attention,
      sourceReviewRequired: !refValid || referenceState !== "REFERENCE_ONLY",
      paperExecutionAllowed: false as const,
      liveTradingAllowed: false as const,
    };
  });
  return {
    generatedAt: validNow ? new Date(now).toISOString() : null,
    referenceGeneratedAt: asOf === null ? null : new Date(asOf).toISOString(),
    referenceState,
    referenceAgeHours: Number.isFinite(ageHours) && ageHours >= 0
      ? Math.round(ageHours * 10) / 10 : null,
    locksValid,
    regions: byRegion, venues: rows,
    summary: {
      representedRegions: byRegion.length,
      curatedVenues: rows.length,
      indicativeResearchWindowsNow: rows.filter(x => x.researchWindowCandidate).length,
      authoritativeOpenVenuesNow: rows.filter(x => x.marketTruth === "OPEN" && x.authoritativeMarketClock).length,
      verifiedWorldExecutionVenues: 0,
    },
    policy: {
      scope: "RESEARCH_ONLY" as const,
      sessionsAreIndicativeNotActualOpen: true as const,
      sourceCatalogueIsNotRealtimeData: true as const,
      missingHolidaysAndHaltsFailClosed: true as const,
      worldExecutionPermissionNeverGranted: true as const,
      brokerConnectivityAllowed: false as const,
      paperExecutionAllowed: false as const,
      liveTradingAllowed: false as const,
    },
  };
}
