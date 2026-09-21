import { isDirectaRealtimeMarketConfirmed, parseDirectaRealtimeMarketMics } from "./directa-realtime-entitlements.ts";
import { normalizeExecutionSymbol, type ExecutionInstrument } from "./execution-market-data.ts";

export type DirectaPreflightInstrument = ExecutionInstrument & {
  country?: string;
};

export type DirectaPreflightSelection = {
  tickers: string[];
  selectedMarketMics: string[];
  rejected: Array<{ symbol: string; reason: string }>;
};

function isPilotAssetClass(value: unknown): boolean {
  return /equity|stock|etf|azione|azion/i.test(String(value || ""));
}

export function selectDirectaPaperPreflightTickers(
  instruments: readonly DirectaPreflightInstrument[],
  maxTickers = 9,
  confirmedRealtimeMarketMics: readonly string[] = [],
): DirectaPreflightSelection {
  const limit = Math.max(1, Math.min(90, Math.floor(Number(maxTickers) || 9)));
  const confirmedMics = parseDirectaRealtimeMarketMics(confirmedRealtimeMarketMics);
  const tickers: string[] = [];
  const selectedMarketMics = new Set<string>();
  const rejected: Array<{ symbol: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const instrument of Array.isArray(instruments) ? instruments : []) {
    const rawSymbol = String(instrument?.symbol || "").trim();
    if (!rawSymbol || !/^[A-Za-z0-9._-]{1,40}$/.test(rawSymbol)) {
      rejected.push({ symbol: rawSymbol, reason: "invalid symbol" });
      continue;
    }
    const symbol = normalizeExecutionSymbol(rawSymbol);
    if (!symbol) {
      rejected.push({ symbol: rawSymbol, reason: "invalid symbol" });
      continue;
    }
    if (!isPilotAssetClass(instrument?.assetClass)) {
      rejected.push({ symbol, reason: "not an equity/ETF pilot asset" });
      continue;
    }
    if (!/^[A-Z0-9._-]{1,40}$/.test(symbol)) {
      rejected.push({ symbol, reason: "not Directa datafeed-safe" });
      continue;
    }
    const mic = String(instrument?.exchangeMic || "").trim().toUpperCase();
    if (!mic) {
      rejected.push({ symbol, reason: "exchange MIC missing; Directa realtime market entitlement cannot be verified" });
      continue;
    }
    if (!isDirectaRealtimeMarketConfirmed(instrument, confirmedMics)) {
      rejected.push({ symbol, reason: `Directa realtime market entitlement not confirmed for MIC ${mic}` });
      continue;
    }
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    tickers.push(symbol);
    selectedMarketMics.add(mic);
    if (tickers.length >= limit) break;
  }

  return { tickers, selectedMarketMics: [...selectedMarketMics].sort(), rejected };
}
