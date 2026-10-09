import { assessRuntimePaperQuoteGate } from "./runtime-paper-quote-gate.ts";

/**
 * User-facing diagnostics of PERSISTED PAPER quote evidence.
 * Never performs a network request, changes certification, generates an order,
 * or upgrades the authoritative 120-second execution safety gate.
 */
type PaperObservation = {
  symbol?: string;
  sourceFamily?: string;
  eligibility?: string;
  provenanceVerified?: boolean;
  observedAt?: string;
  price?: number;
};
type PaperEvidence = {
  generatedAt?: string;
  observations?: PaperObservation[];
};
type Coverage = {
  generatedAt?: string;
  evidenceGeneratedAt?: string;
  requestedSymbols?: number;
  paperEligibleSymbols?: number;
  rows?: Array<{ symbol?: string; paperEligible?: boolean }>;
  policy?: {
    approvedIndependentPaperSourceFamilies?: string[];
    liveTradingAllowed?: boolean;
  };
};
const KNOWN_PAPER_FAMILIES = new Set(["alpaca", "twelve-data", "directa"]);
const MAX_SYMBOLS_DISPLAY = 50;

function elapsedSeconds(value: string | undefined, now: number): number | null {
  const t = Date.parse(String(value || ""));
  if (!Number.isFinite(t) || !Number.isFinite(now)) return null;
  return Number(((now - t) / 1000).toFixed(1));
}
function inFreshWindow(age: number | null, maxAge: number) {
  return age !== null && age >= 0 && age <= maxAge;
}

export function describePersistedPaperQuoteHealth(
  evidence: PaperEvidence | null | undefined,
  coverage: Coverage | null | undefined,
  now = Date.now(),
) {
  const gate = assessRuntimePaperQuoteGate(evidence, coverage, now);
  const snapshotAgeSeconds = elapsedSeconds(evidence?.generatedAt, now);
  const coverageAgeSeconds = elapsedSeconds(coverage?.generatedAt, now);
  const snapshotCurrent = inFreshWindow(snapshotAgeSeconds, gate.maxQuoteAgeSeconds)
    && inFreshWindow(coverageAgeSeconds, gate.maxQuoteAgeSeconds);
  const allowed = new Set((coverage?.policy?.approvedIndependentPaperSourceFamilies || [])
    .map((family) => String(family).trim().toLowerCase())
    .filter((family) => KNOWN_PAPER_FAMILIES.has(family)));
  const samplesBySymbol = new Map<string, Map<string, { timestamp: string; age: number | null }>>();
  for (const item of evidence?.observations || []) {
    if (item?.eligibility !== "PAPER" || item?.provenanceVerified !== true) continue;
    const symbol = String(item.symbol || "").trim().toUpperCase();
    const family = String(item.sourceFamily || "").trim().toLowerCase();
    if (!symbol || !allowed.has(family) || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0) continue;
    const age = elapsedSeconds(item.observedAt, now);
    if (age === null || age < -5) continue;
    const families = samplesBySymbol.get(symbol) || new Map();
    const last = families.get(family);
    if (!last || last.age === null || age < last.age) {
      families.set(family, { timestamp: String(item.observedAt), age });
    }
    samplesBySymbol.set(symbol, families);
  }

  const rows = (coverage?.rows || []).slice(0, MAX_SYMBOLS_DISPLAY);
  const symbols = rows.map((row) => {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const families = samplesBySymbol.get(symbol) || new Map();
    const last = [...families.values()].map((x) => x.age)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const currentFamilies = [...families.entries()]
      .filter(([, data]) => inFreshWindow(data.age, gate.maxQuoteAgeSeconds))
      .map(([family]) => family);
    // A once-valid persisted row cannot become "current" merely because
    // its historic coverage snapshot was marked eligible.
    const state = !snapshotCurrent ? "SNAPSHOT_EXPIRED"
      : currentFamilies.length >= 2 ? "SOURCE_CANDIDATE_ONLY"
      : families.size === 0 ? "NO_VERIFIED_PAPER_SOURCES"
      : currentFamilies.length === 0 ? "SOURCES_STALE"
      : "FRESH_SOURCE_QUORUM_MISSING";
    return {
      symbol,
      state,
      snapshotPaperEligible: row.paperEligible === true,
      historicalVerifiedFamilies: [...families.keys()].sort(),
      freshVerifiedFamilies: currentFamilies.sort(),
      newestQuoteAgeSeconds: last[0] ?? null,
      liveTradingAllowed: false,
      orderAuthorized: false,
    };
  });
  return {
    snapshotObservedAt: evidence?.generatedAt || null,
    coverageObservedAt: coverage?.generatedAt || null,
    snapshotAgeSeconds,
    coverageAgeSeconds,
    snapshotCurrent,
    snapshotPaperEligibleSymbols: Number(coverage?.paperEligibleSymbols || 0),
    requestedSymbols: Number(coverage?.requestedSymbols || 0),
    symbols,
    diagnosticState: gate.ready ? "QUORUM_CURRENT" : !snapshotCurrent ? "SNAPSHOT_EXPIRED" : "QUORUM_NOT_MET",
    blockingReasons: gate.reasons,
    quoteMaxAgeSeconds: gate.maxQuoteAgeSeconds,
    // Important: these are historical provider samples, not fetched on demand.
    liveProviderRefreshAvailable: false,
    readOnly: true,
    orderAuthorized: false,
    liveTradingAllowed: false,
  };
}
