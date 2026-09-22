import { evaluateMarketDataQuorum, type MarketDataEligibility } from "./market-data-quorum.ts";

export type ExecutionCoverageEvidence = {
  generatedAt?: string | null;
  requestedSymbols?: string[];
  observations?: Array<{
    symbol?: string;
    assetClass?: string;
    source?: string;
    sourceFamily?: string;
    eligibility?: "VALIDATION_ONLY" | "PAPER" | "LIVE" | string;
    price?: number;
    observedAt?: string;
  }>;
  errors?: Array<{ symbol?: string; provider?: string; code?: string }>;
};

// Directa is optional/read-only evidence for PAPER certification. These families
// may independently contribute PAPER evidence when their terms/entitlements allow it.
const APPROVED_INDEPENDENT_PAPER_FAMILIES = new Set([
  "twelve-data",
  "alpha-vantage",
  "massive",
  "alpaca",
]);

function isEquityOrEtf(value: unknown): boolean {
  return /equity|stock|etf|azione|azion/i.test(String(value || ""));
}

function normalizeEligibility(value: unknown): MarketDataEligibility {
  return value === "LIVE" || value === "PAPER" || value === "VALIDATION_ONLY"
    ? value
    : "VALIDATION_ONLY";
}

export function evaluateExecutionCoverageReport(evidence: ExecutionCoverageEvidence, now = Date.now()) {
  const requestedSymbols = Array.isArray(evidence?.requestedSymbols) ? evidence.requestedSymbols : [];
  const observations = Array.isArray(evidence?.observations) ? evidence.observations : [];
  const errors = Array.isArray(evidence?.errors) ? evidence.errors : [];

  const rows = requestedSymbols.map((rawSymbol) => {
    const symbol = String(rawSymbol || "").toUpperCase();
    const rawObservations = observations.filter((item) => String(item?.symbol || "").toUpperCase() === symbol);
    const assetClasses = [...new Set(rawObservations.map((item) => String(item?.assetClass || "").trim()).filter(Boolean))];
    const symbolObservations = rawObservations.map((item) => ({
      source: String(item?.source || ""),
      sourceFamily: item?.sourceFamily ? String(item.sourceFamily) : undefined,
      eligibility: normalizeEligibility(item?.eligibility),
      price: Number(item?.price),
      observedAt: String(item?.observedAt || ""),
    }));
    const decision = evaluateMarketDataQuorum(symbolObservations, undefined, now);
    const equityOrEtf = assetClasses.some(isEquityOrEtf);
    const directaPaperEvidence = rawObservations.some((item) =>
      String(item?.sourceFamily || "").trim().toLowerCase() === "directa"
        && normalizeEligibility(item?.eligibility) === "PAPER",
    );
    const approvedIndependentPaperFamilies = [...new Set(rawObservations
      .filter((item) => normalizeEligibility(item?.eligibility) === "PAPER")
      .map((item) => String(item?.sourceFamily || "").trim().toLowerCase())
      .filter((family) => APPROVED_INDEPENDENT_PAPER_FAMILIES.has(family))
    )].sort();

    // PAPER eligibility is determined by the generic fail-closed market-data quorum.
    // Directa is diagnostic/optional here and cannot be a mandatory certification gate.
    const paperEligible = decision.allowNewRisk;
    const directaOptionalEvidence = equityOrEtf && directaPaperEvidence;

    return {
      symbol,
      assetClasses,
      equityOrEtf,
      state: decision.state,
      paperEligible,
      directaPaperEvidence,
      directaOptionalEvidence,
      approvedIndependentPaperFamilies,
      independentSourceFamilies: decision.independentSources,
      sourceFamilies: decision.sourceFamilies,
      medianPrice: decision.medianPrice,
      maxSpreadPercent: decision.maxSpreadPercent,
      staleEvidence: decision.staleEvidence,
      ineligibleEvidence: decision.ineligibleEvidence,
      invalidEvidence: decision.invalidEvidence,
      providerErrors: errors.filter((item) => String(item?.symbol || "").toUpperCase() === symbol),
      reasons: [...decision.reasons],
    };
  });

  const paperEligible = rows.filter((row) => row.paperEligible);
  return {
    version: 5,
    generatedAt: new Date(now).toISOString(),
    evidenceGeneratedAt: evidence?.generatedAt || null,
    requestedSymbols: rows.length,
    paperEligibleSymbols: paperEligible.length,
    paperEligiblePercent: rows.length ? Number((paperEligible.length / rows.length * 100).toFixed(1)) : 0,
    greenSymbols: rows.filter((row) => row.state === "GREEN").map((row) => row.symbol),
    cautionSymbols: rows.filter((row) => row.state === "CAUTION").map((row) => row.symbol),
    blockedSymbols: rows.filter((row) => row.state === "BLOCKED").map((row) => row.symbol),
    rows,
    policy: {
      requiredEligibility: "PAPER",
      minIndependentSourceFamilies: 2,
      preferredIndependentSourceFamilies: 3,
      directaPaidRealtimeRequired: false,
      directaEvidenceOptionalForPaperCertification: true,
      approvedIndependentPaperSourceFamilies: [...APPROVED_INDEPENDENT_PAPER_FAMILIES].sort(),
      validationOnlyEvidenceCannotSatisfyPaperQuorum: true,
      liveTradingAllowed: false,
    },
  };
}
