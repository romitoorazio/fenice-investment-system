export type PersistedBrokerVenueIdentity = {
  broker: string;
  brokerTicker: string;
  isin: string;
  exchangeMic: string;
  currency: string;
  status: "VERIFIED" | "PENDING" | "REVOKED";
  evidenceRef: string;
  evidenceSha256: string;
  reviewedAt: string;
  validUntil?: string | null;
};

export type BrokerVenueIdentityRegistry = {
  version?: number;
  policy?: string;
  updatedAt?: string | null;
  identities?: PersistedBrokerVenueIdentity[];
};

export type BrokerVenueIdentityDecision = {
  broker: string;
  brokerTicker: string;
  isin: string;
  exactVenueVerified: boolean;
  exchangeMic: string;
  currency: string;
  evidenceRef: string;
  evidenceSha256: string;
  reasons: string[];
};

const SHA256 = /^[a-f0-9]{64}$/i;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const MIC = /^[A-Z0-9]{4}$/;
const CURRENCY = /^[A-Z]{3}$/;

function norm(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function dateMs(value: unknown): number | null {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveBrokerVenueIdentity(
  registry: BrokerVenueIdentityRegistry | null | undefined,
  broker: unknown,
  brokerTicker: unknown,
  isin: unknown,
  nowMs = Date.now(),
): BrokerVenueIdentityDecision {
  const brokerId = String(broker || "").trim().toLowerCase();
  const ticker = norm(brokerTicker);
  const normalizedIsin = norm(isin);
  const reasons: string[] = [];

  if (!brokerId) reasons.push("broker missing");
  if (!ticker) reasons.push("broker ticker missing");
  if (!ISIN.test(normalizedIsin)) reasons.push("valid ISIN required for broker venue identity");

  const records = Array.isArray(registry?.identities) ? registry.identities : [];
  const matches = records.filter((record) =>
    String(record?.broker || "").trim().toLowerCase() === brokerId
    && norm(record?.brokerTicker) === ticker
    && norm(record?.isin) === normalizedIsin
    && record?.status === "VERIFIED",
  );

  let selected: PersistedBrokerVenueIdentity | undefined;
  let expired = false;
  for (const record of matches) {
    const mic = norm(record.exchangeMic);
    const currency = norm(record.currency);
    const reviewedAt = dateMs(record.reviewedAt);
    const validUntil = record.validUntil ? dateMs(record.validUntil) : null;
    const evidenceRef = String(record.evidenceRef || "").trim();
    const evidenceSha256 = String(record.evidenceSha256 || "").trim().toLowerCase();
    if (!MIC.test(mic) || !CURRENCY.test(currency) || reviewedAt === null || reviewedAt > nowMs || !evidenceRef || !SHA256.test(evidenceSha256)) continue;
    if (record.validUntil && (validUntil === null || validUntil <= nowMs)) {
      expired = true;
      continue;
    }
    selected = record;
    break;
  }

  if (!selected) reasons.push(expired
    ? `verified broker venue identity for ${brokerId}:${ticker}:${normalizedIsin} is expired`
    : `no valid verified broker venue identity for ${brokerId}:${ticker}:${normalizedIsin}`);

  return {
    broker: brokerId,
    brokerTicker: ticker,
    isin: normalizedIsin,
    exactVenueVerified: Boolean(selected) && reasons.length === 0,
    exchangeMic: selected ? norm(selected.exchangeMic) : "",
    currency: selected ? norm(selected.currency) : "",
    evidenceRef: selected ? String(selected.evidenceRef || "").trim() : "",
    evidenceSha256: selected ? String(selected.evidenceSha256 || "").trim().toLowerCase() : "",
    reasons,
  };
}
