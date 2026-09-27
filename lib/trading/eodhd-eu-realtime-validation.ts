import { normalizeExecutionEvidence } from "./execution-market-data.ts";
import type { GlobalExecutionMarketEvidence } from "./global-market-data-certification.ts";

export type EodhdEuRealtimeMessage = {
  s?: unknown;
  p?: unknown;
  bp?: unknown;
  ap?: unknown;
  t?: unknown;
  ms?: unknown;
};

export type EodhdEuValidationResult = {
  accepted: boolean;
  fresh: boolean;
  reasons: string[];
  evidence: GlobalExecutionMarketEvidence | null;
};

function canonicalTicker(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function validateEodhdEuRealtimeMessage(
  message: EodhdEuRealtimeMessage,
  expected: { symbol: string; providerSymbol: string; primaryMic: string; currency: string },
  nowMs = Date.now(),
  maxAgeSeconds = 120,
): EodhdEuValidationResult {
  const reasons: string[] = [];
  const returnedSymbol = canonicalTicker(message?.s);
  const expectedProviderSymbol = canonicalTicker(expected?.providerSymbol);
  if (!returnedSymbol || returnedSymbol !== expectedProviderSymbol) reasons.push("EODHD EU provider symbol mismatch");

  const tradePrice = finitePositive(message?.p);
  const bid = finitePositive(message?.bp);
  const ask = finitePositive(message?.ap);
  const price = tradePrice ?? (bid && ask ? (bid + ask) / 2 : null);
  if (!price) reasons.push("EODHD EU message has no positive trade or bid/ask price");

  const timestamp = Number(message?.t);
  const observedAtMs = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : NaN;
  if (!Number.isFinite(observedAtMs)) reasons.push("EODHD EU message timestamp missing or invalid");
  const ageMs = Number.isFinite(observedAtMs) ? Math.max(0, nowMs - observedAtMs) : Number.POSITIVE_INFINITY;
  const fresh = ageMs <= Math.max(1, maxAgeSeconds) * 1000;
  if (!fresh) reasons.push(`EODHD EU message freshness exceeds ${maxAgeSeconds}s`);

  const primaryMic = String(expected?.primaryMic || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(primaryMic)) reasons.push("primary MIC missing or invalid");

  const accepted = Boolean(returnedSymbol === expectedProviderSymbol && price && Number.isFinite(observedAtMs) && /^[A-Z0-9]{4}$/.test(primaryMic));
  // Keep the runtime gate and the normalized evidence type aligned. `accepted`
  // includes this check, but the explicit guard prevents a nullable price from
  // crossing the evidence boundary if the acceptance expression changes.
  if (!accepted || price === null) return { accepted: false, fresh, reasons, evidence: null };

  const normalized = normalizeExecutionEvidence({
    symbol: String(expected.symbol || "").trim().toUpperCase(),
    currency: String(expected.currency || "").trim().toUpperCase(),
    assetClass: "equity",
    source: `EODHD EU realtime via Cboe Europe (${expectedProviderSymbol}); cross-venue validation only`,
    sourceFamily: "eodhd-cboe-europe",
    eligibility: "VALIDATION_ONLY",
    price,
    observedAt: new Date(observedAtMs).toISOString(),
    provenanceVerified: true,
    provenanceMethod: `eodhd-eu-websocket:cboe-europe-consolidated;primary-mic-not-source:${primaryMic}`,
  });

  if (!normalized) return { accepted: false, fresh, reasons: [...reasons, "normalized evidence rejected"], evidence: null };

  reasons.push("EODHD EU realtime originates from Cboe Europe books, not the instrument primary MIC; it cannot satisfy exact-primary-MIC PAPER quorum");
  if (!fresh) reasons.push("stale realtime message retained only as validation evidence");

  return {
    accepted: true,
    fresh,
    reasons,
    evidence: {
      ...normalized,
      exchangeMic: primaryMic,
    },
  };
}
