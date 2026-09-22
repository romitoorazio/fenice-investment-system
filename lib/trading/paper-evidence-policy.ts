export type RawMarketObservation = {
  symbol?: string;
  assetClass?: string;
  source?: string;
  sourceFamily?: string;
  price?: number;
  observedAt?: string;
  entitlement?: string;
  realtime?: boolean;
  provenanceVerified?: boolean;
};

export type PaperEvidenceClassification = {
  sourceFamily: string;
  eligibility: "VALIDATION_ONLY" | "PAPER";
  reason: string;
};

/**
 * Conservative source classification for PAPER certification.
 *
 * Provider identity, freshness, a realtime flag or an entitlement string are
 * never sufficient on their own. PAPER requires explicit realtime evidence,
 * explicit PAPER entitlement/provenance and a provider-specific verification
 * step completed by the collector. Unknown, delayed, historical, daily-close
 * and legacy observations remain VALIDATION_ONLY.
 *
 * No secret values are accepted or returned here.
 */
export function classifyPaperEvidence(observation: RawMarketObservation): PaperEvidenceClassification {
  const family = String(observation?.sourceFamily || observation?.source || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "");
  const entitlement = String(observation?.entitlement || "").trim().toUpperCase();

  if (!family) {
    return { sourceFamily: "unknown", eligibility: "VALIDATION_ONLY", reason: "missing source family" };
  }

  if (observation?.realtime === true && entitlement === "PAPER" && observation?.provenanceVerified === true) {
    return {
      sourceFamily: family,
      eligibility: "PAPER",
      reason: "explicit realtime PAPER entitlement with verified provenance",
    };
  }

  if (observation?.realtime === true && entitlement === "PAPER" && observation?.provenanceVerified !== true) {
    return {
      sourceFamily: family,
      eligibility: "VALIDATION_ONLY",
      reason: "PAPER provenance was not independently verified",
    };
  }

  return {
    sourceFamily: family,
    eligibility: "VALIDATION_ONLY",
    reason: "PAPER eligibility not explicitly proven",
  };
}
