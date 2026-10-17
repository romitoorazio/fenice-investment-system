export type DirectaEntitlementUsageScope = "NON_DISPLAY_INTERNAL" | "DISPLAY_ONLY" | "UNKNOWN";

export type PersistedDirectaGlobalEntitlement = {
  exchangeMic: string;
  status: "VERIFIED" | "PENDING" | "REVOKED";
  realtimeHistoricalAllowed: boolean;
  evidenceRef: string;
  evidenceSha256: string;
  reviewedAt: string;
  validUntil?: string | null;
  usageScope?: DirectaEntitlementUsageScope;
  automatedUseAllowed?: boolean;
};

export type DirectaGlobalEntitlementRegistry = {
  version?: number;
  policy?: string;
  updatedAt?: string | null;
  entitlements?: PersistedDirectaGlobalEntitlement[];
};

export type DirectaGlobalRuntimeClaim = {
  apiRealtimeHistoricalConfirmed?: boolean;
  confirmedMarketMics?: readonly string[];
  evidenceRef?: string;
  evidenceSha256?: string;
  confirmedAt?: string;
};

export type ResolvedDirectaGlobalEntitlement = {
  verified: boolean;
  exchangeMic: string;
  evidenceRef: string;
  evidenceSha256: string;
  validUntil: string;
  usageScope: DirectaEntitlementUsageScope;
  automatedUseAllowed: boolean;
  persistedEvidenceFound: boolean;
  runtimeClaimMatched: boolean;
  runtimeClaimFresh: boolean;
  expired: boolean;
  legalUseScopeVerified: boolean;
  reasons: string[];
};

const SHA256 = /^[a-f0-9]{64}$/i;
const MIC = /^[A-Z0-9]{4}$/;
const MAX_RUNTIME_CLAIM_AGE_MS = 5 * 60 * 1000;

function mic(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  return MIC.test(normalized) ? normalized : "";
}

function hash(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  return SHA256.test(normalized) ? normalized : "";
}

function dateMs(value: unknown): number | null {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function usageScope(value: unknown): DirectaEntitlementUsageScope {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "NON_DISPLAY_INTERNAL" || normalized === "DISPLAY_ONLY") return normalized;
  return "UNKNOWN";
}

export function resolveDirectaGlobalEntitlementProof(
  registry: DirectaGlobalEntitlementRegistry | null | undefined,
  exchangeMic: unknown,
  runtimeClaim: DirectaGlobalRuntimeClaim = {},
  nowMs = Date.now(),
): ResolvedDirectaGlobalEntitlement {
  const expectedMic = mic(exchangeMic);
  const reasons: string[] = [];
  if (!expectedMic) reasons.push("valid exact MIC required for Directa entitlement proof");

  const records = Array.isArray(registry?.entitlements) ? registry.entitlements : [];
  const candidates = records.filter((record) =>
    mic(record?.exchangeMic) === expectedMic
    && record?.status === "VERIFIED"
    && record?.realtimeHistoricalAllowed === true,
  );

  let selected: PersistedDirectaGlobalEntitlement | undefined;
  let expired = false;
  let scopeMismatch = false;
  for (const record of candidates) {
    const reviewedAt = dateMs(record.reviewedAt);
    const validUntil = record.validUntil ? dateMs(record.validUntil) : null;
    const evidenceRef = String(record.evidenceRef || "").trim();
    const evidenceSha256 = hash(record.evidenceSha256);
    const scope = usageScope(record.usageScope);
    if (reviewedAt === null || reviewedAt > nowMs || !evidenceRef || !evidenceSha256) continue;
    // Broker-grade admission requires an explicit expiry. An open-ended or malformed
    // entitlement cannot silently survive forever in persisted state.
    if (validUntil === null || validUntil <= nowMs) {
      expired = true;
      continue;
    }
    if (scope !== "NON_DISPLAY_INTERNAL" || record.automatedUseAllowed !== true) {
      scopeMismatch = true;
      continue;
    }
    selected = record;
    break;
  }

  const persistedEvidenceFound = Boolean(selected);
  if (!persistedEvidenceFound) {
    if (scopeMismatch) reasons.push(`persisted Directa entitlement for ${expectedMic || "unknown MIC"} does not prove automated internal non-display use rights`);
    else if (expired) reasons.push(`persisted Directa realtime entitlement for ${expectedMic || "unknown MIC"} is missing a valid future expiry or is expired`);
    else reasons.push(`no valid persisted Directa realtime entitlement for ${expectedMic || "unknown MIC"}`);
  }

  const runtimeMics = (runtimeClaim.confirmedMarketMics || []).map(mic).filter(Boolean);
  const runtimeRef = String(runtimeClaim.evidenceRef || "").trim();
  const runtimeHash = hash(runtimeClaim.evidenceSha256);
  const runtimeConfirmedAt = dateMs(runtimeClaim.confirmedAt);
  const runtimeClaimFresh = runtimeConfirmedAt !== null
    && runtimeConfirmedAt <= nowMs
    && nowMs - runtimeConfirmedAt <= MAX_RUNTIME_CLAIM_AGE_MS;

  const runtimeClaimMatched = Boolean(selected)
    && runtimeClaim.apiRealtimeHistoricalConfirmed === true
    && runtimeMics.includes(expectedMic)
    && runtimeRef === String(selected?.evidenceRef || "").trim()
    && runtimeHash === hash(selected?.evidenceSha256)
    && runtimeClaimFresh;

  if (selected && !runtimeClaimFresh) reasons.push("runtime Directa entitlement confirmation is missing, future-dated, or older than 5 minutes");
  if (selected && runtimeClaimFresh && !runtimeClaimMatched) reasons.push("runtime Directa entitlement claim does not match persisted exact-MIC evidence reference and SHA-256");

  const selectedScope = usageScope(selected?.usageScope);
  const legalUseScopeVerified = Boolean(selected)
    && selectedScope === "NON_DISPLAY_INTERNAL"
    && selected?.automatedUseAllowed === true;
  const verified = Boolean(expectedMic)
    && persistedEvidenceFound
    && runtimeClaimMatched
    && legalUseScopeVerified
    && reasons.length === 0;

  return {
    verified,
    exchangeMic: expectedMic,
    evidenceRef: verified ? String(selected?.evidenceRef || "").trim() : "",
    evidenceSha256: verified ? hash(selected?.evidenceSha256) : "",
    validUntil: verified ? String(selected?.validUntil || "").trim() : "",
    usageScope: verified ? selectedScope : "UNKNOWN",
    automatedUseAllowed: verified ? selected?.automatedUseAllowed === true : false,
    persistedEvidenceFound,
    runtimeClaimMatched,
    runtimeClaimFresh,
    expired,
    legalUseScopeVerified,
    reasons,
  };
}
