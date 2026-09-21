import {
  evaluateEventRisk,
  type EventRiskContext,
  type EventRiskDecision,
  type MarketRiskEvent,
} from "./event-risk-gate.ts";
import {
  DEFAULT_MARKET_DATA_QUORUM_LIMITS,
  evaluateMarketDataQuorum,
  type MarketDataEvidence,
  type MarketDataQuorumDecision,
  type MarketDataQuorumLimits,
} from "./market-data-quorum.ts";

export type OperationalGateState = "GREEN" | "CAUTION" | "BLOCKED";

export type OperationalGateDecision = {
  state: OperationalGateState;
  allowNewRisk: boolean;
  riskMultiplier: number;
  marketData: MarketDataQuorumDecision;
  eventRisk: EventRiskDecision;
  reasons: string[];
};

export type OperationalGateInput = {
  marketEvidence: readonly MarketDataEvidence[];
  events: readonly MarketRiskEvent[];
  eventContext: EventRiskContext;
  marketDataLimits?: MarketDataQuorumLimits;
  now?: number;
};

/**
 * Central pre-trade operational gate used before an order reaches the OMS.
 * It never increases risk. Missing/divergent/stale market data or a blocked
 * event window prevent new risk. High-risk event windows can only reduce size.
 */
export function evaluateOperationalGates(input: OperationalGateInput): OperationalGateDecision {
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const marketData = evaluateMarketDataQuorum(
    input.marketEvidence,
    input.marketDataLimits ?? DEFAULT_MARKET_DATA_QUORUM_LIMITS,
    now,
  );
  const eventRisk = evaluateEventRisk(input.events, { ...input.eventContext, now });
  const allowNewRisk = marketData.allowNewRisk && eventRisk.allowNewRisk;
  const riskMultiplier = allowNewRisk
    ? Math.min(1, Math.max(0, Number(eventRisk.riskMultiplier) || 0))
    : 0;
  const state: OperationalGateState = !allowNewRisk
    ? "BLOCKED"
    : marketData.state === "CAUTION" || eventRisk.state === "CAUTION"
      ? "CAUTION"
      : "GREEN";

  return {
    state,
    allowNewRisk,
    riskMultiplier,
    marketData,
    eventRisk,
    reasons: [
      ...marketData.reasons.map((reason) => `market-data: ${reason}`),
      ...eventRisk.reasons.map((reason) => `event-risk: ${reason}`),
    ],
  };
}
