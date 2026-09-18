import assert from "node:assert/strict";
import { appendAuditEvent, verifyAuditChain } from "../lib/trading/audit-chain.ts";
import { evaluateKillSwitch } from "../lib/trading/kill-switch.ts";
import { PaperOms } from "../lib/trading/paper-oms.ts";
import { reconcilePaperExecutions } from "../lib/trading/reconciliation.ts";
import { evaluatePreTradeRisk } from "../lib/trading/risk-engine.ts";

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

const balanced = reconcilePaperExecutions([], [first], [{ symbol: "TEST", quantity: 1, averagePrice: Number(first.fillPrice), currency: "EUR" }]);
assert.equal(balanced.balanced, true);

const broken = reconcilePaperExecutions([], [first], [{ symbol: "TEST", quantity: 0, averagePrice: 0, currency: "EUR" }]);
assert.equal(broken.balanced, false);
assert.equal(broken.breaks.length, 1);

assert.equal(evaluateKillSwitch({ dataConfidence: 95 }).engaged, false);
assert.equal(evaluateKillSwitch({ dataConfidence: 80 }).engaged, true);
assert.equal(evaluateKillSwitch({ dataConfidence: 95, reconciliationBreaks: 1 }).engaged, true);

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
