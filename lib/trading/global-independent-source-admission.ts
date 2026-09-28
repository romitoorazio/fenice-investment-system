export type IndependentGlobalSourceEligibility = "VALIDATION_ONLY" | "PAPER";

export type IndependentEntitlementUsageScope =
  | "NON_DISPLAY_INTERNAL"
  | "DISPLAY_ONLY"
  | "REDISTRIBUTION_ONLY"
  | "UNKNOWN";

export type IndependentGlobalSourceClaim = {
  provider: string;
  sourceFamily: string;
  symbol: string;
  exchangeMic: string;
  currency: string;
  price: number;
  observedAt: string;
  realtime: boolean;
  exactVenueVerified: boolean;
  provenanceVerified: boolean;
  entitlement: {
    status: "VERIFIED" | "UNVERIFIED" | "NOT_ENTITLED" | "DELAYED_ONLY" | "EOD_ONLY";
    evidenceRef?: string;
    evidenceSha256?: string;
    validUntil?: string;
    usageScope?: IndependentEntitlementUsageScope;
    automatedUseAllowed?: boolean;
  };
  readOnly?: boolean;
  datafeedEntitled?: boolean;
  writeTradingCommandsAllowed?: boolean;
};

export type IndependentGlobalSourceAdmission = {
  provider: string;
  sourceFamily: string;
  admittedForPaper: boolean;
  eligibility: IndependentGlobalSourceEligibility;
  exchangeMic: string;
  reasons: string[];
};

const SHA256 = /^[a-f0-9]{64}$/i;
const MIC = /^[A-Z0-9]{4}$/;
const CURRENCY = /^[A-Z]{3}$/;

function normalized(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function validIso(value: unknown): number | null {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateIndependentGlobalSourceAdmission(
  claim: IndependentGlobalSourceClaim,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
): IndependentGlobalSourceAdmission {
  const reasons: string[] = [];
  const provider = String(claim?.provider || "").trim().toLowerCase();
  const sourceFamily = String(claim?.sourceFamily || "").trim().toLowerCase();
  const exchangeMic = normalized(claim?.exchangeMic);
  const symbol = normalized(claim?.symbol);
  const currency = normalized(claim?.currency);
  const observedAtMs = validIso(claim?.observedAt);
  const ageSeconds = observedAtMs === null ? Number.POSITIVE_INFINITY : (nowMs - observedAtMs) / 1000;
  const evidenceRef = String(claim?.entitlement?.evidenceRef || "").trim();
  const evidenceSha256 = String(claim?.entitlement?.evidenceSha256 || "").trim().toLowerCase();
  const entitlementValidUntilMs = validIso(claim?.entitlement?.validUntil);
  const usageScope = String(claim?.entitlement?.usageScope || "UNKNOWN").trim().toUpperCase();

  if (!provider) reasons.push("provider missing");
  if (!sourceFamily) reasons.push("source family missing");
  if (sourceFamily === "twelve-data" || provider === "twelve-data") reasons.push("second source must be independent from Twelve Data");
  if (!symbol) reasons.push("symbol missing");
  if (!MIC.test(exchangeMic)) reasons.push("exact four-character MIC missing or invalid");
  if (!CURRENCY.test(currency)) reasons.push("currency missing or invalid");
  if (!Number.isFinite(Number(claim?.price)) || Number(claim?.price) <= 0) reasons.push("positive price missing");
  if (observedAtMs === null) reasons.push("provider timestamp missing or invalid");
  else if (ageSeconds < 0 || ageSeconds > maxAgeSeconds) reasons.push(`provider timestamp outside ${maxAgeSeconds}s freshness window`);
  if (claim?.realtime !== true) reasons.push("source is not verified realtime");
  if (claim?.exactVenueVerified !== true) reasons.push("exact venue/MIC provenance not verified");
  if (claim?.provenanceVerified !== true) reasons.push("provider provenance not verified");
  if (claim?.entitlement?.status !== "VERIFIED") reasons.push("realtime entitlement not independently verified");
  if (!evidenceRef) reasons.push("entitlement evidence reference missing");
  if (!SHA256.test(evidenceSha256)) reasons.push("entitlement evidence SHA-256 missing or invalid");
  if (entitlementValidUntilMs === null) reasons.push("entitlement validity end missing or invalid");
  else if (entitlementValidUntilMs <= nowMs) reasons.push("realtime entitlement expired");
  if (usageScope !== "NON_DISPLAY_INTERNAL") reasons.push("entitlement does not explicitly cover internal non-display use");
  if (claim?.entitlement?.automatedUseAllowed !== true) reasons.push("entitlement does not explicitly allow automated application use");

  if (provider === "directa-readonly" || sourceFamily === "directa") {
    if (claim?.readOnly !== true) reasons.push("Directa admission requires read-only mode");
    if (claim?.datafeedEntitled !== true) reasons.push("Directa datafeed entitlement not verified");
    if (claim?.writeTradingCommandsAllowed !== false) reasons.push("Directa trading writes must remain blocked");
  }

  const admittedForPaper = reasons.length === 0;
  return {
    provider,
    sourceFamily,
    admittedForPaper,
    eligibility: admittedForPaper ? "PAPER" : "VALIDATION_ONLY",
    exchangeMic,
    reasons,
  };
}
