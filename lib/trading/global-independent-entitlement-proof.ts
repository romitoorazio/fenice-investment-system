import type { IndependentEntitlementUsageScope } from "./global-independent-source-admission.ts";

export type PersistedIndependentGlobalEntitlement = {
  provider: string;
  sourceFamily: string;
  exchangeMic: string;
  status: "VERIFIED" | "PENDING" | "REVOKED";
  realtimeAllowed: boolean;
  paperAllowed: boolean;
  evidenceRef: string;
  evidenceSha256: string;
  reviewedAt: string;
  validUntil?: string | null;
  usageScope?: IndependentEntitlementUsageScope;
  automatedUseAllowed?: boolean;
};

export type IndependentGlobalEntitlementRegistry = {
  version?: number;
  policy?: string;
  updatedAt?: string | null;
  entitlements?: PersistedIndependentGlobalEntitlement[];
};

export type IndependentGlobalRuntimeEntitlementClaim = {
  provider?: string;
  sourceFamily?: string;
  approvedMics?: readonly string[];
  evidenceRef?: string;
  evidenceSha256?: string;
  confirmedAt?: string;
};

export type ResolvedIndependentGlobalEntitlement = {
  verified: boolean;
  provider: string;
  sourceFamily: string;
  exchangeMic: string;
  evidenceRef: string;
  evidenceSha256: string;
  validUntil: string;
  usageScope: IndependentEntitlementUsageScope;
  automatedUseAllowed: boolean;
  persistedEvidenceFound: boolean;
  runtimeClaimMatched: boolean;
  runtimeClaimFresh: boolean;
  legalUseScopeVerified: boolean;
  expired: boolean;
  reasons: string[];
};

const MIC = /^[A-Z0-9]{4}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_RUNTIME_CLAIM_AGE_MS = 5 * 60 * 1000;

function lower(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function mic(value: unknown): string {
  const result = String(value || "").trim().toUpperCase();
  return MIC.test(result) ? result : "";
}

function hash(value: unknown): string {
  const result = String(value || "").trim().toLowerCase();
  return SHA256.test(result) ? result : "";
}

function dateMs(value: unknown): number | null {
  const result = Date.parse(String(value || ""));
  return Number.isFinite(result) ? result : null;
}

function scope(value: unknown): IndependentEntitlementUsageScope {
  const result = String(value || "").trim().toUpperCase();
  if (result === "NON_DISPLAY_INTERNAL" || result === "DISPLAY_ONLY" || result === "REDISTRIBUTION_ONLY") return result;
  return "UNKNOWN";
}

export function resolveIndependentGlobalEntitlementProof(
  registry: IndependentGlobalEntitlementRegistry | null | undefined,
  provider: unknown,
  sourceFamily: unknown,
  exchangeMic: unknown,
  runtimeClaim: IndependentGlobalRuntimeEntitlementClaim = {},
  nowMs = Date.now(),
): ResolvedIndependentGlobalEntitlement {
  const expectedProvider = lower(provider);
  const expectedFamily = lower(sourceFamily);
  const expectedMic = mic(exchangeMic);
  const reasons: string[] = [];
  if (!expectedProvider) reasons.push("independent entitlement provider required");
  if (!expectedFamily) reasons.push("independent entitlement source family required");
  if (!expectedMic) reasons.push("independent entitlement exact four-character MIC required");

  const records = Array.isArray(registry?.entitlements) ? registry.entitlements : [];
  const candidates = records.filter((item) =>
    lower(item?.provider) === expectedProvider
    && lower(item?.sourceFamily) === expectedFamily
    && mic(item?.exchangeMic) === expectedMic
    && item?.status === "VERIFIED"
    && item?.realtimeAllowed === true
    && item?.paperAllowed === true,
  );

  let selected: PersistedIndependentGlobalEntitlement | undefined;
  let expired = false;
  let scopeMismatch = false;
  for (const item of candidates) {
    const reviewedAt = dateMs(item.reviewedAt);
    const validUntil = dateMs(item.validUntil);
    const evidenceRef = String(item.evidenceRef || "").trim();
    const evidenceSha256 = hash(item.evidenceSha256);
    const usageScope = scope(item.usageScope);
    if (reviewedAt === null || reviewedAt > nowMs || !evidenceRef || !evidenceSha256) continue;
    if (validUntil === null || validUntil <= nowMs) {
      expired = true;
      continue;
    }
    if (usageScope !== "NON_DISPLAY_INTERNAL" || item.automatedUseAllowed !== true) {
      scopeMismatch = true;
      continue;
    }
    selected = item;
    break;
  }

  const persistedEvidenceFound = Boolean(selected);
  if (!persistedEvidenceFound) {
    if (scopeMismatch) reasons.push("persisted independent-feed entitlement does not prove automated internal non-display use rights");
    else if (expired) reasons.push("persisted independent-feed entitlement is missing a valid future expiry or is expired");
    else reasons.push(`no valid persisted independent-feed entitlement for ${expectedProvider || "unknown provider"}/${expectedFamily || "unknown family"}/${expectedMic || "unknown MIC"}`);
  }

  const runtimeProvider = lower(runtimeClaim.provider);
  const runtimeFamily = lower(runtimeClaim.sourceFamily);
  const runtimeMics = (runtimeClaim.approvedMics || []).map(mic).filter(Boolean);
  const runtimeRef = String(runtimeClaim.evidenceRef || "").trim();
  const runtimeHash = hash(runtimeClaim.evidenceSha256);
  const runtimeConfirmedAt = dateMs(runtimeClaim.confirmedAt);
  const runtimeClaimFresh = runtimeConfirmedAt !== null
    && runtimeConfirmedAt <= nowMs
    && nowMs - runtimeConfirmedAt <= MAX_RUNTIME_CLAIM_AGE_MS;
  const runtimeClaimMatched = Boolean(selected)
    && runtimeProvider === expectedProvider
    && runtimeFamily === expectedFamily
    && runtimeMics.includes(expectedMic)
    && runtimeRef === String(selected?.evidenceRef || "").trim()
    && runtimeHash === hash(selected?.evidenceSha256)
    && runtimeClaimFresh;

  if (selected && !runtimeClaimFresh) reasons.push("runtime independent-feed entitlement confirmation is missing, future-dated, or older than 5 minutes");
  if (selected && runtimeClaimFresh && !runtimeClaimMatched) reasons.push("runtime independent-feed entitlement claim does not match persisted provider/family/exact-MIC evidence reference and SHA-256");

  const selectedScope = scope(selected?.usageScope);
  const legalUseScopeVerified = Boolean(selected)
    && selectedScope === "NON_DISPLAY_INTERNAL"
    && selected?.automatedUseAllowed === true;
  const verified = Boolean(expectedProvider && expectedFamily && expectedMic)
    && persistedEvidenceFound
    && runtimeClaimMatched
    && legalUseScopeVerified
    && reasons.length === 0;

  return {
    verified,
    provider: expectedProvider,
    sourceFamily: expectedFamily,
    exchangeMic: expectedMic,
    evidenceRef: verified ? String(selected?.evidenceRef || "").trim() : "",
    evidenceSha256: verified ? hash(selected?.evidenceSha256) : "",
    validUntil: verified ? String(selected?.validUntil || "").trim() : "",
    usageScope: verified ? selectedScope : "UNKNOWN",
    automatedUseAllowed: verified ? selected?.automatedUseAllowed === true : false,
    persistedEvidenceFound,
    runtimeClaimMatched,
    runtimeClaimFresh,
    legalUseScopeVerified,
    expired,
    reasons,
  };
}
