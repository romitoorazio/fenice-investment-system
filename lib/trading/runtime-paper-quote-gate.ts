/**
 * Runtime-only gate. V6 baseline files remain frozen; this additional barrier
 * stops a historic, once-valid 30-minute snapshot being called execution-grade
 * after its actual <=120-second quotes expire.
 *
 * This is not a broker entitlement, order authorization or exchange clock.
 */
type Observation = {
  symbol?: string;
  sourceFamily?: string;
  eligibility?: string;
  provenanceVerified?: boolean;
  provenanceMethod?: string;
  price?: number;
  observedAt?: string;
};
type Evidence = { generatedAt?: string; observations?: Observation[] };
type Coverage = {
  generatedAt?: string;
  evidenceGeneratedAt?: string;
  requestedSymbols?: number;
  paperEligibleSymbols?: number;
  rows?: Array<{ symbol?: string; paperEligible?: boolean }>;
  policy?: { approvedIndependentPaperSourceFamilies?: string[]; liveTradingAllowed?: boolean };
};

const MAX_QUOTE_AGE_SECONDS = 120;
const MAX_CROSS_SOURCE_SPREAD_PERCENT = 0.75;
const DIRECTA_PROVENANCE = "directa-readonly-entitlement-isin-topbook";

function ageSeconds(timestamp: unknown, now: number): number {
  const parsed = Date.parse(String(timestamp ?? ""));
  return Number.isFinite(parsed) ? (now - parsed) / 1000 : Number.POSITIVE_INFINITY;
}
function isFresh(timestamp: unknown, now: number): boolean {
  const seconds = ageSeconds(timestamp, now);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_QUOTE_AGE_SECONDS;
}
function normalizeFamily(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

export function assessRuntimePaperQuoteGate(
  evidence: Evidence | null | undefined,
  coverage: Coverage | null | undefined,
  now = Date.now(),
) {
  const reasons: string[] = [];
  const evidenceFresh = isFresh(evidence?.generatedAt, now);
  const coverageFresh = isFresh(coverage?.generatedAt, now);
  const evidenceTimestamp = Date.parse(String(evidence?.generatedAt || ""));
  const linkedTimestamp = Date.parse(String(coverage?.evidenceGeneratedAt || ""));
  const snapshotsMatch = Number.isFinite(evidenceTimestamp) && Number.isFinite(linkedTimestamp)
    && Math.abs(linkedTimestamp - evidenceTimestamp) <= 1000;

  if (!evidenceFresh || !coverageFresh) reasons.push("PAPER execution snapshot is older than 120 seconds");
  if (!snapshotsMatch) reasons.push("PAPER execution coverage is not linked to the quoted evidence");

  const approved = new Set((coverage?.policy?.approvedIndependentPaperSourceFamilies || []).map(normalizeFamily));
  const permitted = new Set(["alpaca", "twelve-data", "directa"]);
  const bySymbol = new Map<string, Map<string, number>>();
  let paperObservationsStale = 0;
  let paperObservationsUnverified = 0;

  for (const row of evidence?.observations || []) {
    if (row?.eligibility !== "PAPER" && row?.eligibility !== "LIVE") continue;
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const family = normalizeFamily(row.sourceFamily);
    const trusted = approved.has(family) && permitted.has(family)
      && row.provenanceVerified === true
      && (family !== "directa" || row.provenanceMethod === DIRECTA_PROVENANCE)
      && row.eligibility === "PAPER";
    if (!symbol || !trusted || !Number.isFinite(Number(row.price)) || Number(row.price) <= 0) {
      paperObservationsUnverified++;
      continue;
    }
    if (!isFresh(row.observedAt, now)) {
      paperObservationsStale++;
      continue;
    }
    let quotes = bySymbol.get(symbol);
    if (!quotes) {
      quotes = new Map();
      bySymbol.set(symbol, quotes);
    }
    quotes.set(family, Number(row.price));
  }

  let eligibleSymbols = 0;
  let spreadRejectedSymbols = 0;
  const verified = new Set<string>();
  for (const [symbol, familyQuotes] of bySymbol) {
    const prices = [...familyQuotes.values()].sort((a, b) => a - b);
    if (prices.length < 2) continue;
    const middle = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
    const spread = 100 * (prices.at(-1)! - prices[0]) / median;
    if (!Number.isFinite(spread) || spread > MAX_CROSS_SOURCE_SPREAD_PERCENT) {
      spreadRejectedSymbols++;
      continue;
    }
    verified.add(symbol);
    eligibleSymbols++;
  }
  const requested = Number(coverage?.requestedSymbols || 0);
  const percent = requested > 0 ? 100 * eligibleSymbols / requested : 0;
  if (eligibleSymbols < 3 || percent < 25) {
    reasons.push(`fresh independent PAPER price quorum is ${eligibleSymbols}/${requested} symbols (${percent.toFixed(1)}%)`);
  }
  const reportedEligible = Number(coverage?.paperEligibleSymbols || 0);
  if (eligibleSymbols < reportedEligible
    || (coverage?.rows || []).some((row) => row.paperEligible && !verified.has(String(row.symbol || "").toUpperCase()))) {
    reasons.push("persisted PAPER coverage exceeds current quote-valid coverage");
  }
  if (paperObservationsUnverified > 0) reasons.push("unverified or LIVE-eligible observations cannot establish PAPER quorum");
  if (spreadRejectedSymbols > 0) reasons.push("cross-source spread exceeds 0.75%");
  if (coverage?.policy?.liveTradingAllowed !== false) reasons.push("LIVE policy lock not proven");

  return {
    ready: reasons.length === 0,
    reasons,
    maxQuoteAgeSeconds: MAX_QUOTE_AGE_SECONDS,
    evidenceFresh,
    coverageFresh,
    snapshotsMatch,
    eligibleSymbols,
    requestedSymbols: requested,
    paperObservationsStale,
    paperObservationsUnverified,
    spreadRejectedSymbols,
    liveTradingAllowed: false,
  };
}
