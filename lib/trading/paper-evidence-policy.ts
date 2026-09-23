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
 * Explicitly approved source families for zero-cost PAPER certification.
 *
 * Registration here is intentionally fail-closed: a caller cannot promote a
 * new provider to PAPER merely by setting provenanceVerified=true. Directa is
 * included only as an optional read-only evidence family; its separate
 * entitlement/identity/top-of-book checks still decide whether its evidence
 * may actually be marked PAPER.
 */
const ZERO_COST_PAPER_SOURCE_FAMILIES = new Set([
  "twelve-data",
  "alpaca",
  "directa",
]);

/**
 * Conservative source classification for PAPER certification.
 *
 * Provider identity, freshness, a realtime flag or an entitlement string are
 * never sufficient on their own. PAPER requires an explicitly registered
 * zero-cost source family, realtime evidence, explicit PAPER entitlement and a
 * provider-specific verification step completed by the collector. Unknown,
 * delayed, historical, daily-close and legacy observations remain
 * VALIDATION_ONLY.
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

  if (!ZERO_COST_PAPER_SOURCE_FAMILIES.has(family)) {
    return {
      sourceFamily: family,
      eligibility: "VALIDATION_ONLY",
      reason: "source family is not approved for zero-cost PAPER certification",
    };
  }

  if (observation?.realtime === true && entitlement === "PAPER" && observation?.provenanceVerified === true) {
    return {
      sourceFamily: family,
      eligibility: "PAPER",
      reason: "approved zero-cost source with explicit realtime PAPER entitlement and verified provenance",
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
