/**
 * Snapshot-only, per-symbol market-data research plan.
 * No provider requests, no new data entitlements, no broker connectivity.
 * A historically PAPER-eligible observation never authorizes execution now.
 */
export type CoverageInstrument = {
  ticker?: string;
  name?: string;
  status?: string;
  assetClass?: string;
  exchangeMic?: string | null;
  exchangeName?: string;
  currency?: string;
};
export type CoverageRow = {
  symbol?: string;
  state?: string;
  paperEligible?: boolean;
  approvedIndependentPaperFamilies?: string[];
  reasons?: string[];
};
export type CoverageInput = {
  generatedAt?: string;
  evidenceGeneratedAt?: string;
  requestedSymbols?: number;
  rows?: CoverageRow[];
};
const MAX_SNAPSHOT_AGE_MS = 120_000;

function validSnapshotAge(value: unknown, now: number) {
  if (typeof value !== "string" || !/Z$/.test(value) || !Number.isFinite(now)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= MAX_SNAPSHOT_AGE_MS;
}
function ticker(value: unknown) {
  const s = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9][A-Z0-9._-]{0,24}$/.test(s) ? s : "";
}

export function buildMarketCoveragePlan(
  coverage: CoverageInput | null | undefined,
  instruments: readonly CoverageInstrument[],
  now: number,
) {
  const snapshotCurrent = validSnapshotAge(coverage?.generatedAt, now)
    && validSnapshotAge(coverage?.evidenceGeneratedAt, now);
  const rows = Array.isArray(coverage?.rows) ? coverage.rows.slice(0, 100) : [];
  const symbolsSeen = new Set<string>();
  const plans = rows.map(row => {
    const symbol = ticker(row.symbol);
    const matches = instruments.filter(item => item.status === "active" && ticker(item.ticker) === symbol);
    const uniqueIdentity = Boolean(symbol) && !symbolsSeen.has(symbol) && matches.length === 1
      && typeof matches[0].exchangeMic === "string" && /^[A-Z]{4}$/.test(matches[0].exchangeMic!)
      && /^[A-Z]{3}$/.test(String(matches[0].currency || ""));
    if (symbol) symbolsSeen.add(symbol);
    const instrument = uniqueIdentity ? matches[0] : null;
    const families = Array.isArray(row.approvedIndependentPaperFamilies)
      ? [...new Set(row.approvedIndependentPaperFamilies.filter((s): s is string =>
        typeof s === "string" && /^(alpaca|twelve-data|directa)$/.test(s)))]
      : [];
    const proofAtCapture = uniqueIdentity && row.paperEligible === true
      && families.length >= 2 && (row.state === "GREEN" || row.state === "CAUTION")
      && (instrument?.assetClass === "equity" || instrument?.assetClass === "etf");
    const status = !uniqueIdentity ? "IDENTITY_REVIEW"
      : proofAtCapture ? snapshotCurrent ? "RECENT_SAMPLE_ONLY" : "EXPIRED_SAMPLE"
      : "RESEARCH_ONLY";
    const action = !uniqueIdentity ? "Verificare ticker, MIC e valuta univoci nel catalogo."
      : proofAtCapture ? snapshotCurrent
        ? "Due fonti PAPER nel campione, ma servono sessione e gate runtime: nessun ordine."
        : "Campione scaduto: attendere una nuova raccolta autorizzata, senza chiamate dal browser."
      : families.length < 2
        ? "Accertare disponibilità e licenza di una seconda fonte indipendente, senza acquistare feed automaticamente."
        : "Esaminare le ragioni di esclusione e la qualità dei prezzi prima di ammettere il titolo.";
    return {
      symbol: symbol || "NON_VALIDO", status, action,
      exchangeMic: instrument?.exchangeMic ?? null,
      exchangeName: instrument?.exchangeName ?? null,
      currency: instrument?.currency ?? null,
      name: instrument?.name ?? null,
      verifiedFamiliesAtCapture: families,
      paperEligibleAtCapture: proofAtCapture,
      reasons: Array.isArray(row.reasons)
        ? row.reasons.filter((reason): reason is string => typeof reason === "string").slice(0, 2)
        : [],
      canBuy: false as const,
      canSell: false as const,
      directaPositionVerified: false as const,
    };
  });
  return {
    snapshotCurrent,
    snapshotGeneratedAt: coverage?.generatedAt ?? null,
    requestedSymbols: Number.isSafeInteger(coverage?.requestedSymbols) ? coverage!.requestedSymbols! : plans.length,
    listedSymbols: plans.length,
    sampleEligibleAtCapture: plans.filter(row => row.paperEligibleAtCapture).length,
    sampleEligibleNow: plans.filter(row => row.status === "RECENT_SAMPLE_ONLY").length,
    identityReviews: plans.filter(row => row.status === "IDENTITY_REVIEW").length,
    researchOnly: plans.filter(row => row.status === "RESEARCH_ONLY").length,
    rows: plans,
    realBrokerConnectivityVerified: false as const,
    liveTradingAllowed: false as const,
  };
}
