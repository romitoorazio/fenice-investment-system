/**
 * Public research-only status display. A legacy source-health snapshot and the
 * authoritative global probe can disagree because they run independently.
 * Use newest genuine per-provider observation, not newest file write time.
 * No status may grant execution-market eligibility, broker access or LIVE.
 */
type Status = "healthy" | "degraded" | "failed" | "unconfigured" | "unknown";
type Source = {
  id?: unknown; name?: unknown; status?: unknown; checkedAt?: unknown;
  detail?: unknown; latencyMs?: unknown; lastSuccessfulAt?: unknown;
};
type Report = { generatedAt?: unknown; sources?: Source[] };
type Candidate = {
  id: string; name: string; status: Status; lastKnownStatus: Status;
  checkedAt: string | null; detail: string | null; latencyMs: number | null;
  lastSuccessfulAt: string | null; reportOrigin: "legacy" | "global";
  stale: boolean; checkedMs: number; validObservation: boolean;
};

const ALLOWED = new Set(["healthy", "degraded", "failed", "unconfigured", "unknown"]);
const DAY_MS = 86_400_000;
const CLOCK_TOLERANCE_MS = 5_000;

function parsedTime(value: unknown, now: number): number | null {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && ms > 946684800000 && ms <= now + CLOCK_TOLERANCE_MS ? ms : null;
}

export function reconcileSourceStatus(
  legacy: Report | null | undefined,
  global: Report | null | undefined,
  now = Date.now(),
  maxAgeMs = DAY_MS,
) {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new Error("INVALID_SOURCE_STATUS_CLOCK_OR_AGE");
  }

  const selected = new Map<string, Candidate>();
  for (const [reportOrigin, report] of [["legacy", legacy], ["global", global]] as const) {
    const reportMs = parsedTime(report?.generatedAt, now);
    for (const raw of (Array.isArray(report?.sources) ? report.sources : [])) {
      const id = String(raw?.id ?? "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(id)) continue;
      const rawStatus = String(raw?.status ?? "").toLowerCase();
      const lastKnownStatus: Status = ALLOWED.has(rawStatus) ? rawStatus as Status : "unknown";
      const checkedMs = parsedTime(raw?.checkedAt, now);
      // Never accept a timestamp later than the source report (+minor clock skew).
      const validObservation = checkedMs !== null && reportMs !== null
        && checkedMs <= reportMs + CLOCK_TOLERANCE_MS;
      const fresh = validObservation && now - checkedMs! <= maxAgeMs
        && checkedMs! <= now;
      const candidate: Candidate = {
        id,
        name: typeof raw?.name === "string" ? raw.name : id,
        status: fresh ? lastKnownStatus : "unknown",
        lastKnownStatus,
        checkedAt: validObservation ? new Date(checkedMs!).toISOString() : null,
        detail: typeof raw?.detail === "string" ? raw.detail : null,
        latencyMs: typeof raw?.latencyMs === "number" && Number.isFinite(raw.latencyMs)
          ? raw.latencyMs : null,
        lastSuccessfulAt: typeof raw?.lastSuccessfulAt === "string" ? raw.lastSuccessfulAt : null,
        reportOrigin,
        stale: !fresh,
        checkedMs: validObservation ? checkedMs! : -1,
        validObservation,
      };
      const previous = selected.get(id);
      // Global has preference on exact ties; timestamps always outrank file order.
      if (!previous || candidate.checkedMs > previous.checkedMs
          || (candidate.checkedMs === previous.checkedMs && reportOrigin === "global")) {
        selected.set(id, candidate);
      }
    }
  }
  const sources = [...selected.values()].sort((a, b) => a.id.localeCompare(b.id))
    .map(({ checkedMs: _internalMs, validObservation: _validObservation, ...publicRow }) => publicRow);
  const summary = {
    checkedSources: sources.length,
    healthy: sources.filter(x => x.status === "healthy").length,
    degraded: sources.filter(x => x.status === "degraded").length,
    failed: sources.filter(x => x.status === "failed").length,
    unconfigured: sources.filter(x => x.status === "unconfigured").length,
    unknown: sources.filter(x => x.status === "unknown").length,
    stale: sources.filter(x => x.stale).length,
  };
  return {
    reconciledAt: new Date(now).toISOString(),
    latestReportAt: [parsedTime(legacy?.generatedAt, now), parsedTime(global?.generatedAt, now)]
      .filter((v): v is number => v !== null)
      .sort((a, b) => b - a)
      .map(ms => new Date(ms).toISOString())[0] ?? null,
    sources,
    summary,
    policy: {
      newestObservedProviderStatusWins: true,
      staleOrUnverifiableStatusBecomesUnknown: true,
      maxObservationAgeMs: maxAgeMs,
      executionQuorumUnaffected: true,
      liveTradingAllowed: false,
    },
  };
}
