import { evaluateMarketDataQuorum, type MarketDataQuorumDecision } from "./market-data-quorum.ts";
import { applyGlobalMarketStateGate, type GlobalMarketStateDecision } from "./global-market-state.ts";
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
  paperAdmissionProof?: GlobalPaperAdmissionProof;
  marketState?: GlobalMarketStateDecision;
};

/** Carries the checked entitlement and binds it to this exact observation. */
export type GlobalPaperAdmissionProof = {
  provider: string;
  sourceFamily: string;
  symbol: string;
  exchangeMic: string;
  currency: string;
  price: number;
  observedAt: string;
  checkedAt: string;
  evidenceRef: string;
  evidenceSha256: string;
  validUntil: string;
  usageScope: "NON_DISPLAY_INTERNAL";
  automatedUseAllowed: true;
  dualControlVerified: true;
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
  persistedEvidenceFound: boolean;
  runtimeClaimMatched: boolean;
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
  const mic = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{4}$/.test(mic) ? mic : "";
}

function normalizedCurrency(value: unknown): string {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function responseTimestamp(data: Record<string, unknown>): string | null {
  if (data.timestamp !== undefined && data.timestamp !== null) {
    const unix = positiveNumber(data.timestamp);
    const date = new Date(unix === null ? NaN : unix * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const raw = typeof data.datetime === "string" ? data.datetime.trim() : "";
  // An exchange-local time without an offset is not proof of a UTC instant.
  if (!/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return null;
  const parsed = Date.parse(raw);
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
  if (!Array.isArray(proof.approvedMics) || !proof.approvedMics.map(normalizedMic).includes(expectedMic)) return false;
  if (!String(proof.evidenceRef || "").trim()) return false;
  if (!SHA256.test(String(proof.evidenceSha256 || "").trim())) return false;
  const validUntilMs = Date.parse(String(proof.validUntil || ""));
  if (!Number.isFinite(validUntilMs) || validUntilMs <= nowMs) return false;
  if (proof.usageScope !== "NON_DISPLAY_INTERNAL") return false;
  if (proof.automatedUseAllowed !== true) return false;
  if (proof.runtimeClaimFresh !== true) return false;
  if (proof.legalUseScopeVerified !== true) return false;
  if (proof.persistedEvidenceFound !== true || proof.runtimeClaimMatched !== true) return false;
  return true;
}

export function verifyTwelveDataGlobalQuote(
  instrument: ExecutionInstrument,
  raw: unknown,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
  entitlementProof?: GlobalPaperEntitlementProof,
): TwelveDataQuoteVerification {
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
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

  const contextValid = typeof nowMs === "number" && Number.isFinite(nowMs) && Number.isFinite(new Date(nowMs).getTime())
    && typeof maxAgeSeconds === "number" && Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 && maxAgeSeconds <= 120;
  if (!contextValid) reasons.push("invalid quote clock or freshness limit (maximum 120s)");
  const providerError = String(data.status || "").toLowerCase() === "error" || Boolean(data.code);
  if (providerError) reasons.push("provider returned an API error");
  if (!symbolMatched) reasons.push(`symbol mismatch: ${returnedSymbol || "missing"} != ${expectedSymbol || "missing"}`);
  if (!micMatched) reasons.push(`MIC mismatch: ${returnedMic || "missing"} != ${expectedMic || "missing"}`);
  if (!currencyMatched) reasons.push(`currency mismatch: ${returnedCurrency || "missing"} != ${expectedCurrency || "missing"}`);

  const price = positiveNumber(data.close ?? data.price);
  if (price === null) reasons.push("invalid or missing positive price");
  const observedAt = responseTimestamp(data);
  if (!observedAt) reasons.push("missing provider market timestamp");
  const fresh = Boolean(contextValid && observedAt && isExecutionObservationFresh(observedAt, nowMs, maxAgeSeconds));
  if (observedAt && !fresh) reasons.push(`provider timestamp is older than ${maxAgeSeconds}s or is in the future`);

  const identityVerified = symbolMatched && micMatched && currencyMatched;
  const provenanceVerified = contextValid && !providerError && identityVerified && Boolean(observedAt) && price !== null;
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
      price: price!,
      observedAt,
      provenanceVerified: true,
      provenanceMethod: entitlementVerified
        ? `authenticated-exact-mic:${expectedMic};entitlement:verified-nondisplay-automated`
        : `authenticated-exact-mic:${expectedMic};entitlement:unverified-or-incomplete`,
    })
    : null;
  const evidence = normalizedEvidence
    ? { ...normalizedEvidence, exchangeMic: expectedMic, ...(eligibility === "PAPER" && entitlementVerified ? {
      paperAdmissionProof: {
        provider: "twelve-data", sourceFamily: "twelve-data", symbol: expectedSymbol,
        exchangeMic: expectedMic, currency: expectedCurrency, price: normalizedEvidence.price,
        observedAt: normalizedEvidence.observedAt, checkedAt: new Date(nowMs).toISOString(),
        evidenceRef: entitlementProof!.evidenceRef, evidenceSha256: entitlementProof!.evidenceSha256,
        validUntil: entitlementProof!.validUntil, usageScope: "NON_DISPLAY_INTERNAL" as const,
        automatedUseAllowed: true as const, dualControlVerified: true as const,
      },
    } : {}) } satisfies GlobalExecutionMarketEvidence
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

function admissionMatchesObservation(item: GlobalExecutionMarketEvidence, nowMs: number): boolean {
  const proof = item.paperAdmissionProof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof) || item.provenanceVerified !== true) return false;
  const family = typeof item.sourceFamily === "string" ? item.sourceFamily.trim().toLowerCase() : "";
  const checkedAt = typeof proof.checkedAt === "string" ? Date.parse(proof.checkedAt) : NaN;
  const validUntil = typeof proof.validUntil === "string" ? Date.parse(proof.validUntil) : NaN;
  return /^[a-z0-9][a-z0-9._-]*$/.test(family) && proof.sourceFamily === family
    && typeof proof.provider === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(proof.provider)
    && normalizeExecutionSymbol(proof.symbol) === normalizeExecutionSymbol(item.symbol)
    && normalizedMic(proof.exchangeMic) === normalizedMic(item.exchangeMic)
    && normalizedCurrency(proof.currency) === normalizedCurrency(item.currency)
    && proof.price === item.price && proof.observedAt === item.observedAt
    && Number.isFinite(checkedAt) && checkedAt <= nowMs && nowMs - checkedAt <= 120_000
    && Number.isFinite(validUntil) && validUntil > nowMs
    && typeof proof.evidenceRef === "string" && proof.evidenceRef.trim().length > 0
    && typeof proof.evidenceSha256 === "string" && SHA256.test(proof.evidenceSha256)
    && proof.usageScope === "NON_DISPLAY_INTERNAL" && proof.automatedUseAllowed === true
    && proof.dualControlVerified === true;
}

/** Preserve checked proof and session metadata; normalization alone cannot admit PAPER. */
export function deduplicateGlobalEvidence(values: readonly GlobalExecutionMarketEvidence[]): GlobalExecutionMarketEvidence[] {
  const byFamily = new Map<string, GlobalExecutionMarketEvidence>();
  for (const item of Array.isArray(values) ? values : []) {
    const exchangeMic = normalizedMic(item?.exchangeMic);
    const normalized = normalizeExecutionEvidence(item || {});
    if (!normalized || !exchangeMic) continue;
    const candidate = { ...normalized, exchangeMic, paperAdmissionProof: item.paperAdmissionProof, marketState: item.marketState };
    const key = `${candidate.symbol}:${exchangeMic}:${candidate.sourceFamily}`;
    const previous = byFamily.get(key);
    if (!previous || Date.parse(candidate.observedAt) > Date.parse(previous.observedAt)) byFamily.set(key, candidate);
  }
  return [...byFamily.values()];
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
  const contextValid = Boolean(symbol && currency && exchangeMic) && Number.isFinite(nowMs);
  const relevant = (contextValid && Array.isArray(observations) ? observations : []).filter((item) => item && typeof item === "object"
    && typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0
    && typeof item.sourceFamily === "string" && item.sourceFamily.trim().length > 0
    && normalizeExecutionSymbol(item.symbol) === symbol
    && normalizedCurrency(item.currency) === currency
    && normalizedMic(item.exchangeMic) === exchangeMic);
  let unprovenPaper = 0;
  const quorumEvidence = relevant.map((item) => {
    const gated = applyGlobalMarketStateGate(item, item.marketState, nowMs);
    const admitted = item.eligibility === "PAPER" && gated.eligibility === "PAPER" && admissionMatchesObservation(item, nowMs);
    if ((item.eligibility === "PAPER" || item.eligibility === "LIVE") && !admitted) unprovenPaper += 1;
    return { source: item.source, sourceFamily: item.sourceFamily.trim().toLowerCase(),
      eligibility: admitted ? "PAPER" as const : "VALIDATION_ONLY" as const, price: item.price, observedAt: item.observedAt };
  });
  const quorum = evaluateMarketDataQuorum(quorumEvidence, undefined, nowMs);
  const paperEligibleFamilies = quorum.sourceFamilies;
  const validationFamilies = [...new Set(relevant.filter((item) => item.eligibility === "VALIDATION_ONLY" && isExecutionObservationFresh(item.observedAt, nowMs, 120)).map((item) => item.sourceFamily.trim().toLowerCase()))].sort();
  const reasons = [...quorum.reasons];
  if (!contextValid) reasons.push("invalid instrument identity or certification clock");
  if (unprovenPaper > 0) reasons.push(`${unprovenPaper} PAPER/LIVE label(s) excluded without current observation-bound admission and exact-MIC open session proof`);
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
