import { assessRuntimePaperQuoteGate } from "./runtime-paper-quote-gate.ts";
import { paperTimestamp } from "./paper-timestamp-integrity.ts";

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
  provenanceMethod?: string;
  observedAt?: string;
  price?: number;
  currency?: string;
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
const APPROVED_METHODS: Record<string, Set<string>> = {
  alpaca: new Set(["authenticated-alpaca-iex-latest-quote", "authenticated-alpaca-iex-latest-quote-readonly-review"]),
  "twelve-data": new Set(["provider-response-us-realtime-venue",
    "provider-response-us-realtime-venue-readonly-review",
    "provider-batch-quote-last_quote_at-us-realtime-venue"]),
  directa: new Set(["directa-readonly-entitlement-isin-topbook"]),
};
const KNOWN_PAPER_FAMILIES = new Set(Object.keys(APPROVED_METHODS));
const MAX_SYMBOLS_DISPLAY = 50;

function elapsedSeconds(value: string | undefined, now: number): number | null {
  const t = paperTimestamp(value);
  if (t === null || !Number.isSafeInteger(now) || now < 0 || now > 8.64e15) return null;
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
  const evidenceAt = paperTimestamp(evidence?.generatedAt);
  const coverageAt = paperTimestamp(coverage?.generatedAt);
  const samePersistedQuoteBatch = typeof coverage?.evidenceGeneratedAt === "string"
    && coverage.evidenceGeneratedAt === evidence?.generatedAt
    && evidenceAt !== null && coverageAt !== null
    && coverageAt >= evidenceAt && coverageAt - evidenceAt <= 120_000;
  const snapshotCurrent = samePersistedQuoteBatch
    && inFreshWindow(snapshotAgeSeconds, gate.maxQuoteAgeSeconds)
    && inFreshWindow(coverageAgeSeconds, gate.maxQuoteAgeSeconds);
  const allowed = new Set((coverage?.policy?.approvedIndependentPaperSourceFamilies || [])
    .map((family) => String(family).trim().toLowerCase())
    .filter((family) => KNOWN_PAPER_FAMILIES.has(family)));
  const samplesBySymbol = new Map<string, Map<string, { timestamp: string; age: number | null; price: number; currency: string }>>();
  const currenciesBySymbol = new Map<string, Set<string>>();
  const invalidCurrencySymbols = new Set<string>();
  const conflictedSymbols = new Set<string>();
  for (const item of evidence?.observations || []) {
    if (item?.eligibility !== "PAPER" || item?.provenanceVerified !== true) continue;
    const symbol = String(item.symbol || "").trim().toUpperCase();
    const family = String(item.sourceFamily || "").trim().toLowerCase();
    if (!symbol || !allowed.has(family)
      || !APPROVED_METHODS[family]?.has(String(item.provenanceMethod || ""))
      || typeof item.price !== "number" || !Number.isFinite(item.price) || item.price <= 0) continue;
    const currency = String(item.currency || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      invalidCurrencySymbols.add(symbol);
      continue;
    }
    const currencies = currenciesBySymbol.get(symbol) || new Set<string>();
    currencies.add(currency);
    currenciesBySymbol.set(symbol, currencies);
    const age = elapsedSeconds(item.observedAt, now);
    if (age === null || age < -5) continue;
    const families = samplesBySymbol.get(symbol) || new Map();
    const last = families.get(family);
    if (last && last.timestamp === item.observedAt
      && (last.price !== item.price || last.currency !== currency)) {
      conflictedSymbols.add(symbol);
    }
    if (!last || last.age === null || age < last.age) {
      families.set(family, { timestamp: String(item.observedAt), age, price: item.price, currency });
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
    const currencies = currenciesBySymbol.get(symbol) || new Set<string>();
    const currencyConflict = invalidCurrencySymbols.has(symbol) || currencies.size > 1;
    const state = !snapshotCurrent ? "SNAPSHOT_EXPIRED"
      : currencyConflict ? "CURRENCY_NOT_VERIFIED"
      : conflictedSymbols.has(symbol) ? "SOURCE_CONFLICT"
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
      quoteCurrencies: [...currencies].sort(),
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
    samePersistedQuoteBatch,
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
