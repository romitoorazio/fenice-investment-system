import { normalizeExecutionEvidence } from "./execution-market-data.ts";
import {
  evaluateIndependentGlobalSourceAdmission,
  type IndependentGlobalSourceAdmission,
  type IndependentGlobalSourceClaim,
} from "./global-independent-source-admission.ts";
import type { GlobalExecutionMarketEvidence } from "./global-market-data-certification.ts";

export type AdmittedIndependentGlobalEvidence = {
  admission: IndependentGlobalSourceAdmission;
  evidence: GlobalExecutionMarketEvidence | null;
};

export function admitIndependentGlobalEvidence(
  claim: IndependentGlobalSourceClaim,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
): AdmittedIndependentGlobalEvidence {
  const admission = evaluateIndependentGlobalSourceAdmission(claim, nowMs, maxAgeSeconds);
  const normalized = normalizeExecutionEvidence({
    symbol: claim.symbol,
    currency: claim.currency,
    assetClass: String(claim.assetClass || "equity").trim().toLowerCase() || "equity",
    source: `${claim.provider} exact-MIC independent quote (${claim.exchangeMic})`,
    sourceFamily: claim.sourceFamily,
    eligibility: admission.eligibility,
    price: claim.price,
    observedAt: claim.observedAt,
    provenanceVerified: claim.provenanceVerified === true && claim.exactVenueVerified === true,
    provenanceMethod: admission.admittedForPaper
      ? `independent-admission:${claim.exchangeMic};entitlement:${claim.entitlement.evidenceRef}`
      : `independent-admission:${claim.exchangeMic};validation-only`,
  });

  if (!normalized) return { admission, evidence: null };
  return {
    admission,
    evidence: {
      ...normalized,
      exchangeMic: String(claim.exchangeMic || "").trim().toUpperCase(),
    },
  };
}
