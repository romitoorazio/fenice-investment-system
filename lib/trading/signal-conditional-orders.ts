import type { EventRiskDecision } from "./event-risk-gate.ts";

export type SignalComparator = "GT" | "GTE" | "LT" | "LTE" | "EQ";
export type SignalConditionCombinator = "ALL" | "ANY";

export type SignalCondition = {
  id: string;
  metric: string;
  comparator: SignalComparator;
  threshold: number;
  equalityTolerance?: number;
};

export type SignalEvidence = {
  metric: string;
  value: number;
  observedAt: string;
  confidence: number;
  sourceFamilies: string[];
  divergent: boolean;
};

export type SignalConditionalOrder = {
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  currency: string;
  activationOrderType: "MARKET" | "LIMIT";
  limitPrice?: number;
  conditions: SignalCondition[];
  combinator?: SignalConditionCombinator;
};

export type SignalActivationPolicy = {
  maxEvidenceAgeMs: number;
  minConfidence: number;
  minIndependentSourceFamilies: number;
  allowAnyCombinator: boolean;
};

export type SignalConditionResult = {
  id: string;
  metric: string;
  satisfied: boolean;
  evidenceValue: number | null;
  reasons: string[];
};

export type SignalActivationIntent = {
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  currency: string;
  orderType: "MARKET" | "LIMIT";
  limitPrice?: number;
  mode: "PAPER";
  humanConfirmationStillRequired: true;
  requiresPreTradeRisk: true;
  requiresExecutionSafety: true;
  requiresSmartOrderRouter: true;
};

export type SignalConditionalDecision = {
  status: "WAITING" | "ACTIVATED" | "BLOCKED";
  conditionResults: SignalConditionResult[];
  reasons: string[];
  activationIntent: SignalActivationIntent | null;
  eventRiskState: EventRiskDecision["state"];
  riskMultiplier: number;
  mode: "SHADOW_ONLY";
  transmitted: false;
  liveTradingAllowed: false;
};

export const DEFAULT_SIGNAL_ACTIVATION_POLICY: SignalActivationPolicy = {
  maxEvidenceAgeMs: 120_000,
  minConfidence: 70,
  minIndependentSourceFamilies: 2,
  allowAnyCombinator: false,
};

function positive(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function normalizedMetric(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function uniqueSourceFamilies(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
}

function compare(value: number, condition: SignalCondition): boolean {
  const threshold = Number(condition.threshold);
  switch (condition.comparator) {
    case "GT": return value > threshold;
    case "GTE": return value >= threshold;
    case "LT": return value < threshold;
    case "LTE": return value <= threshold;
    case "EQ": {
      const tolerance = Number.isFinite(Number(condition.equalityTolerance)) && Number(condition.equalityTolerance) >= 0
        ? Number(condition.equalityTolerance)
        : 0;
      return Math.abs(value - threshold) <= tolerance;
    }
  }
}

function validateOrder(order: SignalConditionalOrder, policy: SignalActivationPolicy): string[] {
  const reasons: string[] = [];
  if (!order.clientOrderId) reasons.push("clientOrderId is required");
  if (!String(order.symbol || "").trim()) reasons.push("symbol is required");
  if (!positive(order.quantity)) reasons.push("quantity must be positive");
  if (!String(order.currency || "").trim()) reasons.push("currency is required");
  if (!Array.isArray(order.conditions) || order.conditions.length === 0) reasons.push("at least one signal condition is required");
  if (order.activationOrderType === "LIMIT" && !positive(order.limitPrice)) reasons.push("LIMIT activation requires positive limitPrice");
  if ((order.combinator || "ALL") === "ANY" && policy.allowAnyCombinator !== true) {
    reasons.push("ANY condition combinator is disabled by fail-closed policy");
  }
  for (const condition of order.conditions || []) {
    if (!condition.id || !normalizedMetric(condition.metric)) reasons.push("every condition requires id and metric");
    if (!Number.isFinite(Number(condition.threshold))) reasons.push(`condition ${condition.id || "UNKNOWN"} threshold is invalid`);
  }
  if (!Number.isFinite(Number(policy.maxEvidenceAgeMs)) || Number(policy.maxEvidenceAgeMs) <= 0) reasons.push("invalid maxEvidenceAgeMs policy");
  if (!Number.isFinite(Number(policy.minConfidence)) || Number(policy.minConfidence) < 0 || Number(policy.minConfidence) > 100) reasons.push("invalid minConfidence policy");
  if (!Number.isFinite(Number(policy.minIndependentSourceFamilies)) || Number(policy.minIndependentSourceFamilies) < 1) reasons.push("invalid minIndependentSourceFamilies policy");
  return reasons;
}

function evaluateCondition(
  condition: SignalCondition,
  evidence: SignalEvidence | undefined,
  policy: SignalActivationPolicy,
  nowMs: number,
): SignalConditionResult {
  const reasons: string[] = [];
  if (!evidence) {
    reasons.push("evidence missing");
    return { id: condition.id, metric: normalizedMetric(condition.metric), satisfied: false, evidenceValue: null, reasons };
  }

  const value = Number(evidence.value);
  const observedAt = Date.parse(String(evidence.observedAt || ""));
  const ageMs = nowMs - observedAt;
  const confidence = Number(evidence.confidence);
  const sourceFamilies = uniqueSourceFamilies(evidence.sourceFamilies || []);

  if (!Number.isFinite(value)) reasons.push("evidence value invalid");
  if (!Number.isFinite(observedAt) || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > policy.maxEvidenceAgeMs) reasons.push("evidence stale or timestamp invalid");
  if (!Number.isFinite(confidence) || confidence < policy.minConfidence || confidence > 100) reasons.push("evidence confidence below policy or invalid");
  if (sourceFamilies.length < policy.minIndependentSourceFamilies) reasons.push("insufficient independent source families");
  if (evidence.divergent === true) reasons.push("cross-source evidence divergent");

  const conditionSatisfied = reasons.length === 0 && compare(value, condition);
  if (reasons.length === 0 && !conditionSatisfied) reasons.push("condition threshold not satisfied");
  return {
    id: condition.id,
    metric: normalizedMetric(condition.metric),
    satisfied: conditionSatisfied,
    evidenceValue: Number.isFinite(value) ? value : null,
    reasons,
  };
}

export function evaluateSignalConditionalOrder(
  order: SignalConditionalOrder,
  evidence: readonly SignalEvidence[],
  eventRisk: EventRiskDecision,
  policy: SignalActivationPolicy = DEFAULT_SIGNAL_ACTIVATION_POLICY,
  now = new Date().toISOString(),
): SignalConditionalDecision {
  const nowMs = Date.parse(now);
  const reasons = validateOrder(order, policy);
  if (!Number.isFinite(nowMs)) reasons.push("evaluation clock is invalid");

  const byMetric = new Map<string, SignalEvidence>();
  for (const item of Array.isArray(evidence) ? evidence : []) {
    const metric = normalizedMetric(item?.metric);
    if (!metric) continue;
    const existing = byMetric.get(metric);
    const itemTime = Date.parse(String(item?.observedAt || ""));
    const existingTime = existing ? Date.parse(String(existing.observedAt || "")) : Number.NEGATIVE_INFINITY;
    if (!existing || (Number.isFinite(itemTime) && itemTime > existingTime)) byMetric.set(metric, item);
  }

  const conditionResults = (order.conditions || []).map((condition) => evaluateCondition(
    condition,
    byMetric.get(normalizedMetric(condition.metric)),
    policy,
    nowMs,
  ));

  if (!eventRisk || typeof eventRisk !== "object") reasons.push("event-risk decision missing");
  else if (eventRisk.allowNewRisk !== true || eventRisk.state === "BLOCKED") reasons.push("event-risk gate blocks new risk");
  else if (!Number.isFinite(Number(eventRisk.riskMultiplier)) || Number(eventRisk.riskMultiplier) <= 0 || Number(eventRisk.riskMultiplier) > 1) reasons.push("event-risk multiplier invalid");

  const combinator = order.combinator || "ALL";
  const thresholdsSatisfied = conditionResults.length > 0 && (combinator === "ANY"
    ? conditionResults.some((result) => result.satisfied)
    : conditionResults.every((result) => result.satisfied));

  const hasUnsafeEvidence = conditionResults.some((result) => result.reasons.some((reason) =>
    reason !== "condition threshold not satisfied"
  ));

  if (reasons.length > 0 || hasUnsafeEvidence) {
    return {
      status: "BLOCKED",
      conditionResults,
      reasons,
      activationIntent: null,
      eventRiskState: eventRisk?.state || "BLOCKED",
      riskMultiplier: Number.isFinite(Number(eventRisk?.riskMultiplier)) ? Number(eventRisk.riskMultiplier) : 0,
      mode: "SHADOW_ONLY",
      transmitted: false,
      liveTradingAllowed: false,
    };
  }

  if (!thresholdsSatisfied) {
    return {
      status: "WAITING",
      conditionResults,
      reasons: ["signal conditions not yet satisfied"],
      activationIntent: null,
      eventRiskState: eventRisk.state,
      riskMultiplier: Number(eventRisk.riskMultiplier),
      mode: "SHADOW_ONLY",
      transmitted: false,
      liveTradingAllowed: false,
    };
  }

  const activationIntent: SignalActivationIntent = {
    clientOrderId: order.clientOrderId,
    symbol: String(order.symbol).trim().toUpperCase(),
    side: order.side,
    quantity: Number(order.quantity),
    currency: String(order.currency).trim().toUpperCase(),
    orderType: order.activationOrderType,
    ...(order.activationOrderType === "LIMIT" ? { limitPrice: Number(order.limitPrice) } : {}),
    mode: "PAPER",
    humanConfirmationStillRequired: true,
    requiresPreTradeRisk: true,
    requiresExecutionSafety: true,
    requiresSmartOrderRouter: true,
  };

  return {
    status: "ACTIVATED",
    conditionResults,
    reasons: [],
    activationIntent,
    eventRiskState: eventRisk.state,
    riskMultiplier: Number(eventRisk.riskMultiplier),
    mode: "SHADOW_ONLY",
    transmitted: false,
    liveTradingAllowed: false,
  };
}
