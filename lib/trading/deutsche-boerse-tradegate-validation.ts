import { normalizeExecutionEvidence } from "./execution-market-data.ts";
import type { GlobalExecutionMarketEvidence } from "./global-market-data-certification.ts";

export type TradegateCloudStreamEnvelope = {
  subs?: unknown;
  seq?: unknown;
  messages?: unknown;
};

export type TradegateExpected = {
  symbol: string;
  providerSymbol: string;
  exchangeMic: "XGAT";
  currency: string;
};

export type TradegateValidationResult = {
  accepted: boolean;
  fresh: boolean;
  reasons: string[];
  evidence: GlobalExecutionMarketEvidence | null;
};

const STREAM = "md-tradegate";
const MARKET_DATA_TYPE = "type.googleapis.com/dbag.cef.MarketData";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function upper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function decimal(value: unknown): number | null {
  const item = record(value);
  const mantissa = Number(item.m);
  const exponent = Number(item.e ?? 0);
  if (!Number.isSafeInteger(mantissa) || !Number.isInteger(exponent) || exponent < -12 || exponent > 12) return null;
  const result = mantissa * (10 ** exponent);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function nsEpochToMs(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  // DBAG Cloud Stream recovery and market-data timestamps use nanoseconds since epoch.
  // Require ns scale and never guess alternate units. String slicing keeps ES2017 compatibility.
  if (!/^\d{19}$/.test(raw)) return null;
  const millisecondsDigits = raw.slice(0, -6);
  const numeric = Number(millisecondsDigits);
  return Number.isSafeInteger(numeric) && numeric >= 1_000_000_000_000 ? numeric : null;
}

function wrappedEnum(value: unknown): string {
  const item = record(value);
  return upper(item.Value ?? value);
}

function commonStock(value: unknown): boolean {
  const normalized = upper(value);
  return normalized === "CS" || normalized === "7";
}

export function validateDeutscheBoerseTradegateMessage(
  envelope: TradegateCloudStreamEnvelope,
  expected: TradegateExpected,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
  maxFutureSkewSeconds = 5,
): TradegateValidationResult {
  const reasons: string[] = [];
  const stream = String(envelope?.subs ?? "").trim().toLowerCase();
  if (stream !== STREAM) reasons.push(`unexpected Tradegate Cloud Stream subject: ${stream || "missing"}`);

  const messages = Array.isArray(envelope?.messages) ? envelope.messages : [];
  if (messages.length !== 1) reasons.push("exactly one Tradegate market-data message required");
  const message = record(messages[0]);
  if (String(message["@type"] ?? "").trim() !== MARKET_DATA_TYPE) reasons.push("unexpected Tradegate Cloud Stream message type");

  const instrument = record(message.Instrmt);
  const data = record(message.Dat);
  const quote = record(data.Quote);
  const bidSide = record(quote.Bid);
  const offerSide = record(quote.Offer);

  const expectedMic = upper(expected?.exchangeMic);
  const marketMic = upper(instrument.MktID);
  const providerSymbol = upper(instrument.Sym);
  const expectedProviderSymbol = upper(expected?.providerSymbol);
  const currency = upper(data.Ccy ?? instrument.Ccy);

  if (expectedMic !== "XGAT") reasons.push("validator is restricted to exact XGAT Tradegate BSX observations");
  if (marketMic !== "XGAT" || marketMic !== expectedMic) reasons.push("Tradegate exact MIC mismatch");
  if (!expectedProviderSymbol || providerSymbol !== expectedProviderSymbol) reasons.push("Tradegate provider symbol mismatch");
  if (!commonStock(instrument.SecTyp)) reasons.push("Tradegate validator currently admits common-stock messages only");
  if (!/^[A-Z]{3}$/.test(currency) || currency !== upper(expected?.currency)) reasons.push("Tradegate currency mismatch or missing");

  const bid = decimal(bidSide.Px);
  const offer = decimal(offerSide.Px);
  if (bid === null || offer === null) reasons.push("Tradegate positive bid and offer are required");
  if (bid !== null && offer !== null && bid > offer) reasons.push("Tradegate crossed bid/offer rejected");

  const bidQuoteType = wrappedEnum(bidSide.MDQteTyp);
  const offerQuoteType = wrappedEnum(offerSide.MDQteTyp);
  if (bidQuoteType !== "TRADEABLE" && bidQuoteType !== "1") reasons.push("Tradegate bid is not explicitly TRADEABLE");
  if (offerQuoteType !== "TRADEABLE" && offerQuoteType !== "1") reasons.push("Tradegate offer is not explicitly TRADEABLE");

  const status = wrappedEnum(data.Status);
  const tradingStatus = wrappedEnum(data.TrdgStat);
  if (status !== "ACTIVE" && status !== "1") reasons.push("Tradegate instrument status is not ACTIVE");
  if (tradingStatus !== "CONTINUOUS" && tradingStatus !== "203") reasons.push("Tradegate trading status is not CONTINUOUS");

  const observedAtMs = nsEpochToMs(data.Tm);
  if (observedAtMs === null) reasons.push("Tradegate Tm missing or invalid nanosecond epoch");
  const futureSkewMs = observedAtMs === null ? Number.POSITIVE_INFINITY : observedAtMs - nowMs;
  const tooFarFuture = Number.isFinite(futureSkewMs) && futureSkewMs > Math.max(0, maxFutureSkewSeconds) * 1000;
  if (tooFarFuture) reasons.push(`Tradegate provider timestamp is more than ${maxFutureSkewSeconds}s in the future`);
  const ageMs = observedAtMs === null ? Number.POSITIVE_INFINITY : nowMs - observedAtMs;
  const fresh = Number.isFinite(ageMs)
    && ageMs >= -Math.max(0, maxFutureSkewSeconds) * 1000
    && ageMs <= Math.max(1, maxAgeSeconds) * 1000;
  if (!fresh && !tooFarFuture) reasons.push(`Tradegate provider timestamp exceeds ${maxAgeSeconds}s freshness window`);

  if (reasons.length > 0 || bid === null || offer === null || observedAtMs === null) {
    return { accepted: false, fresh, reasons, evidence: null };
  }

  const normalized = normalizeExecutionEvidence({
    symbol: upper(expected?.symbol),
    currency,
    assetClass: "equity",
    source: `Deutsche Boerse Cloud Stream Tradegate BSX (${marketMic})`,
    sourceFamily: "deutsche-boerse-tradegate",
    eligibility: "VALIDATION_ONLY",
    price: (bid + offer) / 2,
    observedAt: new Date(observedAtMs).toISOString(),
    provenanceVerified: true,
    provenanceMethod: `cloud-stream:${STREAM};mktid:${marketMic};provider-symbol:${providerSymbol};tradeable-bbo;timestamp-ns`,
  });
  if (!normalized) return { accepted: false, fresh, reasons: ["normalized Tradegate evidence rejected"], evidence: null };

  return {
    accepted: true,
    fresh,
    reasons: ["Tradegate BSX observation is exact-XGAT validation evidence only until technical access and automated non-display entitlement are independently proven"],
    evidence: { ...normalized, exchangeMic: marketMic },
  };
}
