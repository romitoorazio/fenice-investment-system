export type MarketSessionState = "OPEN" | "CLOSED" | "HALTED" | "UNKNOWN";

export type MarketSessionEvidence = {
  venue: string;
  state: MarketSessionState;
  source: string;
  observedAt: string;
  authoritative: boolean;
};

export type MarketSessionDecision = {
  allowed: boolean;
  reasons: string[];
  ageSeconds: number;
  state: MarketSessionState;
};

/**
 * Market-session control is deliberately provider-driven. Fenice must not
 * guess exchange holidays, extraordinary halts or early closes from weekday
 * arithmetic. Missing/stale/non-authoritative evidence fails closed.
 */
export function evaluateMarketSession(
  evidence: MarketSessionEvidence | null | undefined,
  options: { maxAgeSeconds?: number } = {},
  now = Date.now(),
): MarketSessionDecision {
  const maxAgeSeconds = Math.max(1, Number(options.maxAgeSeconds ?? 60));
  if (!evidence) {
    return { allowed: false, reasons: ["market-session evidence unavailable"], ageSeconds: 999999, state: "UNKNOWN" };
  }

  const observed = Date.parse(evidence.observedAt);
  const ageSeconds = Number.isFinite(observed) ? Math.max(0, (now - observed) / 1000) : Number.POSITIVE_INFINITY;
  const reasons: string[] = [];
  if (!evidence.authoritative) reasons.push("market-session source is not authoritative");
  if (ageSeconds > maxAgeSeconds) reasons.push("market-session evidence is stale");
  if (evidence.state === "UNKNOWN") reasons.push("market-session state is unknown");
  if (evidence.state === "CLOSED") reasons.push("market is closed");
  if (evidence.state === "HALTED") reasons.push("market or instrument is halted");

  return {
    allowed: reasons.length === 0 && evidence.state === "OPEN",
    reasons,
    ageSeconds: Number.isFinite(ageSeconds) ? Number(ageSeconds.toFixed(3)) : 999999,
    state: evidence.state,
  };
}
