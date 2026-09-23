export const REQUIRED_LIVE_TRADING_GATES = [
  "criticalSources",
  "sourceReportFreshness",
  "intelligenceReportFreshness",
  "dataQuality",
  "crossSourceValidation",
  "systemTests",
  "riskControls",
  "paperMode",
  "liveTradingLocked",
] as const;

export type LiveTradingGateName = (typeof REQUIRED_LIVE_TRADING_GATES)[number];
export type LiveTradingGateStatus = "PASS" | "FAIL" | "NOT_READY" | "NOT_VALIDATED" | "UNKNOWN";

export type LiveTradingAuthorization = {
  allowed: boolean;
  releaseLockOpen: boolean;
  humanConfirmationRequired: boolean;
  failedGates: LiveTradingGateName[];
  reasons: string[];
};

/**
 * Deliberate compile-time release lock.
 *
 * Environment variables, broker credentials or runtime configuration MUST NOT
 * be able to turn real trading on. A future reviewed code change is required
 * after every Fenice safety gate has been certified.
 */
export const LIVE_TRADING_RELEASED = false;

export function evaluateLiveTradingAuthorization(
  gates: Partial<Record<LiveTradingGateName, LiveTradingGateStatus>>,
  options: { humanConfirmationRequired?: boolean } = {},
): LiveTradingAuthorization {
  const humanConfirmationRequired = options.humanConfirmationRequired !== false;
  const failedGates = REQUIRED_LIVE_TRADING_GATES.filter((gate) => gates[gate] !== "PASS");
  const reasons: string[] = [];

  if (!LIVE_TRADING_RELEASED) {
    reasons.push("Fenice live-trading release lock is closed.");
  }
  if (failedGates.length > 0) {
    reasons.push(`Uncertified safety gates: ${failedGates.join(", ")}.`);
  }
  if (!humanConfirmationRequired) {
    reasons.push("Human confirmation cannot be disabled for live execution.");
  }

  return {
    allowed: LIVE_TRADING_RELEASED && failedGates.length === 0 && humanConfirmationRequired,
    releaseLockOpen: LIVE_TRADING_RELEASED,
    humanConfirmationRequired,
    failedGates,
    reasons,
  };
}

export function assertLiveTradingAllowed(
  gates: Partial<Record<LiveTradingGateName, LiveTradingGateStatus>>,
): void {
  const authorization = evaluateLiveTradingAuthorization(gates);
  if (!authorization.allowed) {
    throw new Error(`FENICE_LIVE_TRADING_LOCKED: ${authorization.reasons.join(" ")}`);
  }
}
