export type AlpacaPaperClockReport = {
  version: 1;
  generatedAt: string;
  configured: boolean;
  evidence: {
    venue: "US_EQUITIES";
    state: "OPEN" | "CLOSED" | "UNKNOWN";
    source: "Alpaca Paper Trading Clock";
    observedAt: string;
    authoritative: boolean;
  };
  decision: {
    allowed: boolean;
    reasons: string[];
    ageSeconds: number;
    state: "OPEN" | "CLOSED" | "UNKNOWN";
  };
  nextOpen: string | null;
  nextClose: string | null;
  diagnosticOnly: true;
  brokerConnectivityAllowed: false;
  liveTradingAllowed: false;
  error: string | null;
};
export declare const ALPACA_PAPER_CLOCK_ENDPOINT: string;
export declare function evaluateAlpacaClockResponse(data: unknown, now?: number): AlpacaPaperClockReport;
export declare function fetchAlpacaPaperClock(
  options?: {
    keyId?: string;
    secretKey?: string;
    fetcher?: typeof fetch;
    now?: number;
  },
): Promise<AlpacaPaperClockReport>;
export declare function getAlpacaPaperClock(now?: number): Promise<AlpacaPaperClockReport>;
