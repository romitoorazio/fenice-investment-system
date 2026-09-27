export type PersistedGlobalMarketDataEntitlement = {
  provider: string;
  exchangeMic: string;
  status: "VERIFIED" | "PENDING" | "REVOKED";
  paperAllowed: boolean;
  evidenceRef: string;
  evidenceSha256: string;
  reviewedAt: string;
  validUntil?: string | null;
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
};

export type ResolvedGlobalPaperEntitlement = {
  paperAllowed: boolean;
  approvedMics: readonly string[];
  evidenceRef: string;
  evidenceSha256: string;
  persistedEvidenceFound: boolean;
  runtimeClaimMatched: boolean;
  expired: boolean;
  reasons: string[];
};

const SHA256 = /^[a-f0-9]{64}$/i;

function normalizedMic(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizedHash(value: unknown): string {
  const hash = String(value || "").trim().toLowerCase();
  return SHA256.test(hash) ? hash : "";
}

function validDate(value: unknown): number | null {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
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

  const candidates = records.filter((record) =>
    String(record?.provider || "").trim().toLowerCase() === "twelve-data"
    && normalizedMic(record?.exchangeMic) === mic
    && record?.status === "VERIFIED"
    && record?.paperAllowed === true,
  );

  let record: PersistedGlobalMarketDataEntitlement | undefined;
  let expired = false;
  for (const candidate of candidates) {
    const reviewedAt = validDate(candidate.reviewedAt);
    const validUntil = candidate.validUntil ? validDate(candidate.validUntil) : null;
    const evidenceRef = String(candidate.evidenceRef || "").trim();
    const evidenceSha256 = normalizedHash(candidate.evidenceSha256);
    if (reviewedAt === null || reviewedAt > nowMs || !evidenceRef || !evidenceSha256) continue;
    if (candidate.validUntil && (validUntil === null || validUntil <= nowMs)) {
      expired = true;
      continue;
    }
    record = candidate;
    break;
  }

  const persistedEvidenceFound = Boolean(record);
  if (!persistedEvidenceFound) {
    reasons.push(expired
      ? `persisted Twelve Data entitlement for ${mic || "unknown MIC"} is expired`
      : `no valid persisted Twelve Data entitlement for ${mic || "unknown MIC"}`);
  }

  const runtimeMics = (runtimeClaim.approvedMics || []).map(normalizedMic).filter(Boolean);
  const runtimeRef = String(runtimeClaim.evidenceRef || "").trim();
  const runtimeHash = normalizedHash(runtimeClaim.evidenceSha256);
  const runtimeClaimMatched = Boolean(record)
    && runtimeMics.includes(mic)
    && runtimeRef === String(record?.evidenceRef || "").trim()
    && runtimeHash === normalizedHash(record?.evidenceSha256);

  if (record && !runtimeClaimMatched) {
    reasons.push("runtime entitlement claim does not match the persisted exact-MIC evidence reference and SHA-256");
  }

  const paperAllowed = persistedEvidenceFound && runtimeClaimMatched;
  return {
    paperAllowed,
    approvedMics: paperAllowed ? [mic] : [],
    evidenceRef: paperAllowed ? String(record?.evidenceRef || "").trim() : "",
    evidenceSha256: paperAllowed ? normalizedHash(record?.evidenceSha256) : "",
    persistedEvidenceFound,
    runtimeClaimMatched,
    expired,
    reasons,
  };
}
