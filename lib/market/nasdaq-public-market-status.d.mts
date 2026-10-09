export type NasdaqPublicMarketStatus = {
  state: "OPEN" | "CLOSED" | "UNKNOWN";
  source: "Nasdaq public market-info";
  sourceUrl: string;
  observedAt: string | null;
  confidence: "ADVISORY_ONLY";
  reason: string | null;
  executionAuthoritative: false;
  liveTradingAllowed: false;
};

export declare const NASDAQ_PUBLIC_MARKET_INFO: string;
export declare function interpretNasdaqPublicMarketInfo(
  payload: unknown,
  headers: { get(name: string): string | null },
  now?: number,
): NasdaqPublicMarketStatus;
export declare function fetchNasdaqPublicMarketStatus(
  options?: { fetcher?: typeof fetch; now?: number; signal?: AbortSignal },
): Promise<NasdaqPublicMarketStatus>;
export declare function getNasdaqPublicMarketStatus(now?: number): Promise<NasdaqPublicMarketStatus>;
