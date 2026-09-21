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

function isDirectaPilotAssetClass(value: unknown): boolean {
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
    const directaPilotCandidate = assetClasses.some(isDirectaPilotAssetClass);
    const directaPaperEvidence = rawObservations.some((item) =>
      String(item?.sourceFamily || "").trim().toLowerCase() === "directa"
        && normalizeEligibility(item?.eligibility) === "PAPER",
    );
    const independentNonDirectaPaperEvidence = rawObservations.some((item) =>
      String(item?.sourceFamily || "").trim().toLowerCase() !== "directa"
        && String(item?.sourceFamily || "").trim() !== ""
        && normalizeEligibility(item?.eligibility) === "PAPER",
    );
    const directaPilotEligible = directaPilotCandidate
      && decision.allowNewRisk
      && directaPaperEvidence
      && independentNonDirectaPaperEvidence;
    const directaPilotReasons: string[] = [];
    if (directaPilotCandidate && !directaPaperEvidence) directaPilotReasons.push("missing Directa PAPER source");
    if (directaPilotCandidate && !independentNonDirectaPaperEvidence) directaPilotReasons.push("missing independent non-Directa PAPER source");
    if (directaPilotCandidate && !decision.allowNewRisk) directaPilotReasons.push("market-data quorum blocks new risk");

    return {
      symbol,
      assetClasses,
      directaPilotCandidate,
      state: decision.state,
      paperEligible: decision.allowNewRisk,
      directaPaperEvidence,
      independentNonDirectaPaperEvidence,
      directaPilotEligible,
      independentSourceFamilies: decision.independentSources,
      sourceFamilies: decision.sourceFamilies,
      medianPrice: decision.medianPrice,
      maxSpreadPercent: decision.maxSpreadPercent,
      staleEvidence: decision.staleEvidence,
      ineligibleEvidence: decision.ineligibleEvidence,
      invalidEvidence: decision.invalidEvidence,
      providerErrors: errors.filter((item) => String(item?.symbol || "").toUpperCase() === symbol),
      reasons: [...decision.reasons, ...directaPilotReasons],
    };
  });

  const paperEligible = rows.filter((row) => row.paperEligible);
  const directaPilotCandidates = rows.filter((row) => row.directaPilotCandidate);
  const directaPilotEligible = rows.filter((row) => row.directaPilotEligible);
  return {
    version: 3,
    generatedAt: new Date(now).toISOString(),
    evidenceGeneratedAt: evidence?.generatedAt || null,
    requestedSymbols: rows.length,
    paperEligibleSymbols: paperEligible.length,
    paperEligiblePercent: rows.length ? Number((paperEligible.length / rows.length * 100).toFixed(1)) : 0,
    directaPilotCandidateSymbols: directaPilotCandidates.length,
    directaPilotEligibleSymbols: directaPilotEligible.length,
    directaPilotEligiblePercent: directaPilotCandidates.length
      ? Number((directaPilotEligible.length / directaPilotCandidates.length * 100).toFixed(1))
      : 0,
    greenSymbols: rows.filter((row) => row.state === "GREEN").map((row) => row.symbol),
    cautionSymbols: rows.filter((row) => row.state === "CAUTION").map((row) => row.symbol),
    blockedSymbols: rows.filter((row) => row.state === "BLOCKED").map((row) => row.symbol),
    directaPilotGreenSymbols: directaPilotEligible.map((row) => row.symbol),
    rows,
    policy: {
      requiredEligibility: "PAPER",
      minIndependentSourceFamilies: 2,
      preferredIndependentSourceFamilies: 3,
      minimumDirectaPilotEligibleSymbols: 3,
      directaPilotAssetClasses: ["equity", "stock", "ETF"],
      requireDirectaPaperSourceForDirectaPilot: true,
      requireIndependentNonDirectaPaperSourceForDirectaPilot: true,
      cryptoCannotSatisfyDirectaPilotCoverage: true,
      liveTradingAllowed: false,
    },
  };
}
