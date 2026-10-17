import { paperTimestamp } from "./paper-timestamp-integrity.ts";

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
  currency?: string;
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
const ACCEPTED_PROVENANCE: Record<string, Set<string>> = {
  alpaca: new Set([
    "authenticated-alpaca-iex-latest-quote",
    "authenticated-alpaca-iex-latest-quote-readonly-review",
  ]),
  "twelve-data": new Set([
    "provider-response-us-realtime-venue",
    "provider-response-us-realtime-venue-readonly-review",
    "provider-batch-quote-last_quote_at-us-realtime-venue",
  ]),
  directa: new Set([DIRECTA_PROVENANCE]),
};

function ageSeconds(timestamp: unknown, now: number): number {
  const parsed = paperTimestamp(timestamp);
  return parsed !== null ? (now - parsed) / 1000 : Number.POSITIVE_INFINITY;
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
  if (!Number.isSafeInteger(now) || now < 0 || now > 8.64e15) reasons.push("PAPER verification clock is invalid");
  const requested = coverage?.requestedSymbols;
  const reportedEligible = coverage?.paperEligibleSymbols;
  const coverageRows = Array.isArray(coverage?.rows) ? coverage.rows : [];
  const requestedSet = new Set(coverageRows.map(row => String(row?.symbol || "").trim().toUpperCase()));
  const structureValid = typeof requested === "number" && Number.isSafeInteger(requested) && requested >= 3
    && typeof reportedEligible === "number" && Number.isSafeInteger(reportedEligible)
    && reportedEligible >= 0 && reportedEligible <= requested
    && coverageRows.length > 0 && coverageRows.length === requested
    && coverageRows.filter(row => row?.paperEligible === true).length === reportedEligible
    && requestedSet.size === coverageRows.length && !requestedSet.has("")
    && coverageRows.every(row => row && typeof row === "object"
      && typeof row.paperEligible === "boolean"
      && /^[A-Z0-9][A-Z0-9.:-]{0,24}$/.test(String(row.symbol || "").trim().toUpperCase()))
    && Array.isArray(evidence?.observations)
    && Array.isArray(coverage?.policy?.approvedIndependentPaperSourceFamilies);
  if (!structureValid) reasons.push("PAPER coverage symbol identities or counters are invalid");
  const evidenceFresh = isFresh(evidence?.generatedAt, now);
  const coverageFresh = isFresh(coverage?.generatedAt, now);
  const evidenceTimestamp = paperTimestamp(evidence?.generatedAt);
  const linkedTimestamp = paperTimestamp(coverage?.evidenceGeneratedAt);
  // A near-identical timestamp is not proof of the same provider batch.
  const snapshotsMatch = evidenceTimestamp !== null && linkedTimestamp !== null
    && coverage?.evidenceGeneratedAt === evidence?.generatedAt;

  if (!evidenceFresh || !coverageFresh) reasons.push("PAPER execution snapshot is older than 120 seconds");
  if (!snapshotsMatch) reasons.push("PAPER execution coverage is not linked to the quoted evidence");

  const approved = new Set((Array.isArray(coverage?.policy?.approvedIndependentPaperSourceFamilies)
    ? coverage.policy.approvedIndependentPaperSourceFamilies : []).map(normalizeFamily));
  const permitted = new Set(["alpaca", "twelve-data", "directa"]);
  // A source-specific quote includes currency and observation time. Numeric price alone is unsafe.
  const bySymbol = new Map<string, Map<string, { price: number; currency: string; observedMs: number }>>();
  const currencyUnverifiedSymbols = new Set<string>();
  const conflictingProviderSymbols = new Set<string>();
  let paperObservationsStale = 0;
  let paperObservationsUnverified = 0;

  for (const row of Array.isArray(evidence?.observations) ? evidence.observations : []) {
    if (row?.eligibility !== "PAPER" && row?.eligibility !== "LIVE") continue;
    const symbol = String(row.symbol || "").trim().toUpperCase();
    // Fresh unrelated symbols cannot satisfy coverage of the requested universe.
    if (!structureValid || !requestedSet.has(symbol)) continue;
    const family = normalizeFamily(row.sourceFamily);
    const trusted = approved.has(family) && permitted.has(family)
      && row.provenanceVerified === true
      && ACCEPTED_PROVENANCE[family]?.has(String(row.provenanceMethod || "")) === true
      && row.eligibility === "PAPER";
    const currency = String(row.currency || "").trim().toUpperCase();
    const validCurrency = /^[A-Z]{3}$/.test(currency);
    if (!symbol || !trusted || typeof row.price !== "number" || !Number.isFinite(row.price)
      || row.price <= 0 || !validCurrency) {
      paperObservationsUnverified++;
      if (symbol && trusted && !validCurrency) currencyUnverifiedSymbols.add(symbol);
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
    const observedMs = Date.parse(String(row.observedAt));
    const previous = quotes.get(family);
    // Duplicated provider records must not replace the newest quote with an older observation.
    if (previous && observedMs === previous.observedMs
      && (previous.price !== row.price || previous.currency !== currency)) {
      // Equal-provider/equal-time contradictory quotes are NOT independent proof.
      conflictingProviderSymbols.add(symbol);
    }
    if (!previous || observedMs > previous.observedMs) {
      quotes.set(family, { price: row.price, currency, observedMs });
    }
  }

  let eligibleSymbols = 0;
  let spreadRejectedSymbols = 0;
  const currencyRejectedSymbols = new Set<string>(currencyUnverifiedSymbols);
  const verified = new Set<string>();
  for (const [symbol, familyQuotes] of bySymbol) {
    if (conflictingProviderSymbols.has(symbol)) continue;
    const quotes = [...familyQuotes.values()];
    if (currencyRejectedSymbols.has(symbol) || new Set(quotes.map((quote) => quote.currency)).size !== 1) {
      currencyRejectedSymbols.add(symbol);
      continue;
    }
    const prices = quotes.map((quote) => quote.price).sort((a, b) => a - b);
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
  const requestedCount = structureValid ? requested! : 0;
  const percent = requestedCount > 0 ? 100 * eligibleSymbols / requestedCount : 0;
  if (eligibleSymbols < 3 || percent < 25) {
    reasons.push(`fresh independent PAPER price quorum is ${eligibleSymbols}/${requestedCount} symbols (${percent.toFixed(1)}%)`);
  }
  if (eligibleSymbols < Number(reportedEligible || 0)
    || coverageRows.some((row) => row?.paperEligible && !verified.has(String(row?.symbol || "").toUpperCase()))) {
    reasons.push("persisted PAPER coverage exceeds current quote-valid coverage");
  }
  if (paperObservationsUnverified > 0) reasons.push("unverified or LIVE-eligible observations cannot establish PAPER quorum");
  if (spreadRejectedSymbols > 0) reasons.push("cross-source spread exceeds 0.75%");
  if (conflictingProviderSymbols.size > 0)
    reasons.push("contradictory same-provider PAPER quote timestamps");
  if (currencyRejectedSymbols.size > 0) reasons.push("PAPER quote currency missing or inconsistent between sources");
  if (coverage?.policy?.liveTradingAllowed !== false) reasons.push("LIVE policy lock not proven");

  return {
    ready: reasons.length === 0,
    reasons,
    maxQuoteAgeSeconds: MAX_QUOTE_AGE_SECONDS,
    evidenceFresh,
    coverageFresh,
    snapshotsMatch,
    eligibleSymbols,
    requestedSymbols: requestedCount,
    paperObservationsStale,
    paperObservationsUnverified,
    spreadRejectedSymbols,
    conflictingProviderSymbols: conflictingProviderSymbols.size,
    currencyRejectedSymbols: currencyRejectedSymbols.size,
    liveTradingAllowed: false,
  };
}
