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
    symbol: claim?.symbol,
    currency: claim?.currency,
    assetClass: String(claim?.assetClass || "equity").trim().toLowerCase() || "equity",
    source: `${admission.provider} exact-MIC independent quote (${admission.exchangeMic})`,
    sourceFamily: admission.sourceFamily,
    eligibility: admission.eligibility,
    price: claim?.price,
    observedAt: claim?.observedAt,
    provenanceVerified: claim?.provenanceVerified === true && claim?.exactVenueVerified === true,
    provenanceMethod: admission.admittedForPaper
      ? `independent-admission:${claim.exchangeMic};entitlement:${claim.entitlement.evidenceRef}`
      : `independent-admission:${claim.exchangeMic};validation-only`,
  });

  if (!normalized) return { admission, evidence: null };
  return {
    admission,
    evidence: {
      ...normalized,
      exchangeMic: admission.exchangeMic,
      ...(admission.admittedForPaper ? { paperAdmissionProof: {
        provider: admission.provider, sourceFamily: admission.sourceFamily,
        symbol: normalized.symbol, exchangeMic: admission.exchangeMic, currency: normalized.currency,
        price: normalized.price, observedAt: normalized.observedAt, checkedAt: new Date(nowMs).toISOString(),
        evidenceRef: claim.entitlement.evidenceRef!, evidenceSha256: claim.entitlement.evidenceSha256!,
        validUntil: claim.entitlement.validUntil!, usageScope: "NON_DISPLAY_INTERNAL" as const,
        automatedUseAllowed: true as const, dualControlVerified: true as const,
      } } : {}),
    },
  };
}
