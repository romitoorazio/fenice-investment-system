import masterData from "@/data/instrument-master.json";
import { getAlpacaPaperClock } from "@/lib/market/alpaca-paper-clock-runtime.mjs";
import executionMarket from "@/data/execution-market-evidence.json";
import executionCoverage from "@/data/execution-market-coverage.json";
import { type InstrumentMaster } from "@/lib/market/instrument-master";
import { resolveVenueSession } from "@/lib/market/venue-session-intelligence";
import { getNasdaqPublicMarketStatus } from "@/lib/market/nasdaq-public-market-status.mjs";
import { assessRuntimePaperQuoteGate } from "@/lib/trading/runtime-paper-quote-gate";
import { describePersistedPaperQuoteHealth } from "@/lib/trading/paper-quote-diagnostics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Read-only per-venue market navigator for the existing seed universe.
 * No quote requests, API keys, broker access, orders or LIVE actions.
 */
export async function GET() {
  const now = Date.now();
  const [publicUsMarketStatus, livePaperClock] = await Promise.all([
    getNasdaqPublicMarketStatus(now),
    getAlpacaPaperClock(now),
  ]);
  const master = masterData as InstrumentMaster;
  const tracked = master.instruments.filter((row) => row.status === "active");
  const mics = [...new Set(tracked
    .map((row) => row.exchangeMic || "")
    .filter(Boolean))];
  const markets = mics.map((mic) => ({
    ...resolveVenueSession(mic, livePaperClock, now),
    // Exchange website observation is supplemental and never upgrades state
    // to authoritative OPEN for PAPER or LIVE execution.
    publicUsMarketStatus: ["XNYS", "XNAS", "ARCX"].includes(mic)
      ? publicUsMarketStatus : null,
  }));
  const marketByMic = new Map(markets.map((row) => [row.mic, row]));
  const quoteGate = assessRuntimePaperQuoteGate(executionMarket, executionCoverage, now);
  const quoteDiagnostics = describePersistedPaperQuoteHealth(executionMarket, executionCoverage, now);
  const eligibleCoverage = new Set(
    executionCoverage.rows
      .filter((row) => row.paperEligible === true)
      .map((row) => row.symbol.toUpperCase()),
  );

  const instruments = tracked.map((item) => {
    const market = marketByMic.get(item.exchangeMic ?? "");
    const authoritativeOpen = market?.state === "OPEN" && market.authoritative;
    const paperCandidate = authoritativeOpen
      && market?.paperQuoteRefreshCandidate === true
      && (item.assetClass === "equity" || item.assetClass === "etf");
    const paperQuoteVerifiedNow = paperCandidate
      && quoteGate.ready
      && eligibleCoverage.has(String(item.ticker || "").toUpperCase());

    return {
      id: item.id,
      ticker: item.ticker ?? null,
      name: item.name,
      exchangeMic: item.exchangeMic ?? null,
      country: item.country,
      assetClass: item.assetClass,
      currency: item.currency,
      marketState: market?.state ?? "UNKNOWN",
      authoritativeMarketClock: market?.authoritative === true,
      indicativePhase: market?.indicativePhase ?? "UNMAPPED",
      annualCalendarState: market?.calendarState ?? "CALENDAR_NOT_VERIFIED",
      annualCalendarDate: market?.calendarDate ?? null,
      annualCalendarSource: market?.calendarSource ?? null,
      nextRecommendedDataAction: market?.nextAction ?? "RESEARCH_ONLY",
      researchSources: item.primarySources,
      paperQuoteProviderCandidates: paperCandidate ? market?.dataProviderCandidates ?? [] : [],
      paperQuoteVerifiedNow: paperQuoteVerifiedNow === true,
      aiResearchAction: paperQuoteVerifiedNow
        ? "REVIEW_VERIFIED_PAPER_EVIDENCE"
        : paperCandidate ? "REFRESH_AND_VERIFY_PAPER_QUOTES"
        : "RESEARCH_ONLY",
      // A candidate for later PAPER review is NOT a submitted order.
      orderSubmissionAllowed: false,
      liveTradingAllowed: false,
    };
  });

  return Response.json({
    generatedAt: new Date(now).toISOString(),
    coverage: master.coverage,
    summary: {
      mappedMarkets: markets.filter((row) => row.indicativePhase !== "UNMAPPED").length,
      authoritativeOpenMarkets: markets.filter((row) => row.authoritative && row.state === "OPEN").length,
      authoritativeClosedMarkets: markets.filter((row) => row.authoritative && row.state === "CLOSED").length,
      unknownMarkets: markets.filter((row) => row.state === "UNKNOWN").length,
      auditedEuropean2026Calendars: markets.filter((row) => ["XMIL", "XPAR", "XETR"].includes(row.mic)
        && row.calendarAnnualScheduleVerified).length,
      scheduledClosedToday: markets.filter((row) => row.calendarState === "OFFICIAL_CLOSED").length,
      specialHoursUnconfirmedToday: markets.filter((row) => row.calendarState === "SPECIAL_HOURS_UNCONFIRMED").length,
      indicativeWindowMarkets: markets.filter((row) => row.indicativePhase === "REGULAR_WINDOW").length,
      trackedInstruments: instruments.length,
      paperVerifiedInstrumentsNow: instruments.filter((row) => row.paperQuoteVerifiedNow).length,
    },
    markets,
    instruments,
    publicUsMarketStatus,
    alpacaPaperClock: {
      configured: livePaperClock.configured,
      authoritative: livePaperClock.evidence.authoritative,
      state: livePaperClock.evidence.state,
      observedAt: livePaperClock.evidence.authoritative ? livePaperClock.evidence.observedAt : null,
      error: livePaperClock.error,
      liveTradingAllowed: false,
    },
    paperQuoteGate: quoteGate,
    paperQuoteDiagnostics: quoteDiagnostics,
    policy: {
      regularHoursAreIndicativeOnly: true,
      holidaysEarlyClosesAndIndividualHaltsNotVerified: true,
      venueRequiresFreshAuthoritativeClockForPaper: true,
      PAPERDataRequiresFreshProvenanceAndIndependentSources: true,
      nonUsVenuesResearchOnlyUntilSeparatelyCertified: true,
      publicNasdaqObservationNeverAuthorizesExecution: true,
      officialEuropean2026CalendarCanIndicateClosureNotProveOpening: true,
      calendarYearOtherThan2026NeedsVerification: true,
      specialSessionHoursNeverAuthorizeOrders: true,
      alpacaPaperClockUsesServerOnlyEncryptedCredentials: true,
      dataNotExecutionGradeUnlessExplicitlyVerified: true,
      stalePaperDiagnosticsNeverOverrideLiveLock: true,
      orderSubmissionAllowed: false,
      brokerNetworkAllowed: false,
      liveTradingAllowed: false,
    },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
