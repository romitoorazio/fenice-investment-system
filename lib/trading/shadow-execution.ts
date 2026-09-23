import type { PreTradeDecision, ProposedOrder } from "./types.ts";
import type { ExecutionSafetyDecision } from "./execution-safety.ts";

export type ShadowBrokerObservation = {
  brokerConnected: boolean;
  brokerSnapshotFresh: boolean;
  reconciliationBalanced: boolean;
  observedPrice: number | null;
  observedAt: string;
};

export type ShadowExecutionRecord = {
  shadowId: string;
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  referencePrice: number;
  observedBrokerPrice: number | null;
  createdAt: string;
  status: "BLOCKED" | "SHADOW_ACCEPTED";
  transmitted: false;
  reasons: string[];
};

function makeShadowId(order: ProposedOrder): string {
  return `shadow:${order.clientOrderId}`;
}

/**
 * Produces evidence for what Fenice would have attempted after all local gates.
 * It cannot transmit or serialize a Directa write command.
 */
export function createShadowExecution(
  order: ProposedOrder,
  risk: PreTradeDecision,
  executionSafety: ExecutionSafetyDecision,
  broker: ShadowBrokerObservation,
  now = new Date().toISOString(),
): ShadowExecutionRecord {
  const reasons: string[] = [];
  if (!risk.allowed) reasons.push(...risk.reasons.map((reason) => `pretrade:${reason}`));
  if (!executionSafety.allowed) reasons.push(...executionSafety.reasons.map((reason) => `execution-safety:${reason}`));
  if (!broker.brokerConnected) reasons.push("broker:read-only connection unavailable");
  if (!broker.brokerSnapshotFresh) reasons.push("broker:read-only snapshot stale");
  if (!broker.reconciliationBalanced) reasons.push("broker:reconciliation break unresolved");
  if (!Number.isFinite(broker.observedPrice) || Number(broker.observedPrice) <= 0) reasons.push("broker:market observation unavailable");

  return {
    shadowId: makeShadowId(order),
    clientOrderId: order.clientOrderId,
    symbol: order.symbol.toUpperCase(),
    side: order.side,
    quantity: order.quantity,
    referencePrice: order.referencePrice,
    observedBrokerPrice: Number.isFinite(broker.observedPrice) ? Number(broker.observedPrice) : null,
    createdAt: now,
    status: reasons.length === 0 ? "SHADOW_ACCEPTED" : "BLOCKED",
    transmitted: false,
    reasons,
  };
}
