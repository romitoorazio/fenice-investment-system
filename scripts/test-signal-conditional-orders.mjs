import assert from "node:assert/strict";
import { evaluateSignalConditionalOrder } from "../lib/trading/signal-conditional-orders.ts";

const now = "2026-09-21T22:00:00.000Z";
const normalRisk = {
  state: "NORMAL",
  allowNewRisk: true,
  riskMultiplier: 1,
  activeEventIds: [],
  reasons: [],
};
const baseOrder = {
  clientOrderId: "signal-test-1",
  symbol: "TEST",
  side: "BUY",
  quantity: 10,
  currency: "EUR",
  activationOrderType: "MARKET",
  conditions: [
    { id: "rsi", metric: "RSI_14", comparator: "LTE", threshold: 35 },
    { id: "macro", metric: "CPI_SURPRISE", comparator: "LTE", threshold: 0.1 },
  ],
};
const evidence = [
  {
    metric: "RSI_14",
    value: 31,
    observedAt: "2026-09-21T21:59:30.000Z",
    confidence: 88,
    sourceFamilies: ["market-a", "market-b"],
    divergent: false,
  },
  {
    metric: "CPI_SURPRISE",
    value: 0.05,
    observedAt: "2026-09-21T21:59:20.000Z",
    confidence: 92,
    sourceFamilies: ["macro-a", "macro-b", "macro-c"],
    divergent: false,
  },
];

{
  const decision = evaluateSignalConditionalOrder(baseOrder, evidence, normalRisk, undefined, now);
  assert.equal(decision.status, "ACTIVATED");
  assert.equal(decision.activationIntent?.mode, "PAPER");
  assert.equal(decision.activationIntent?.humanConfirmationStillRequired, true);
  assert.equal(decision.activationIntent?.requiresPreTradeRisk, true);
  assert.equal(decision.activationIntent?.requiresExecutionSafety, true);
  assert.equal(decision.activationIntent?.requiresSmartOrderRouter, true);
  assert.equal(decision.transmitted, false);
  assert.equal(decision.liveTradingAllowed, false);
}

{
  const waiting = evidence.map((item) => item.metric === "RSI_14" ? { ...item, value: 55 } : item);
  const decision = evaluateSignalConditionalOrder(baseOrder, waiting, normalRisk, undefined, now);
  assert.equal(decision.status, "WAITING");
  assert.equal(decision.activationIntent, null);
}

{
  const stale = evidence.map((item) => ({ ...item, observedAt: "2026-09-21T21:50:00.000Z" }));
  const decision = evaluateSignalConditionalOrder(baseOrder, stale, normalRisk, undefined, now);
  assert.equal(decision.status, "BLOCKED");
  assert.equal(decision.activationIntent, null);
}

{
  const divergent = evidence.map((item) => item.metric === "RSI_14" ? { ...item, divergent: true } : item);
  const decision = evaluateSignalConditionalOrder(baseOrder, divergent, normalRisk, undefined, now);
  assert.equal(decision.status, "BLOCKED");
}

{
  const singleSource = evidence.map((item) => item.metric === "CPI_SURPRISE" ? { ...item, sourceFamilies: ["macro-a"] } : item);
  const decision = evaluateSignalConditionalOrder(baseOrder, singleSource, normalRisk, undefined, now);
  assert.equal(decision.status, "BLOCKED");
}

{
  const lowConfidence = evidence.map((item) => item.metric === "RSI_14" ? { ...item, confidence: 60 } : item);
  const decision = evaluateSignalConditionalOrder(baseOrder, lowConfidence, normalRisk, undefined, now);
  assert.equal(decision.status, "BLOCKED");
}

{
  const criticalRisk = {
    state: "BLOCKED",
    allowNewRisk: false,
    riskMultiplier: 0,
    activeEventIds: ["CPI"],
    reasons: ["CRITICAL event window active"],
  };
  const decision = evaluateSignalConditionalOrder(baseOrder, evidence, criticalRisk, undefined, now);
  assert.equal(decision.status, "BLOCKED");
  assert.equal(decision.activationIntent, null);
}

{
  const order = { ...baseOrder, combinator: "ANY" };
  const decision = evaluateSignalConditionalOrder(order, evidence, normalRisk, undefined, now);
  assert.equal(decision.status, "BLOCKED", "ANY must remain disabled unless explicitly allowed by policy");
}

{
  const order = { ...baseOrder, activationOrderType: "LIMIT", limitPrice: 99.5 };
  const decision = evaluateSignalConditionalOrder(order, evidence, normalRisk, undefined, now);
  assert.equal(decision.status, "ACTIVATED");
  assert.equal(decision.activationIntent?.orderType, "LIMIT");
  assert.equal(decision.activationIntent?.limitPrice, 99.5);
}

console.log("Signal-conditioned order invariants: PASS");
