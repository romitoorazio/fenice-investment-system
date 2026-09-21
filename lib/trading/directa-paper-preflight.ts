import { normalizeExecutionSymbol, type ExecutionInstrument } from "./execution-market-data.ts";

export type DirectaPreflightInstrument = ExecutionInstrument & {
  country?: string;
};

export type DirectaPreflightSelection = {
  tickers: string[];
  rejected: Array<{ symbol: string; reason: string }>;
};

function isPilotAssetClass(value: unknown): boolean {
  return /equity|stock|etf|azione|azion/i.test(String(value || ""));
}

export function selectDirectaPaperPreflightTickers(
  instruments: readonly DirectaPreflightInstrument[],
  maxTickers = 9,
): DirectaPreflightSelection {
  const limit = Math.max(1, Math.min(90, Math.floor(Number(maxTickers) || 9)));
  const tickers: string[] = [];
  const rejected: Array<{ symbol: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const instrument of Array.isArray(instruments) ? instruments : []) {
    const symbol = normalizeExecutionSymbol(instrument?.symbol);
    if (!symbol) {
      rejected.push({ symbol: String(instrument?.symbol || ""), reason: "invalid symbol" });
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
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    tickers.push(symbol);
    if (tickers.length >= limit) break;
  }

  return { tickers, rejected };
}
