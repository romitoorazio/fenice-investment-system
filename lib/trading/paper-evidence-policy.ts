export type RawMarketObservation = {
  symbol?: string;
  assetClass?: string;
  source?: string;
  sourceFamily?: string;
  price?: number;
  observedAt?: string;
  entitlement?: string;
  realtime?: boolean;
};

export type PaperEvidenceClassification = {
  sourceFamily: string;
  eligibility: "VALIDATION_ONLY" | "PAPER";
  reason: string;
};

/**
 * Conservative source classification for PAPER certification.
 *
 * This function deliberately does NOT infer PAPER eligibility from a provider
 * name alone. A source must carry explicit evidence that the observation is
 * permitted/appropriate for PAPER execution validation. Unknown, delayed,
 * historical, daily-close and legacy observations remain VALIDATION_ONLY.
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

  if (observation?.realtime === true && entitlement === "PAPER") {
    return { sourceFamily: family, eligibility: "PAPER", reason: "explicit realtime PAPER entitlement" };
  }

  return {
    sourceFamily: family,
    eligibility: "VALIDATION_ONLY",
    reason: "PAPER eligibility not explicitly proven",
  };
}
