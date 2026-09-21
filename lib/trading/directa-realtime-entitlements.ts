import type { ExecutionInstrument } from "./execution-market-data.ts";

export type DirectaRealtimeEntitlementConfig = {
  apiRealtimeHistoricalConfirmed: boolean;
  confirmedMarketMics: string[];
};

function normalizeMic(value: unknown): string {
  const mic = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(mic) ? mic : "";
}

export function parseDirectaRealtimeMarketMics(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\s]+/g);
  return [...new Set(raw.map(normalizeMic).filter(Boolean))].sort();
}

export function readDirectaRealtimeEntitlementConfig(
  env: NodeJS.ProcessEnv = process.env,
): DirectaRealtimeEntitlementConfig {
  return {
    apiRealtimeHistoricalConfirmed: String(env.FENICE_DIRECTA_REALTIME_ENTITLEMENT_CONFIRMED || "")
      .trim()
      .toLowerCase() === "true",
    confirmedMarketMics: parseDirectaRealtimeMarketMics(env.FENICE_DIRECTA_REALTIME_MARKETS),
  };
}

export function isDirectaRealtimeMarketConfirmed(
  instrument: Pick<ExecutionInstrument, "exchangeMic">,
  confirmedMarketMics: readonly string[],
): boolean {
  const mic = normalizeMic(instrument?.exchangeMic);
  if (!mic) return false;
  return new Set(parseDirectaRealtimeMarketMics(confirmedMarketMics)).has(mic);
}

export function directaRealtimeEntitlementReason(
  instrument: Pick<ExecutionInstrument, "symbol" | "exchangeMic">,
  config: DirectaRealtimeEntitlementConfig,
): string | null {
  if (!config.apiRealtimeHistoricalConfirmed) {
    return "Directa API realtime/historical service is not explicitly confirmed";
  }
  const mic = normalizeMic(instrument?.exchangeMic);
  if (!mic) {
    return `Directa realtime market entitlement cannot be verified for ${String(instrument?.symbol || "UNKNOWN")}: exchange MIC missing`;
  }
  if (!config.confirmedMarketMics.includes(mic)) {
    return `Directa realtime market entitlement is not explicitly confirmed for MIC ${mic}`;
  }
  return null;
}
