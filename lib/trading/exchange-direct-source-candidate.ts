import type { GlobalExecutionMarketEvidence } from "./global-market-data-certification.ts";
import { admitIndependentGlobalEvidence, type AdmittedIndependentGlobalEvidence } from "./global-independent-evidence.ts";
import {
  resolveIndependentGlobalEntitlementProof,
  type IndependentGlobalEntitlementRegistry,
  type IndependentGlobalRuntimeEntitlementClaim,
  type ResolvedIndependentGlobalEntitlement,
} from "./global-independent-entitlement-proof.ts";

export type ExchangeDirectSourceCandidateResult = {
  entitlement: ResolvedIndependentGlobalEntitlement;
  admission: AdmittedIndependentGlobalEvidence;
};

export function evaluateExchangeDirectSourceCandidate(
  validatedEvidence: GlobalExecutionMarketEvidence,
  provider: string,
  sourceFamily: string,
  entitlementRegistry: IndependentGlobalEntitlementRegistry | null | undefined,
  runtimeEntitlement: IndependentGlobalRuntimeEntitlementClaim = {},
  nowMs = Date.now(),
  maxAgeSeconds = 120,
): ExchangeDirectSourceCandidateResult {
  const exchangeMic = String(validatedEvidence?.exchangeMic || "").trim().toUpperCase();
  const entitlement = resolveIndependentGlobalEntitlementProof(
    entitlementRegistry,
    provider,
    sourceFamily,
    exchangeMic,
    runtimeEntitlement,
    nowMs,
  );

  // A parser can prove technical identity/provenance, but never licensing by itself.
  // Only a dual-control entitlement resolver can move the composed evidence to PAPER.
  const parserEvidenceIsValidationOnly = validatedEvidence?.eligibility === "VALIDATION_ONLY";
  const parserProvenanceVerified = validatedEvidence?.provenanceVerified === true;
  const admission = admitIndependentGlobalEvidence({
    provider,
    sourceFamily,
    symbol: String(validatedEvidence?.symbol || "").trim().toUpperCase(),
    exchangeMic,
    currency: String(validatedEvidence?.currency || "").trim().toUpperCase(),
    price: Number(validatedEvidence?.price),
    observedAt: String(validatedEvidence?.observedAt || "").trim(),
    realtime: parserEvidenceIsValidationOnly && parserProvenanceVerified && entitlement.verified,
    exactVenueVerified: parserEvidenceIsValidationOnly && parserProvenanceVerified && Boolean(exchangeMic),
    provenanceVerified: parserEvidenceIsValidationOnly && parserProvenanceVerified,
    entitlement: {
      status: entitlement.verified ? "VERIFIED" : "UNVERIFIED",
      evidenceRef: entitlement.evidenceRef,
      evidenceSha256: entitlement.evidenceSha256,
      validUntil: entitlement.validUntil,
      usageScope: entitlement.usageScope,
      automatedUseAllowed: entitlement.automatedUseAllowed,
      dualControlVerified: entitlement.verified
        && entitlement.persistedEvidenceFound
        && entitlement.runtimeClaimMatched
        && entitlement.runtimeClaimFresh,
    },
  }, nowMs, maxAgeSeconds);

  return { entitlement, admission };
}
