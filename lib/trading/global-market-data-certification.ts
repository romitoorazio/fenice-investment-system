import { evaluateMarketDataQuorum, type MarketDataQuorumDecision } from "./market-data-quorum.ts";
import {
  classifyExecutionPaperEligibility,
  isExecutionObservationFresh,
  normalizeExecutionEvidence,
  normalizeExecutionSymbol,
  type ExecutionInstrument,
  type ExecutionMarketEvidence,
} from "./execution-market-data.ts";

export type GlobalMarketTier = "EUROPE_CORE" | "DEVELOPED" | "EMERGING";
export type GlobalCertificationState = "CERTIFIED" | "DEGRADED" | "BLOCKED";

export type GlobalMarketSentinel = ExecutionInstrument & {
  name: string;
  tier: GlobalMarketTier;
};

export type TwelveDataQuoteVerification = {
  accepted: boolean;
  eligibility: "VALIDATION_ONLY" | "PAPER";
  evidence: GlobalExecutionMarketEvidence | null;
  reasons: string[];
  identity: {
    expectedSymbol: string;
    returnedSymbol: string;
    expectedMic: string;
    returnedMic: string;
    expectedCurrency: string;
    returnedCurrency: string;
    symbolMatched: boolean;
    micMatched: boolean;
    currencyMatched: boolean;
  };
  fresh: boolean;
};

export type GlobalExecutionMarketEvidence = ExecutionMarketEvidence & {
  exchangeMic: string;
};

export type GlobalPaperEntitlementProof = {
  paperAllowed: boolean;
  approvedMics: readonly string[];
  evidenceRef: string;
  evidenceSha256: string;
  validUntil: string;
  usageScope: "NON_DISPLAY_INTERNAL" | "DISPLAY_ONLY" | "REDISTRIBUTION_ONLY" | "UNKNOWN";
  automatedUseAllowed: boolean;
  runtimeClaimFresh: boolean;
  legalUseScopeVerified: boolean;
};

export type GlobalInstrumentCertification = {
  symbol: string;
  exchangeMic: string;
  country: string;
  currency: string;
  state: GlobalCertificationState;
  allowNewRisk: boolean;
  paperEligibleFamilies: string[];
  validationFamilies: string[];
  quorum: MarketDataQuorumDecision;
  reasons: string[];
};

const LISTED_SECURITY = /equity|stock|etf|azione|azion/i;
const SHA256 = /^[a-f0-9]{64}$/i;

export const GLOBAL_MARKET_SENTINELS: readonly GlobalMarketSentinel[] = [
  { symbol: "ENEL", name: "Enel", exchangeMic: "XMIL", country: "IT", currency: "EUR", assetClass: "equity", tier: "EUROPE_CORE" },
  { symbol: "SIE", name: "Siemens", exchangeMic: "XETR", country: "DE", currency: "EUR", assetClass: "equity", tier: "EUROPE_CORE" },
  { symbol: "MC", name: "LVMH", exchangeMic: "XPAR", country: "FR", currency: "EUR", assetClass: "equity", tier: "EUROPE_CORE" },
  { symbol: "VOD", name: "Vodafone", exchangeMic: "XLON", country: "GB", currency: "GBP", assetClass: "equity", tier: "EUROPE_CORE" },
  { symbol: "ASML", name: "ASML Holding", exchangeMic: "XAMS", country: "NL", currency: "EUR", assetClass: "equity", tier: "EUROPE_CORE" },
  { symbol: "IBE", name: "Iberdrola", exchangeMic: "XMAD", country: "ES", currency: "EUR", assetClass: "equity", tier: "EUROPE_CORE" },
  { symbol: "NOVN", name: "Novartis", exchangeMic: "XSWX", country: "CH", currency: "CHF", assetClass: "equity", tier: "EUROPE_CORE" },
  { symbol: "SHOP", name: "Shopify", exchangeMic: "XTSE", country: "CA", currency: "CAD", assetClass: "equity", tier: "DEVELOPED" },
  { symbol: "7203", name: "Toyota Motor", exchangeMic: "XTKS", country: "JP", currency: "JPY", assetClass: "equity", tier: "DEVELOPED" },
  { symbol: "0700", name: "Tencent", exchangeMic: "XHKG", country: "HK", currency: "HKD", assetClass: "equity", tier: "DEVELOPED" },
  { symbol: "BHP", name: "BHP Group", exchangeMic: "XASX", country: "AU", currency: "AUD", assetClass: "equity", tier: "DEVELOPED" },
  { symbol: "RELIANCE", name: "Reliance Industries", exchangeMic: "XNSE", country: "IN", currency: "INR", assetClass: "equity", tier: "EMERGING" },
  { symbol: "PETR4", name: "Petrobras PN", exchangeMic: "BVMF", country: "BR", currency: "BRL", assetClass: "equity", tier: "EMERGING" },
  { symbol: "600519", name: "Kweichow Moutai", exchangeMic: "XSHG", country: "CN", currency: "CNY", assetClass: "equity", tier: "EMERGING" },
] as const;

export const TWELVE_DATA_GLOBAL_PROBE_MICS = new Set(
  GLOBAL_MARKET_SENTINELS.map((item) => String(item.exchangeMic || "").toUpperCase()),
);

const ASIA_SESSION_MICS = new Set(["XTKS", "XHKG", "XASX", "XNSE", "XSHG"]);
const EUROPE_SESSION_MICS = new Set(["XMIL", "XETR", "XPAR", "XLON", "XAMS", "XMAD", "XSWX"]);
const AMERICAS_SESSION_MICS = new Set(["XTSE", "BVMF"]);

/**
 * Conservative weekday UTC windows used only to suppress obviously closed
 * observation probes. Exchange holidays remain fail-closed: a provider quote
 * still needs a fresh market timestamp and exact-MIC identity to be accepted.
 */
export function isGlobalObservationSessionWindowOpen(exchangeMic: unknown, nowMs = Date.now()): boolean {
  const now = new Date(nowMs);
  const weekday = now.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const mic = normalizedMic(exchangeMic);
  if (ASIA_SESSION_MICS.has(mic)) return minute >= 0 && minute <= 390;
  if (EUROPE_SESSION_MICS.has(mic)) return minute >= 420 && minute <= 930;
  if (AMERICAS_SESSION_MICS.has(mic)) return minute >= 810 && minute <= 1200;
  return false;
}

function normalizedMic(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizedCurrency(value: unknown): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

function responseTimestamp(data: Record<string, unknown>): string | null {
  const unix = Number(data.timestamp);
  if (Number.isFinite(unix) && unix > 0) return new Date(unix * 1000).toISOString();
  const raw = String(data.datetime || "").trim();
  if (!raw) return null;
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function isTwelveDataGlobalPaperCandidate(instrument: ExecutionInstrument): boolean {
  const mic = normalizedMic(instrument.exchangeMic);
  return LISTED_SECURITY.test(String(instrument.assetClass || ""))
    && Boolean(normalizeExecutionSymbol(instrument.symbol))
    && Boolean(normalizedCurrency(instrument.currency))
    && TWELVE_DATA_GLOBAL_PROBE_MICS.has(mic);
}

export function twelveDataGlobalQuoteUrl(instrument: ExecutionInstrument, apiKey: string): string {
  if (!isTwelveDataGlobalPaperCandidate(instrument)) throw new Error("TWELVE_DATA_GLOBAL_UNSUPPORTED_INSTRUMENT");
  const params = new URLSearchParams({
    symbol: normalizeExecutionSymbol(instrument.symbol),
    mic_code: normalizedMic(instrument.exchangeMic),
    interval: "1min",
    apikey: String(apiKey || "").trim(),
  });
  return `https://api.twelvedata.com/quote?${params.toString()}`;
}

function isCompletePaperEntitlementProof(
  proof: GlobalPaperEntitlementProof | undefined,
  expectedMic: string,
  nowMs: number,
): boolean {
  if (!proof || proof.paperAllowed !== true) return false;
  if (!proof.approvedMics.map(normalizedMic).includes(expectedMic)) return false;
  if (!String(proof.evidenceRef || "").trim()) return false;
  if (!SHA256.test(String(proof.evidenceSha256 || "").trim())) return false;
  const validUntilMs = Date.parse(String(proof.validUntil || ""));
  if (!Number.isFinite(validUntilMs) || validUntilMs <= nowMs) return false;
  if (proof.usageScope !== "NON_DISPLAY_INTERNAL") return false;
  if (proof.automatedUseAllowed !== true) return false;
  if (proof.runtimeClaimFresh !== true) return false;
  if (proof.legalUseScopeVerified !== true) return false;
  return true;
}

export function verifyTwelveDataGlobalQuote(
  instrument: ExecutionInstrument,
  raw: unknown,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
  entitlementProof?: GlobalPaperEntitlementProof,
): TwelveDataQuoteVerification {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const expectedSymbol = normalizeExecutionSymbol(instrument.symbol);
  const returnedSymbol = normalizeExecutionSymbol(data.symbol);
  const expectedMic = normalizedMic(instrument.exchangeMic);
  const returnedMic = normalizedMic(data.mic_code || data.mic);
  const expectedCurrency = normalizedCurrency(instrument.currency);
  const returnedCurrency = normalizedCurrency(data.currency);
  const symbolMatched = Boolean(expectedSymbol && returnedSymbol && expectedSymbol === returnedSymbol);
  const micMatched = Boolean(expectedMic && returnedMic && expectedMic === returnedMic);
  const currencyMatched = Boolean(expectedCurrency && returnedCurrency && expectedCurrency === returnedCurrency);
  const reasons: string[] = [];

  if (String(data.status || "").toLowerCase() === "error" || data.code) reasons.push("provider returned an API error");
  if (!symbolMatched) reasons.push(`symbol mismatch: ${returnedSymbol || "missing"} != ${expectedSymbol || "missing"}`);
  if (!micMatched) reasons.push(`MIC mismatch: ${returnedMic || "missing"} != ${expectedMic || "missing"}`);
  if (!currencyMatched) reasons.push(`currency mismatch: ${returnedCurrency || "missing"} != ${expectedCurrency || "missing"}`);

  const price = Number(data.close ?? data.price);
  if (!Number.isFinite(price) || price <= 0) reasons.push("invalid or missing positive price");
  const observedAt = responseTimestamp(data);
  if (!observedAt) reasons.push("missing provider market timestamp");
  const fresh = Boolean(observedAt && isExecutionObservationFresh(observedAt, nowMs, maxAgeSeconds));
  if (observedAt && !fresh) reasons.push(`provider timestamp is older than ${maxAgeSeconds}s or is in the future`);

  const identityVerified = symbolMatched && micMatched && currencyMatched;
  const provenanceVerified = identityVerified && Boolean(observedAt) && Number.isFinite(price) && price > 0;
  const entitlementVerified = isCompletePaperEntitlementProof(entitlementProof, expectedMic, nowMs);
  if (provenanceVerified && fresh && !entitlementVerified) {
    reasons.push("PAPER entitlement for the exact MIC lacks complete current automated non-display proof");
  }
  const classifiedEligibility = observedAt
    ? classifyExecutionPaperEligibility({
      source: "Twelve Data authenticated exact-MIC global quote",
      sourceFamily: "twelve-data",
      observedAt,
      realtime: fresh,
      entitlement: entitlementVerified ? "PAPER" : "VALIDATION_ONLY",
      provenanceVerified,
    }, nowMs, maxAgeSeconds)
    : "VALIDATION_ONLY";
  const eligibility: "VALIDATION_ONLY" | "PAPER" = classifiedEligibility === "PAPER"
    ? "PAPER"
    : "VALIDATION_ONLY";

  const normalizedEvidence = provenanceVerified && observedAt
    ? normalizeExecutionEvidence({
      symbol: expectedSymbol,
      currency: expectedCurrency,
      assetClass: instrument.assetClass,
      source: eligibility === "PAPER"
        ? `Twelve Data exact-MIC fresh quote (${expectedMic})`
        : `Twelve Data exact-MIC quote (${expectedMic}); entitlement/freshness not PAPER-complete`,
      sourceFamily: "twelve-data",
      eligibility,
      price,
      observedAt,
      provenanceVerified: true,
      provenanceMethod: entitlementVerified
        ? `authenticated-exact-mic:${expectedMic};entitlement:verified-nondisplay-automated`
        : `authenticated-exact-mic:${expectedMic};entitlement:unverified-or-incomplete`,
    })
    : null;
  const evidence = normalizedEvidence
    ? { ...normalizedEvidence, exchangeMic: expectedMic } satisfies GlobalExecutionMarketEvidence
    : null;

  return {
    accepted: Boolean(evidence),
    eligibility,
    evidence,
    reasons,
    identity: {
      expectedSymbol,
      returnedSymbol,
      expectedMic,
      returnedMic,
      expectedCurrency,
      returnedCurrency,
      symbolMatched,
      micMatched,
      currencyMatched,
    },
    fresh,
  };
}

export function certifyGlobalInstrument(
  instrument: ExecutionInstrument,
  observations: readonly GlobalExecutionMarketEvidence[],
  nowMs = Date.now(),
): GlobalInstrumentCertification {
  const symbol = normalizeExecutionSymbol(instrument.symbol);
  const currency = normalizedCurrency(instrument.currency);
  const exchangeMic = normalizedMic(instrument.exchangeMic);
  const country = String(instrument.country || "").trim().toUpperCase();
  const relevant = observations.filter((item) => normalizeExecutionSymbol(item.symbol) === symbol
    && normalizedCurrency(item.currency) === currency
    && normalizedMic(item.exchangeMic) === exchangeMic);
  const quorumEvidence = relevant.map((item) => ({
    source: item.source,
    sourceFamily: item.sourceFamily,
    eligibility: item.eligibility,
    price: item.price,
    observedAt: item.observedAt,
  }));
  const quorum = evaluateMarketDataQuorum(quorumEvidence, undefined, nowMs);
  const paperEligibleFamilies = [...new Set(relevant.filter((item) => item.eligibility === "PAPER" || item.eligibility === "LIVE").map((item) => item.sourceFamily))].sort();
  const validationFamilies = [...new Set(relevant.filter((item) => item.eligibility === "VALIDATION_ONLY").map((item) => item.sourceFamily))].sort();
  const reasons = [...quorum.reasons];
  let state: GlobalCertificationState = "BLOCKED";
  if (quorum.allowNewRisk) state = "CERTIFIED";
  else if (paperEligibleFamilies.length >= 1 || validationFamilies.length >= 2) state = "DEGRADED";
  if (state !== "CERTIFIED" && paperEligibleFamilies.length < 2) {
    reasons.push(`global PAPER certification still requires 2 independent eligible families; found ${paperEligibleFamilies.length}`);
  }

  return {
    symbol,
    exchangeMic,
    country,
    currency,
    state,
    allowNewRisk: quorum.allowNewRisk,
    paperEligibleFamilies,
    validationFamilies,
    quorum,
    reasons: [...new Set(reasons)],
  };
}
