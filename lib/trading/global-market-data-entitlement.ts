export type GlobalEntitlementUsageScope = "NON_DISPLAY_INTERNAL" | "DISPLAY_ONLY" | "REDISTRIBUTION_ONLY" | "UNKNOWN";

export type PersistedGlobalMarketDataEntitlement = {
  provider: string;
  exchangeMic: string;
  status: "VERIFIED" | "PENDING" | "REVOKED";
  paperAllowed: boolean;
  evidenceRef: string;
  evidenceSha256: string;
  reviewedAt: string;
  validUntil?: string | null;
  usageScope?: GlobalEntitlementUsageScope;
  automatedUseAllowed?: boolean;
};

export type GlobalMarketDataEntitlementRegistry = {
  version?: number;
  policy?: string;
  provider?: string;
  updatedAt?: string | null;
  entitlements?: PersistedGlobalMarketDataEntitlement[];
};

export type GlobalMarketDataRuntimeEntitlementClaim = {
  approvedMics?: readonly string[];
  evidenceRef?: string;
  evidenceSha256?: string;
  confirmedAt?: string;
};

export type ResolvedGlobalPaperEntitlement = {
  paperAllowed: boolean;
  approvedMics: readonly string[];
  evidenceRef: string;
  evidenceSha256: string;
  validUntil: string;
  usageScope: GlobalEntitlementUsageScope;
  automatedUseAllowed: boolean;
  persistedEvidenceFound: boolean;
  runtimeClaimMatched: boolean;
  runtimeClaimFresh: boolean;
  legalUseScopeVerified: boolean;
  expired: boolean;
  reasons: string[];
};

const SHA256 = /^[a-f0-9]{64}$/i;
const MIC = /^[A-Z0-9]{4}$/;
const MAX_RUNTIME_CLAIM_AGE_MS = 5 * 60 * 1000;

function normalizedMic(value: unknown): string {
  const mic = String(value || "").trim().toUpperCase();
  return MIC.test(mic) ? mic : "";
}

function normalizedHash(value: unknown): string {
  const hash = String(value || "").trim().toLowerCase();
  return SHA256.test(hash) ? hash : "";
}

function validDate(value: unknown): number | null {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizedUsageScope(value: unknown): GlobalEntitlementUsageScope {
  const scope = String(value || "").trim().toUpperCase();
  if (scope === "NON_DISPLAY_INTERNAL" || scope === "DISPLAY_ONLY" || scope === "REDISTRIBUTION_ONLY") return scope;
  return "UNKNOWN";
}

export function resolveGlobalPaperEntitlementProof(
  registry: GlobalMarketDataEntitlementRegistry | null | undefined,
  exchangeMic: unknown,
  runtimeClaim: GlobalMarketDataRuntimeEntitlementClaim = {},
  nowMs = Date.now(),
): ResolvedGlobalPaperEntitlement {
  const mic = normalizedMic(exchangeMic);
  const records = Array.isArray(registry?.entitlements) ? registry.entitlements : [];
  const reasons: string[] = [];
  if (!mic) reasons.push("valid exact four-character MIC required for global entitlement proof");

  const candidates = records.filter((record) =>
    String(record?.provider || "").trim().toLowerCase() === "twelve-data"
    && normalizedMic(record?.exchangeMic) === mic
    && record?.status === "VERIFIED"
    && record?.paperAllowed === true,
  );

  let record: PersistedGlobalMarketDataEntitlement | undefined;
  let expired = false;
  let scopeMismatch = false;
  for (const candidate of candidates) {
    const reviewedAt = validDate(candidate.reviewedAt);
    const validUntil = candidate.validUntil ? validDate(candidate.validUntil) : null;
    const evidenceRef = String(candidate.evidenceRef || "").trim();
    const evidenceSha256 = normalizedHash(candidate.evidenceSha256);
    const scope = normalizedUsageScope(candidate.usageScope);
    if (reviewedAt === null || reviewedAt > nowMs || !evidenceRef || !evidenceSha256) continue;
    // Broker-grade evidence must have a bounded validity period. Missing or malformed
    // expiry is denied instead of being treated as an indefinite entitlement.
    if (validUntil === null || validUntil <= nowMs) {
      expired = true;
      continue;
    }
    if (scope !== "NON_DISPLAY_INTERNAL" || candidate.automatedUseAllowed !== true) {
      scopeMismatch = true;
      continue;
    }
    record = candidate;
    break;
  }

  const persistedEvidenceFound = Boolean(record);
  if (!persistedEvidenceFound) {
    if (scopeMismatch) reasons.push(`persisted Twelve Data entitlement for ${mic || "unknown MIC"} does not prove automated internal non-display use rights`);
    else if (expired) reasons.push(`persisted Twelve Data entitlement for ${mic || "unknown MIC"} is missing a valid future expiry or is expired`);
    else reasons.push(`no valid persisted Twelve Data entitlement for ${mic || "unknown MIC"}`);
  }

  const runtimeMics = (runtimeClaim.approvedMics || []).map(normalizedMic).filter(Boolean);
  const runtimeRef = String(runtimeClaim.evidenceRef || "").trim();
  const runtimeHash = normalizedHash(runtimeClaim.evidenceSha256);
  const runtimeConfirmedAt = validDate(runtimeClaim.confirmedAt);
  const runtimeClaimFresh = runtimeConfirmedAt !== null
    && runtimeConfirmedAt <= nowMs
    && nowMs - runtimeConfirmedAt <= MAX_RUNTIME_CLAIM_AGE_MS;
  const runtimeClaimMatched = Boolean(record)
    && runtimeMics.includes(mic)
    && runtimeRef === String(record?.evidenceRef || "").trim()
    && runtimeHash === normalizedHash(record?.evidenceSha256)
    && runtimeClaimFresh;

  if (record && !runtimeClaimFresh) {
    reasons.push("runtime Twelve Data entitlement confirmation is missing, future-dated, or older than 5 minutes");
  }
  if (record && runtimeClaimFresh && !runtimeClaimMatched) {
    reasons.push("runtime entitlement claim does not match the persisted exact-MIC evidence reference and SHA-256");
  }

  const scope = normalizedUsageScope(record?.usageScope);
  const legalUseScopeVerified = Boolean(record)
    && scope === "NON_DISPLAY_INTERNAL"
    && record?.automatedUseAllowed === true;
  const paperAllowed = Boolean(mic)
    && persistedEvidenceFound
    && runtimeClaimMatched
    && legalUseScopeVerified
    && reasons.length === 0;

  return {
    paperAllowed,
    approvedMics: paperAllowed ? [mic] : [],
    evidenceRef: paperAllowed ? String(record?.evidenceRef || "").trim() : "",
    evidenceSha256: paperAllowed ? normalizedHash(record?.evidenceSha256) : "",
    validUntil: paperAllowed ? String(record?.validUntil || "").trim() : "",
    usageScope: paperAllowed ? scope : "UNKNOWN",
    automatedUseAllowed: paperAllowed ? record?.automatedUseAllowed === true : false,
    persistedEvidenceFound,
    runtimeClaimMatched,
    runtimeClaimFresh,
    legalUseScopeVerified,
    expired,
    reasons,
  };
}
