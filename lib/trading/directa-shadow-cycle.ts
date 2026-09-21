import type { DirectaReadOnlySnapshot } from "../brokers/directa-readonly.ts";
import type { ExecutionSafetyDecision } from "./execution-safety.ts";
import type { PreTradeDecision, ProposedOrder } from "./types.ts";
import {
  reconcileWithDirecta,
  type BrokerReconciliationReport,
  type InternalBrokerExpectation,
} from "./broker-reconciliation.ts";
import { createShadowExecution, type ShadowExecutionRecord } from "./shadow-execution.ts";

export type DirectaShadowMarketObservation = {
  symbol: string;
  price: number;
  observedAt: string;
  source: "directa-dapi-local" | "execution-evidence";
};

export type DirectaShadowCyclePolicy = {
  maxBrokerSnapshotAgeMs: number;
  maxMarketObservationAgeMs: number;
};

export type DirectaShadowCycleResult = {
  status: "SHADOW_READY" | "BLOCKED";
  reconciliation: BrokerReconciliationReport;
  shadow: ShadowExecutionRecord;
  brokerSnapshotFresh: boolean;
  marketObservationFresh: boolean;
  safetyBoundaryValid: boolean;
  reasons: string[];
  mode: "READ_ONLY_SHADOW";
  transmitted: false;
  liveTradingAllowed: false;
};

export const DEFAULT_DIRECTA_SHADOW_CYCLE_POLICY: DirectaShadowCyclePolicy = {
  maxBrokerSnapshotAgeMs: 15_000,
  maxMarketObservationAgeMs: 5_000,
};

function isFresh(timestamp: string, maxAgeMs: number, nowMs: number): boolean {
  const parsed = Date.parse(String(timestamp || ""));
  const age = nowMs - parsed;
  return Number.isFinite(parsed) && Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}

function validPolicy(policy: DirectaShadowCyclePolicy): boolean {
  return Number.isFinite(Number(policy.maxBrokerSnapshotAgeMs))
    && Number(policy.maxBrokerSnapshotAgeMs) > 0
    && Number.isFinite(Number(policy.maxMarketObservationAgeMs))
    && Number(policy.maxMarketObservationAgeMs) > 0;
}

function safeDirectaBoundary(snapshot: DirectaReadOnlySnapshot): boolean {
  return snapshot?.source === "directa-dapi-local"
    && snapshot?.mode === "read-only"
    && snapshot?.host === "loopback"
    && snapshot?.liveTradingAllowed === false
    && snapshot?.writeCommandsBlocked === true;
}

/**
 * Joins Directa read-only evidence, broker reconciliation and Fenice shadow execution.
 * This function does not open sockets and cannot serialize or transmit broker write commands.
 */
export function evaluateDirectaShadowCycle(
  order: ProposedOrder,
  risk: PreTradeDecision,
  executionSafety: ExecutionSafetyDecision,
  expectation: InternalBrokerExpectation,
  brokerSnapshot: DirectaReadOnlySnapshot,
  marketObservation: DirectaShadowMarketObservation,
  policy: DirectaShadowCyclePolicy = DEFAULT_DIRECTA_SHADOW_CYCLE_POLICY,
  now = new Date().toISOString(),
): DirectaShadowCycleResult {
  const nowMs = Date.parse(now);
  const reasons: string[] = [];

  if (!Number.isFinite(nowMs)) reasons.push("shadow-cycle clock invalid");
  if (!validPolicy(policy)) reasons.push("shadow-cycle freshness policy invalid");

  const safetyBoundaryValid = safeDirectaBoundary(brokerSnapshot);
  if (!safetyBoundaryValid) reasons.push("Directa read-only safety boundary invalid");

  if (order.mode !== "PAPER") reasons.push("shadow cycle accepts PAPER orders only");
  if (!order.humanConfirmed) reasons.push("human confirmation missing");

  const brokerSnapshotFresh = validPolicy(policy)
    && Number.isFinite(nowMs)
    && isFresh(brokerSnapshot?.generatedAt, policy.maxBrokerSnapshotAgeMs, nowMs);
  if (!brokerSnapshotFresh) reasons.push("Directa snapshot stale or invalid");

  const symbolMatches = String(marketObservation?.symbol || "").trim().toUpperCase()
    === String(order.symbol || "").trim().toUpperCase();
  if (!symbolMatches) reasons.push("market observation symbol mismatch");

  const marketObservationFresh = validPolicy(policy)
    && Number.isFinite(nowMs)
    && isFresh(marketObservation?.observedAt, policy.maxMarketObservationAgeMs, nowMs);
  if (!marketObservationFresh) reasons.push("market observation stale or invalid");

  const observedPrice = Number(marketObservation?.price);
  if (!Number.isFinite(observedPrice) || observedPrice <= 0) reasons.push("market observation price invalid");

  const reconciliation = reconcileWithDirecta(expectation, brokerSnapshot);
  if (!reconciliation.balanced) reasons.push("Directa reconciliation not balanced");

  const shadow = createShadowExecution(
    order,
    risk,
    executionSafety,
    {
      brokerConnected: safetyBoundaryValid && brokerSnapshot?.connection?.healthy === true,
      brokerSnapshotFresh: brokerSnapshotFresh && marketObservationFresh && symbolMatches,
      reconciliationBalanced: reconciliation.balanced,
      observedPrice: Number.isFinite(observedPrice) && observedPrice > 0 ? observedPrice : null,
      observedAt: marketObservation?.observedAt || now,
    },
    now,
  );

  if (shadow.status !== "SHADOW_ACCEPTED") reasons.push(...shadow.reasons);

  return {
    status: reasons.length === 0 ? "SHADOW_READY" : "BLOCKED",
    reconciliation,
    shadow,
    brokerSnapshotFresh,
    marketObservationFresh,
    safetyBoundaryValid,
    reasons: [...new Set(reasons)],
    mode: "READ_ONLY_SHADOW",
    transmitted: false,
    liveTradingAllowed: false,
  };
}
