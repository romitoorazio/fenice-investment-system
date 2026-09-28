import { normalizeExecutionEvidence } from "./execution-market-data.ts";
import type { GlobalExecutionMarketEvidence } from "./global-market-data-certification.ts";

export type DeutscheBoerseDecimal = {
  m?: unknown;
  e?: unknown;
};

export type DeutscheBoerseCloudStreamEnvelope = {
  subs?: unknown;
  seq?: unknown;
  messages?: unknown;
};

export type DeutscheBoerseCloudStreamExpected = {
  symbol: string;
  providerSymbol: string;
  isin?: string;
  exchangeMic: "XETR";
  currency: string;
};

export type DeutscheBoerseCloudStreamValidation = {
  accepted: boolean;
  fresh: boolean;
  reasons: string[];
  evidence: GlobalExecutionMarketEvidence | null;
};

const XETRA_ETF_ETP_STREAM = "md-xetraetfetp";
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
  // Official Cloud Stream sample/recovery API uses nanosecond timestamps.
  // Require an ns-scale integer; never guess seconds/ms/us units.
  if (!/^\d{19}$/.test(raw)) return null;
  try {
    const ns = BigInt(raw);
    const ms = ns / 1_000_000n;
    const numeric = Number(ms);
    return Number.isSafeInteger(numeric) && numeric >= 1_000_000_000_000 ? numeric : null;
  } catch {
    return null;
  }
}

export function validateDeutscheBoerseXetraEtpMessage(
  envelope: DeutscheBoerseCloudStreamEnvelope,
  expected: DeutscheBoerseCloudStreamExpected,
  nowMs = Date.now(),
  maxAgeSeconds = 120,
  maxFutureSkewSeconds = 5,
): DeutscheBoerseCloudStreamValidation {
  const reasons: string[] = [];
  const stream = String(envelope?.subs ?? "").trim().toLowerCase();
  if (stream !== XETRA_ETF_ETP_STREAM) reasons.push(`unexpected Cloud Stream subject: ${stream || "missing"}`);

  const messages = Array.isArray(envelope?.messages) ? envelope.messages : [];
  if (messages.length !== 1) reasons.push("exactly one Cloud Stream market-data message required");
  const message = record(messages[0]);
  if (String(message["@type"] ?? "").trim() !== MARKET_DATA_TYPE) reasons.push("unexpected Cloud Stream message type");

  const instrument = record(message.Instrmt);
  const data = record(message.Dat);
  const marketMic = upper(instrument.MktID);
  const providerSymbol = upper(instrument.Sym);
  const currency = upper(instrument.Ccy);
  const expectedMic = upper(expected?.exchangeMic);
  const expectedProviderSymbol = upper(expected?.providerSymbol);
  const expectedIsin = upper(expected?.isin);

  if (expectedMic !== "XETR") reasons.push("validator is restricted to exact XETR Xetra ETF/ETP observations");
  if (marketMic !== "XETR" || marketMic !== expectedMic) reasons.push("Cloud Stream exact MIC mismatch");
  if (!expectedProviderSymbol || providerSymbol !== expectedProviderSymbol) reasons.push("Cloud Stream provider symbol mismatch");
  if (expectedIsin && providerSymbol !== expectedIsin) reasons.push("Cloud Stream ISIN/provider identity mismatch");
  if (!/^[A-Z]{3}$/.test(currency) || currency !== upper(expected?.currency)) reasons.push("Cloud Stream currency mismatch or missing");

  const bid = decimal(record(data.Bid).Px);
  const ask = decimal(record(data.Offer).Px);
  if (bid === null || ask === null) reasons.push("Cloud Stream positive bid and offer are required");
  if (bid !== null && ask !== null && bid > ask) reasons.push("Cloud Stream crossed bid/offer rejected");

  const status = upper(record(data.Status).Value);
  const tradingStatus = upper(record(data.TrdgStat).Value);
  if (status !== "ACTIVE") reasons.push("Cloud Stream instrument status is not ACTIVE");
  if (tradingStatus !== "CONTINUOUS") reasons.push("Cloud Stream trading status is not CONTINUOUS");

  const observedAtMs = nsEpochToMs(data.Tm);
  if (observedAtMs === null) reasons.push("Cloud Stream Tm missing or invalid nanosecond epoch");
  const futureSkewMs = observedAtMs === null ? Number.POSITIVE_INFINITY : observedAtMs - nowMs;
  const tooFarFuture = Number.isFinite(futureSkewMs) && futureSkewMs > Math.max(0, maxFutureSkewSeconds) * 1000;
  if (tooFarFuture) reasons.push(`Cloud Stream provider timestamp is more than ${maxFutureSkewSeconds}s in the future`);
  const ageMs = observedAtMs === null ? Number.POSITIVE_INFINITY : nowMs - observedAtMs;
  const fresh = Number.isFinite(ageMs)
    && ageMs >= -Math.max(0, maxFutureSkewSeconds) * 1000
    && ageMs <= Math.max(1, maxAgeSeconds) * 1000;
  if (!fresh && !tooFarFuture) reasons.push(`Cloud Stream provider timestamp exceeds ${maxAgeSeconds}s freshness window`);

  const hardFailure = reasons.length > 0;
  if (hardFailure || bid === null || ask === null || observedAtMs === null) {
    return { accepted: false, fresh, reasons, evidence: null };
  }

  const price = (bid + ask) / 2;
  const normalized = normalizeExecutionEvidence({
    symbol: upper(expected?.symbol),
    currency,
    assetClass: "etf",
    source: `Deutsche Boerse Cloud Stream Xetra ETF/ETP (${marketMic})`,
    sourceFamily: "deutsche-boerse-cloud-stream",
    eligibility: "VALIDATION_ONLY",
    price,
    observedAt: new Date(observedAtMs).toISOString(),
    provenanceVerified: true,
    provenanceMethod: `cloud-stream:${XETRA_ETF_ETP_STREAM};mktid:${marketMic};provider-symbol:${providerSymbol};timestamp-ns`,
  });
  if (!normalized) return { accepted: false, fresh, reasons: ["normalized Cloud Stream evidence rejected"], evidence: null };

  // Parsing an official realtime feed is not a licence grant. Promotion to PAPER
  // must separately pass evaluateIndependentGlobalSourceAdmission with a current,
  // hash-bound NON_DISPLAY_INTERNAL automated-use entitlement.
  return {
    accepted: true,
    fresh,
    reasons: ["Cloud Stream observation is exact-XETR validation evidence only until automated non-display entitlement is independently proven"],
    evidence: { ...normalized, exchangeMic: marketMic },
  };
}
