import assert from "node:assert/strict";
import { LIVE_TRADING_RELEASED } from "../lib/brokers/safety.ts";
import { evaluateInstitutionalReadiness, INSTITUTIONAL_CONTROLS } from "../lib/trading/institutional-readiness.ts";
import { evaluateExecutionSafety } from "../lib/trading/execution-safety.ts";
import { reconcileWithDirecta } from "../lib/trading/broker-reconciliation.ts";
import { evaluateDirectaWatchdog } from "../lib/trading/watchdog.ts";
import { evaluateRecovery } from "../lib/trading/recovery.ts";
import { createShadowExecution } from "../lib/trading/shadow-execution.ts";
import { evaluatePreTradeRisk } from "../lib/trading/risk-engine.ts";

const now = Date.parse("2026-09-19T20:00:00.000Z");
const order = {
  clientOrderId: "shadow-001",
  symbol: "TEST",
  side: "BUY",
  orderType: "LIMIT",
  timeInForce: "DAY",
  quantity: 2,
  referencePrice: 100,
  limitPrice: 101,
  currency: "EUR",
  mode: "PAPER",
  requestedAt: new Date(now).toISOString(),
  humanConfirmed: true,
};
const risk = evaluatePreTradeRisk(order, {
  capitalEuro: 10_000,
  fxToEuro: 1,
  existingPositionNotionalEuro: 0,
  currentGrossExposureEuro: 1_000,
  dailyTurnoverEuro: 0,
  openOrders: 0,
  dataConfidence: 96,
  independentSources: 3,
  riskScore: 40,
  quoteObservedAt: new Date(now - 10_000).toISOString(),
  dataDivergent: false,
  sourceStale: false,
  killSwitchEngaged: false,
  brokerConnectivityAllowed: false,
  liveTradingReleased: false,
}, undefined, now);
assert.equal(risk.allowed, true, risk.reasons.join(" | "));

const executionSafety = evaluateExecutionSafety({
  side: "BUY",
  quantity: 2,
  orderPrice: 101,
  marketReferencePrice: 100,
  availableCashEuro: 5_000,
  orderNotionalEuro: 202,
  marketSessionOpen: true,
  quoteFresh: true,
  ordersLastMinute: 0,
  ambiguousPriorExecution: false,
});
assert.equal(executionSafety.allowed, true, executionSafety.reasons.join(" | "));

const badPrice = evaluateExecutionSafety({
  side: "BUY",
  quantity: 2,
  orderPrice: 120,
  marketReferencePrice: 100,
  availableCashEuro: 5_000,
  orderNotionalEuro: 240,
  marketSessionOpen: true,
  quoteFresh: true,
  ordersLastMinute: 0,
  ambiguousPriorExecution: false,
});
assert.equal(badPrice.allowed, false);
assert.ok(badPrice.reasons.some((reason) => reason.includes("price reasonability")));

const brokerSnapshot = {
  generatedAt: new Date(now - 2_000).toISOString(),
  source: "directa-dapi-local",
  mode: "read-only",
  host: "loopback",
  tradingPort: 10002,
  liveTradingAllowed: false,
  writeCommandsBlocked: true,
  connection: { state: "CONN_OK", datafeedEnabled: true, release: "test", healthy: true },
  account: { identifierPersisted: false, identifierPresent: true, liquidity: 5000, gainEuro: 0, openProfitLoss: 0, equity: 5000 },
  availability: { equities: 5000, equitiesMargin: 5000, derivatives: 0, derivativesMargin: 0, totalLiquidity: 5000 },
  positions: [{ ticker: "TEST", portfolioQuantity: 2, directaQuantity: 2, negotiationQuantityRaw: "", averagePrice: 100, theoreticalGain: 0, observedAt: "20:00:00" }],
  orders: [],
  errors: [],
  diagnostics: { heartbeatCount: 1, unknownMessageTypes: [], receivedMessages: 7, stockListComplete: true, orderListComplete: true },
};

const reconciliation = reconcileWithDirecta({
  positions: [{ symbol: "TEST", quantity: 2 }],
  openOrderClientIds: [],
  expectedCashEuro: 5000,
}, brokerSnapshot);
assert.equal(reconciliation.balanced, true, JSON.stringify(reconciliation.breaks));

const brokenReconciliation = reconcileWithDirecta({
  positions: [{ symbol: "TEST", quantity: 3 }],
  openOrderClientIds: [],
}, brokerSnapshot);
assert.equal(brokenReconciliation.balanced, false);
assert.ok(brokenReconciliation.breaks.some((item) => item.code === "POSITION"));

const watchdog = evaluateDirectaWatchdog(brokerSnapshot, { maxSnapshotAgeSeconds: 15 }, now);
assert.equal(watchdog.status, "HEALTHY");
assert.equal(watchdog.safeForShadow, true);

const staleWatchdog = evaluateDirectaWatchdog({ ...brokerSnapshot, generatedAt: new Date(now - 60_000).toISOString() }, { maxSnapshotAgeSeconds: 15 }, now);
assert.equal(staleWatchdog.safeForShadow, false);

const shadow = createShadowExecution(order, risk, executionSafety, {
  brokerConnected: true,
  brokerSnapshotFresh: true,
  reconciliationBalanced: true,
  observedPrice: 100.2,
  observedAt: new Date(now).toISOString(),
}, new Date(now).toISOString());
assert.equal(shadow.status, "SHADOW_ACCEPTED");
assert.equal(shadow.transmitted, false);

const blockedShadow = createShadowExecution(order, risk, executionSafety, {
  brokerConnected: true,
  brokerSnapshotFresh: false,
  reconciliationBalanced: true,
  observedPrice: 100.2,
  observedAt: new Date(now).toISOString(),
});
assert.equal(blockedShadow.status, "BLOCKED");
assert.equal(blockedShadow.transmitted, false);

const recovery = evaluateRecovery({
  auditChainValid: true,
  reconciliation,
  watchdog,
  unresolvedInternalOrders: 0,
  ambiguousExecutionState: false,
});
assert.equal(recovery.paperShadowAllowed, true);
assert.equal(recovery.liveAllowed, false);

const blockedRecovery = evaluateRecovery({
  auditChainValid: true,
  reconciliation: brokenReconciliation,
  watchdog,
  unresolvedInternalOrders: 0,
  ambiguousExecutionState: false,
});
assert.equal(blockedRecovery.paperShadowAllowed, false);

const allPass = Object.fromEntries(INSTITUTIONAL_CONTROLS.map((control) => [control.id, "PASS"]));
const readiness = evaluateInstitutionalReadiness(allPass);
assert.equal(readiness.engineeringScore, 100);
assert.equal(readiness.blockers.length, 0);
assert.equal(readiness.capitalReady, false, "Even 100% engineering controls cannot bypass the compile-time live lock.");
assert.equal(LIVE_TRADING_RELEASED, false);

const incomplete = evaluateInstitutionalReadiness({ ...allPass, "crash-recovery": "TESTING" });
assert.equal(incomplete.capitalReady, false);
assert.ok(incomplete.blockers.some((control) => control.id === "crash-recovery"));

console.log("Fenice institutional controls tests: PASS");
