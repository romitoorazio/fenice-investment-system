import type { DirectaQuote } from "../brokers/directa-datafeed.ts";
import {
  resolveBrokerVenueIdentity,
  type BrokerVenueIdentityDecision,
  type BrokerVenueIdentityRegistry,
} from "./global-broker-venue-identity.ts";
import {
  resolveDirectaGlobalEntitlementProof,
  type DirectaGlobalEntitlementRegistry,
  type DirectaGlobalRuntimeClaim,
  type ResolvedDirectaGlobalEntitlement,
} from "./directa-global-entitlement-proof.ts";
import { admitIndependentGlobalEvidence, type AdmittedIndependentGlobalEvidence } from "./global-independent-evidence.ts";

export type DirectaGlobalSourceCandidateResult = {
  venueIdentity: BrokerVenueIdentityDecision;
  entitlement: ResolvedDirectaGlobalEntitlement;
  admission: AdmittedIndependentGlobalEvidence;
};

export function evaluateDirectaGlobalSourceCandidate(
  quote: Pick<DirectaQuote, "ticker" | "isin" | "lastPrice" | "priceObservedAt">,
  venueRegistry: BrokerVenueIdentityRegistry | null | undefined,
  entitlementRegistry: DirectaGlobalEntitlementRegistry | null | undefined,
  runtimeEntitlement: DirectaGlobalRuntimeClaim = {},
  nowMs = Date.now(),
  maxAgeSeconds = 120,
): DirectaGlobalSourceCandidateResult {
  const venueIdentity = resolveBrokerVenueIdentity(
    venueRegistry,
    "directa",
    quote?.ticker,
    quote?.isin,
    nowMs,
  );

  const entitlement = resolveDirectaGlobalEntitlementProof(
    entitlementRegistry,
    venueIdentity.exchangeMic,
    runtimeEntitlement,
    nowMs,
  );

  const admission = admitIndependentGlobalEvidence({
    provider: "directa-readonly",
    sourceFamily: "directa",
    symbol: String(quote?.ticker || "").trim().toUpperCase(),
    exchangeMic: venueIdentity.exchangeMic,
    currency: venueIdentity.currency,
    price: Number(quote?.lastPrice),
    observedAt: String(quote?.priceObservedAt || "").trim(),
    realtime: entitlement.verified,
    exactVenueVerified: venueIdentity.exactVenueVerified,
    provenanceVerified: venueIdentity.exactVenueVerified && Boolean(String(quote?.isin || "").trim()),
    entitlement: {
      status: entitlement.verified ? "VERIFIED" : "UNVERIFIED",
      evidenceRef: entitlement.evidenceRef,
      evidenceSha256: entitlement.evidenceSha256,
      validUntil: entitlement.validUntil,
      usageScope: entitlement.usageScope,
      automatedUseAllowed: entitlement.automatedUseAllowed,
    },
    readOnly: true,
    datafeedEntitled: entitlement.verified,
    writeTradingCommandsAllowed: false,
  }, nowMs, maxAgeSeconds);

  return { venueIdentity, entitlement, admission };
}
