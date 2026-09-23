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
    provenanceVerified?: boolean;
    provenanceMethod?: string;
  }>;
  errors?: Array<{ symbol?: string; provider?: string; code?: string }>;
};

// Only source families with an explicitly reviewed zero-cost realtime route may
// enter the generic PAPER quorum. Directa uses a separate, stronger evidence
// path and is accepted only when that dedicated provenance method is persisted.
const APPROVED_GENERIC_PAPER_FAMILIES = new Set([
  "twelve-data",
  "alpaca",
]);
const PREFERRED_ZERO_COST_PAPER_FAMILIES = ["alpaca", "twelve-data"] as const;
const DIRECTA_DEDICATED_PROVENANCE_METHOD = "directa-readonly-entitlement-isin-topbook";

function isEquityOrEtf(value: unknown): boolean {
  return /equity|stock|etf|azione|azion/i.test(String(value || ""));
}

function normalizeSourceFamily(item: { source?: string; sourceFamily?: string }): string {
  const raw = String(item?.sourceFamily || item?.source || "").trim().toLowerCase();
  return raw.replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
}

function hasTrustedPaperProvenance(item: {
  source?: string;
  sourceFamily?: string;
  provenanceVerified?: boolean;
  provenanceMethod?: string;
}): boolean {
  if (item?.provenanceVerified !== true) return false;
  const family = normalizeSourceFamily(item);
  if (APPROVED_GENERIC_PAPER_FAMILIES.has(family)) return true;
  return family === "directa"
    && String(item?.provenanceMethod || "").trim() === DIRECTA_DEDICATED_PROVENANCE_METHOD;
}

function normalizeEligibility(item: {
  source?: string;
  sourceFamily?: string;
  eligibility?: string;
  provenanceVerified?: boolean;
  provenanceMethod?: string;
}): MarketDataEligibility {
  if (!hasTrustedPaperProvenance(item)) return "VALIDATION_ONLY";
  if (item?.eligibility === "LIVE") return "LIVE";
  if (item?.eligibility === "PAPER") return "PAPER";
  return "VALIDATION_ONLY";
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
      eligibility: normalizeEligibility(item),
      price: Number(item?.price),
      observedAt: String(item?.observedAt || ""),
    }));
    const decision = evaluateMarketDataQuorum(symbolObservations, undefined, now);
    const equityOrEtf = assetClasses.some(isEquityOrEtf);
    const directaPaperEvidence = rawObservations.some((item) =>
      normalizeSourceFamily(item) === "directa"
        && normalizeEligibility(item) === "PAPER",
    );
    const approvedIndependentPaperFamilies = [...new Set(rawObservations
      .filter((item) => normalizeEligibility(item) === "PAPER" || normalizeEligibility(item) === "LIVE")
      .map((item) => normalizeSourceFamily(item))
      .filter(Boolean)
    )].sort();
    const unverifiedPaperEvidence = rawObservations
      .filter((item) => (item?.eligibility === "PAPER" || item?.eligibility === "LIVE") && item?.provenanceVerified !== true)
      .map((item) => normalizeSourceFamily(item) || "unknown");
    const unapprovedPaperEvidence = rawObservations
      .filter((item) =>
        (item?.eligibility === "PAPER" || item?.eligibility === "LIVE")
          && item?.provenanceVerified === true
          && !hasTrustedPaperProvenance(item),
      )
      .map((item) => normalizeSourceFamily(item) || "unknown");

    // The generic market-data quorum sees only evidence that survived the
    // persisted provenance registry. An arbitrary PAPER label, even with a
    // caller-supplied provenance flag, cannot create execution readiness.
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
      unverifiedPaperEvidence,
      unapprovedPaperEvidence,
      independentSourceFamilies: decision.independentSources,
      sourceFamilies: decision.sourceFamilies,
      medianPrice: decision.medianPrice,
      maxSpreadPercent: decision.maxSpreadPercent,
      staleEvidence: decision.staleEvidence,
      ineligibleEvidence: decision.ineligibleEvidence,
      invalidEvidence: decision.invalidEvidence,
      providerErrors: errors.filter((item) => String(item?.symbol || "").toUpperCase() === symbol),
      reasons: [
        ...decision.reasons,
        ...(unverifiedPaperEvidence.length > 0
          ? [`${unverifiedPaperEvidence.length} PAPER/LIVE observation(s) downgraded: provenance not verified`]
          : []),
        ...(unapprovedPaperEvidence.length > 0
          ? [`${unapprovedPaperEvidence.length} PAPER/LIVE observation(s) downgraded: source family or provenance route not approved`]
          : []),
      ],
    };
  });

  const paperEligible = rows.filter((row) => row.paperEligible);
  return {
    version: 7,
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
      directaDedicatedProvenanceMethod: DIRECTA_DEDICATED_PROVENANCE_METHOD,
      approvedIndependentPaperSourceFamilies: [...APPROVED_GENERIC_PAPER_FAMILIES].sort(),
      preferredZeroCostPaperSourceFamilies: [...PREFERRED_ZERO_COST_PAPER_FAMILIES],
      validationOnlyEvidenceCannotSatisfyPaperQuorum: true,
      paperEligibilityRequiresVerifiedProvenance: true,
      unregisteredPaperEvidenceFailsClosed: true,
      alphaVantageEligibleForZeroCostPaper: false,
      liveTradingAllowed: false,
    },
  };
}
