import { normalizeExecutionEvidence } from "./execution-market-data.ts";
import type { GlobalExecutionMarketEvidence } from "./global-market-data-certification.ts";

export type EuronextStandingData = {
  symbolIndex?: unknown;
  iSINCode?: unknown;
  mIC?: unknown;
  mICList?: unknown;
  tradingCurrency?: unknown;
  priceDecimals?: unknown;
  instrumentTradingCode?: unknown;
};

export type EuronextBboLevel = {
  price?: unknown;
  rebroadcastIndicator?: unknown;
  eventTime?: unknown;
  mDContext?: {
    packetTime?: unknown;
  } | null;
};

export type EuronextBbo = {
  symbolIndex?: unknown;
  bestBid?: EuronextBboLevel | null;
  bestOffer?: EuronextBboLevel | null;
};

export type EuronextStreamExpected = {
  symbol: string;
  isin: string;
  exchangeMic: string;
  currency: string;
  market: string;
  symbolIndex: number;
};

export type EuronextStreamValidation = {
  accepted: boolean;
  fresh: boolean;
  reasons: string[];
  evidence: GlobalExecutionMarketEvidence | null;
};

const MIC = /^[A-Z0-9]{4}$/;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function upper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function nsEpochToMs(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{19}$/.test(raw)) return null;
  try {
    const ms = BigInt(raw) / 1_000_000n;
    const numeric = Number(ms);
    return Number.isSafeInteger(numeric) && numeric >= 1_000_000_000_000 ? numeric : null;
  } catch {
    return null;
  }
}

function scaledPrice(value: unknown, decimals: number): number | null {
  const raw = Number(value);
  if (!Number.isSafeInteger(raw) || raw <= 0 || !Number.isInteger(decimals) || decimals < 0 || decimals > 12) return null;
  const result = raw / (10 ** decimals);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function expectedStandingPath(expected: EuronextStreamExpected): string {
  return `view/StandingData/${String(expected.market || "").trim().toLowerCase()}/instrument/${upper(expected.exchangeMic)}/${expected.symbolIndex}/StandingData`;
}

function expectedBboPath(expected: EuronextStreamExpected): string {
  return `view/BBO/${String(expected.market || "").trim().toLowerCase()}/${upper(expected.exchangeMic)}/${expected.symbolIndex}`;
}

function validateRealtimeLevel(
  label: string,
  level: EuronextBboLevel | null | undefined,
  nowMs: number,
  maxAgeSeconds: number,
  maxFutureSkewSeconds: number,
  reasons: string[],
): { priceRaw: unknown; packetMs: number | null; eventMs: number | null } {
  if (!level || typeof level !== "object") {
    reasons.push(`Euronext ${label} level missing`);
    return { priceRaw: null, packetMs: null, eventMs: null };
  }
  if (Number(level.rebroadcastIndicator) !== 0) reasons.push(`Euronext ${label} is rebroadcast/snapshot rather than a fresh update`);
  const eventMs = nsEpochToMs(level.eventTime);
  const packetMs = nsEpochToMs(level.mDContext?.packetTime);
  if (eventMs === null) reasons.push(`Euronext ${label} eventTime missing or invalid nanosecond epoch`);
  if (packetMs === null) reasons.push(`Euronext ${label} packetTime missing or invalid nanosecond epoch`);
  for (const [name, value] of [["eventTime", eventMs], ["packetTime", packetMs]] as const) {
    if (value === null) continue;
    const futureSkew = value - nowMs;
    if (futureSkew > Math.max(0, maxFutureSkewSeconds) * 1000) reasons.push(`Euronext ${label} ${name} is more than ${maxFutureSkewSeconds}s in the future`);
    const age = nowMs - value;
    if (age > Math.max(1, maxAgeSeconds) * 1000) reasons.push(`Euronext ${label} ${name} exceeds ${maxAgeSeconds}s freshness window`);
  }
  if (eventMs !== null && packetMs !== null && packetMs + 1000 < eventMs) {
    reasons.push(`Euronext ${label} packetTime precedes eventTime by more than 1s`);
  }
  return { priceRaw: level.price, packetMs, eventMs };
}

export function validateEuronextStreamBbo(
  input: {
    standingTopic: string;
    standingData: EuronextStandingData;
    bboTopic: string;
    bbo: EuronextBbo;
  },
  expected: EuronextStreamExpected,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
  maxFutureSkewSeconds = 5,
): EuronextStreamValidation {
  const reasons: string[] = [];
  const expectedMic = upper(expected?.exchangeMic);
  const expectedIsin = upper(expected?.isin);
  const expectedCurrency = upper(expected?.currency);
  const symbolIndex = Number(expected?.symbolIndex);
  if (!MIC.test(expectedMic)) reasons.push("Euronext exact four-character MIC required");
  if (!ISIN.test(expectedIsin)) reasons.push("Euronext valid ISIN required");
  if (!Number.isSafeInteger(symbolIndex) || symbolIndex <= 0) reasons.push("Euronext positive integer symbolIndex required");
  if (!String(expected?.market || "").trim()) reasons.push("Euronext market path required");

  if (String(input?.standingTopic || "").trim() !== expectedStandingPath(expected)) reasons.push("Euronext StandingData topic path mismatch");
  if (String(input?.bboTopic || "").trim() !== expectedBboPath(expected)) reasons.push("Euronext BBO topic path mismatch");

  const standing = input?.standingData || {};
  if (Number(standing.symbolIndex) !== symbolIndex) reasons.push("Euronext StandingData symbolIndex mismatch");
  if (upper(standing.mIC) !== expectedMic) reasons.push("Euronext StandingData exact MIC mismatch");
  if (upper(standing.iSINCode) !== expectedIsin) reasons.push("Euronext StandingData ISIN mismatch");
  if (upper(standing.tradingCurrency) !== expectedCurrency || !/^[A-Z]{3}$/.test(expectedCurrency)) reasons.push("Euronext trading currency mismatch or invalid");
  const priceDecimals = Number(standing.priceDecimals);
  if (!Number.isInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 12) reasons.push("Euronext priceDecimals missing or invalid");

  const bbo = input?.bbo || {};
  if (Number(bbo.symbolIndex) !== symbolIndex) reasons.push("Euronext BBO symbolIndex mismatch");
  const bid = validateRealtimeLevel("bestBid", bbo.bestBid, nowMs, maxAgeSeconds, maxFutureSkewSeconds, reasons);
  const offer = validateRealtimeLevel("bestOffer", bbo.bestOffer, nowMs, maxAgeSeconds, maxFutureSkewSeconds, reasons);
  const bidPrice = scaledPrice(bid.priceRaw, priceDecimals);
  const offerPrice = scaledPrice(offer.priceRaw, priceDecimals);
  if (bidPrice === null || offerPrice === null) reasons.push("Euronext positive scaled bid and offer are required");
  if (bidPrice !== null && offerPrice !== null && bidPrice > offerPrice) reasons.push("Euronext crossed bid/offer rejected");

  const times = [bid.eventMs, bid.packetMs, offer.eventMs, offer.packetMs].filter((v): v is number => v !== null);
  const fresh = times.length === 4 && times.every((value) => {
    const age = nowMs - value;
    return age >= -Math.max(0, maxFutureSkewSeconds) * 1000 && age <= Math.max(1, maxAgeSeconds) * 1000;
  });
  if (!fresh && !reasons.some((reason) => reason.includes("freshness") || reason.includes("future"))) reasons.push("Euronext BBO timestamp freshness not proven");

  if (reasons.length > 0 || bidPrice === null || offerPrice === null || times.length !== 4) {
    return { accepted: false, fresh, reasons, evidence: null };
  }

  // Use the oldest timestamp among the two sides so the evidence cannot look
  // fresher than its least-recent component.
  const observedAtMs = Math.min(...times);
  const normalized = normalizeExecutionEvidence({
    symbol: upper(expected?.symbol),
    currency: expectedCurrency,
    assetClass: "equity",
    source: `Euronext Stream API BBO (${expectedMic})`,
    sourceFamily: "euronext-stream",
    eligibility: "VALIDATION_ONLY",
    price: (bidPrice + offerPrice) / 2,
    observedAt: new Date(observedAtMs).toISOString(),
    provenanceVerified: true,
    provenanceMethod: `euronext-stream:bbo;market:${String(expected.market).trim().toLowerCase()};mic:${expectedMic};symbol-index:${symbolIndex};isin:${expectedIsin};timestamp-ns`,
  });
  if (!normalized) return { accepted: false, fresh, reasons: ["normalized Euronext Stream evidence rejected"], evidence: null };

  // Technical access is not legal-use entitlement. PAPER promotion is handled
  // separately by the independent-source admission gate and requires a current,
  // hash-bound NON_DISPLAY_INTERNAL automated-use entitlement.
  return {
    accepted: true,
    fresh,
    reasons: ["Euronext Stream observation is exact-MIC validation evidence only until automated non-display entitlement is independently proven"],
    evidence: { ...normalized, exchangeMic: expectedMic },
  };
}
