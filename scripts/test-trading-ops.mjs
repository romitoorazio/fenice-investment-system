import assert from "node:assert/strict";
import { appendAuditEvent, verifyAuditChain } from "../lib/trading/audit-chain.ts";
import { evaluateKillSwitch } from "../lib/trading/kill-switch.ts";
import { applyOrderLifecycleEvent, createOrderLifecycle } from "../lib/trading/order-lifecycle.ts";
import { PaperOms } from "../lib/trading/paper-oms.ts";
import { reconcilePaperExecutions } from "../lib/trading/reconciliation.ts";
import { evaluatePreTradeRisk } from "../lib/trading/risk-engine.ts";
import { calculateTransactionCosts } from "../lib/trading/tca.ts";

const now = Date.parse("2026-09-18T18:00:00.000Z");
const baseOrder = {
  clientOrderId: "paper-0001",
  symbol: "TEST",
  side: "BUY",
  orderType: "MARKET",
  timeInForce: "DAY",
  quantity: 1,
  referencePrice: 100,
  currency: "EUR",
  mode: "PAPER",
  requestedAt: new Date(now).toISOString(),
  humanConfirmed: true,
};

const safeContext = {
  capitalEuro: 10_000,
  fxToEuro: 1,
  existingPositionNotionalEuro: 0,
  currentGrossExposureEuro: 1_000,
  dailyTurnoverEuro: 0,
  openOrders: 0,
  dataConfidence: 95,
  independentSources: 2,
  riskScore: 50,
  quoteObservedAt: new Date(now - 30_000).toISOString(),
  dataDivergent: false,
  sourceStale: false,
  killSwitchEngaged: false,
  brokerConnectivityAllowed: false,
  liveTradingReleased: false,
};

const safeRisk = evaluatePreTradeRisk(baseOrder, safeContext, undefined, now);
assert.equal(safeRisk.allowed, true, safeRisk.reasons.join(" | "));

const liveRisk = evaluatePreTradeRisk({ ...baseOrder, clientOrderId: "live-0001", mode: "LIVE" }, safeContext, undefined, now);
assert.equal(liveRisk.allowed, false);
assert.ok(liveRisk.reasons.some((reason) => reason.startsWith("mode-paper-only")));

const largeRisk = evaluatePreTradeRisk({ ...baseOrder, clientOrderId: "large-0001", quantity: 10 }, safeContext, undefined, now);
assert.equal(largeRisk.allowed, false);
assert.ok(largeRisk.reasons.some((reason) => reason.startsWith("max-order-notional")));

const shortRisk = evaluatePreTradeRisk({ ...baseOrder, clientOrderId: "short-0001", side: "SELL" }, safeContext, undefined, now);
assert.equal(shortRisk.allowed, false);
assert.ok(shortRisk.reasons.some((reason) => reason.startsWith("no-short-selling")));

const staleRisk = evaluatePreTradeRisk(baseOrder, { ...safeContext, quoteObservedAt: new Date(now - 300_000).toISOString() }, undefined, now);
assert.equal(staleRisk.allowed, false);
assert.ok(staleRisk.reasons.some((reason) => reason.startsWith("quote-freshness")));

const oms = new PaperOms({ slippageBps: 5, feeBps: 8, minimumFeeEuro: 1.5 });
const first = oms.submit(baseOrder, safeContext, now);
assert.equal(first.status, "PAPER_FILLED");
assert.equal(first.filledQuantity, 1);
assert.ok(Number(first.fillPrice) > baseOrder.referencePrice);
assert.ok(first.estimatedFeeEuro >= 1.5);

const duplicate = oms.submit({ ...baseOrder, quantity: 2 }, safeContext, now + 1_000);
assert.deepEqual(duplicate, first, "Duplicate clientOrderId must be idempotent.");
assert.equal(oms.list().length, 1);

const liveExecution = oms.submit({ ...baseOrder, clientOrderId: "live-0002", mode: "LIVE" }, safeContext, now);
assert.equal(liveExecution.status, "RISK_REJECTED");

const tca = calculateTransactionCosts([first, liveExecution]);
assert.equal(tca.fills, 1);
assert.ok(tca.totalFeesEuro >= 1.5);
assert.ok(tca.weightedSlippageBps > 0);
assert.equal(tca.implementationShortfallEuro, Number((tca.totalFeesEuro + tca.totalSlippageEuro).toFixed(4)));

const balanced = reconcilePaperExecutions([], [first], [{ symbol: "TEST", quantity: 1, averagePrice: Number(first.fillPrice), currency: "EUR" }]);
assert.equal(balanced.balanced, true);

const broken = reconcilePaperExecutions([], [first], [{ symbol: "TEST", quantity: 0, averagePrice: 0, currency: "EUR" }]);
assert.equal(broken.balanced, false);
assert.equal(broken.breaks.length, 1);

assert.equal(evaluateKillSwitch({ dataConfidence: 95 }).engaged, false);
assert.equal(evaluateKillSwitch({ dataConfidence: 80 }).engaged, true);
assert.equal(evaluateKillSwitch({ dataConfidence: 95, reconciliationBreaks: 1 }).engaged, true);
assert.equal(evaluateKillSwitch({ dataConfidence: 95, auditChainValid: false }).engaged, true);

let lifecycle = createOrderLifecycle("life-0001", 10);
lifecycle = applyOrderLifecycleEvent(lifecycle, { type: "RISK_ACCEPT" });
assert.equal(lifecycle.status, "ACCEPTED");
lifecycle = applyOrderLifecycleEvent(lifecycle, { type: "PARTIAL_FILL", fillQuantity: 4, fillPrice: 100 });
assert.equal(lifecycle.status, "PARTIALLY_FILLED");
assert.equal(lifecycle.remainingQuantity, 6);
lifecycle = applyOrderLifecycleEvent(lifecycle, { type: "REQUEST_REPLACE" });
assert.equal(lifecycle.status, "REPLACE_PENDING");
lifecycle = applyOrderLifecycleEvent(lifecycle, { type: "CONFIRM_REPLACE" });
assert.equal(lifecycle.status, "REPLACED");
assert.equal(lifecycle.replaceCount, 1);
lifecycle = applyOrderLifecycleEvent(lifecycle, { type: "FILL", fillQuantity: 6, fillPrice: 102 });
assert.equal(lifecycle.status, "FILLED");
assert.equal(lifecycle.terminal, true);
assert.equal(lifecycle.averageFillPrice, 101.2);

let cancelLifecycle = createOrderLifecycle("life-0002", 5);
cancelLifecycle = applyOrderLifecycleEvent(cancelLifecycle, { type: "RISK_ACCEPT" });
cancelLifecycle = applyOrderLifecycleEvent(cancelLifecycle, { type: "REQUEST_CANCEL" });
cancelLifecycle = applyOrderLifecycleEvent(cancelLifecycle, { type: "CONFIRM_CANCEL" });
assert.equal(cancelLifecycle.status, "CANCELLED");
assert.equal(cancelLifecycle.terminal, true);
assert.throws(
  () => applyOrderLifecycleEvent(cancelLifecycle, { type: "FILL", fillQuantity: 1, fillPrice: 100 }),
  /INVALID_ORDER_TRANSITION/,
);

let chain = [];
chain = appendAuditEvent(chain, {
  timestamp: new Date(now).toISOString(),
  eventType: "ORDER_ACCEPTED",
  entityId: baseOrder.clientOrderId,
  payload: { symbol: baseOrder.symbol, mode: baseOrder.mode },
});
chain = appendAuditEvent(chain, {
  timestamp: new Date(now + 1_000).toISOString(),
  eventType: "PAPER_FILLED",
  entityId: baseOrder.clientOrderId,
  payload: { fillPrice: first.fillPrice, quantity: first.filledQuantity },
});
assert.deepEqual(verifyAuditChain(chain), { valid: true, brokenAt: null });

const tampered = structuredClone(chain);
tampered[0].payload.symbol = "TAMPERED";
assert.equal(verifyAuditChain(tampered).valid, false);

console.log("Fenice institutional paper OMS tests: PASS");
