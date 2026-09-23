export type DirectaEntitlementState =
  | "AVAILABLE"
  | "OPTIONAL_NOT_ENTITLED"
  | "UNKNOWN_ERROR";

export type DirectaEntitlementDecision = {
  state: DirectaEntitlementState;
  critical: boolean;
  allowMarketDataFallback: boolean;
  allowTradingWrite: false;
  reason: string;
};

/**
 * Directa market-data entitlement classifier.
 * ERR 1032 is treated as an optional datafeed not being entitled.
 * It must never unlock broker writes or weaken the trading safety gate.
 */
export function classifyDirectaDatafeedError(code?: number | null): DirectaEntitlementDecision {
  if (code === 1032) {
    return {
      state: "OPTIONAL_NOT_ENTITLED",
      critical: false,
      allowMarketDataFallback: true,
      allowTradingWrite: false,
      reason: "directa-api-datafeed-not-entitled-use-certified-independent-market-data-fallback",
    };
  }

  if (code == null) {
    return {
      state: "AVAILABLE",
      critical: false,
      allowMarketDataFallback: true,
      allowTradingWrite: false,
      reason: "no-directa-datafeed-entitlement-error-observed",
    };
  }

  return {
    state: "UNKNOWN_ERROR",
    critical: true,
    allowMarketDataFallback: false,
    allowTradingWrite: false,
    reason: `unclassified-directa-datafeed-error-${code}`,
  };
}
